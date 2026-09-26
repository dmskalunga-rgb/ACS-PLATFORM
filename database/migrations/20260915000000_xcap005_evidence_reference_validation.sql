BEGIN;

INSERT INTO platform.permissions(permission_key, description)
VALUES ('cyberdefense.evidence.reference.validate',
        'Validate one tenant-bound evidence reference without reading evidence metadata or content.')
ON CONFLICT (permission_key) DO NOTHING;

-- The caller receives EXECUTE only. No SELECT policy or table grant is extended for
-- the validation permission; XCAP-005 remains the sole evidence read authority.
CREATE FUNCTION cyberdefense.validate_evidence_reference(
  requested_tenant uuid,
  requested_evidence uuid,
  request_id text,
  correlation_id text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
  authenticated_machine uuid;
  valid_reference boolean;
BEGIN
  SELECT g.machine_principal_id INTO authenticated_machine
  FROM platform.tenant_context_grants g
  WHERE g.token = CASE
      WHEN current_setting('app.context_token',true) ~ '^[0-9a-f-]{36}$'
      THEN current_setting('app.context_token',true)::uuid
    END
    AND g.tenant_id = requested_tenant
    AND g.permission_key = 'cyberdefense.evidence.reference.validate'
    AND g.principal_kind = 'MACHINE'
    AND g.machine_principal_id IS NOT NULL
    AND g.activated_backend_pid = pg_backend_pid()
    AND g.activated_transaction_id = txid_current()
    AND g.activated_at IS NOT NULL
    AND g.expires_at > clock_timestamp();
  IF authenticated_machine IS NULL THEN
    RAISE EXCEPTION 'Evidence reference validation is unavailable.' USING ERRCODE='42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM cyberdefense.evidence_records r
    WHERE r.tenant_id = requested_tenant AND r.evidence_id = requested_evidence
      AND NOT EXISTS (
        SELECT 1 FROM cyberdefense.evidence_custody_entries c
        WHERE c.tenant_id = r.tenant_id AND c.evidence_id = r.evidence_id
          AND c.action = 'QUARANTINE'
      )
      AND NOT EXISTS (
        SELECT 1 FROM cyberdefense.evidence_retention_bindings b
        WHERE b.tenant_id = r.tenant_id AND b.evidence_id = r.evidence_id
          AND b.action = 'DESTRUCTION_AUTHORIZED'
      )
      AND NOT EXISTS (
        SELECT 1 FROM cyberdefense.evidence_integrity_verifications v
        WHERE v.tenant_id = r.tenant_id AND v.evidence_id = r.evidence_id
          AND v.outcome <> 'VERIFIED'
          AND v.verified_at = (
            SELECT max(latest.verified_at)
            FROM cyberdefense.evidence_integrity_verifications latest
            WHERE latest.tenant_id = v.tenant_id AND latest.evidence_id = v.evidence_id
          )
      )
  ) INTO valid_reference;

  INSERT INTO platform.audit_logs(
    id,tenant_id,actor_user_id,actor_kind,machine_principal_id,
    action,resource,outcome,correlation_id,request_id,metadata
  ) VALUES (
    gen_random_uuid(),requested_tenant,NULL,'MACHINE',authenticated_machine,
    'cyberdefense.evidence.reference.validate','cyberdefense:evidence:reference-validation',
    'ALLOWED',correlation_id,request_id,
    jsonb_build_object('validation_result',CASE WHEN valid_reference THEN 'VALID' ELSE 'INVALID' END)
  );
  RETURN valid_reference;
END $$;

REVOKE ALL ON FUNCTION cyberdefense.validate_evidence_reference(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cyberdefense.validate_evidence_reference(uuid,uuid,text,text)
  TO acs_xcap005_evidence;

COMMIT;
