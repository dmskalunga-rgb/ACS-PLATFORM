BEGIN;
DROP FUNCTION IF EXISTS cyberdefense.validate_evidence_reference(uuid,uuid,text,text);
DELETE FROM platform.tenant_context_grants
WHERE permission_key = 'cyberdefense.evidence.reference.validate';
DELETE FROM platform.machine_principal_permissions
WHERE permission_key = 'cyberdefense.evidence.reference.validate';
DELETE FROM platform.membership_permissions
WHERE permission_key = 'cyberdefense.evidence.reference.validate';
DELETE FROM platform.permissions
WHERE permission_key = 'cyberdefense.evidence.reference.validate';
COMMIT;
