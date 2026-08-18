BEGIN;

ALTER TABLE platform.domain_events
  ADD COLUMN aggregate_key text,
  ADD CONSTRAINT domain_events_aggregate_key_format CHECK (
    aggregate_key IS NULL OR (length(aggregate_key) BETWEEN 1 AND 200 AND aggregate_key !~ '[[:cntrl:]]')
  ),
  ADD CONSTRAINT domain_events_payload_size CHECK (octet_length(payload::text) <= 262144),
  ADD CONSTRAINT domain_events_event_tenant_unique UNIQUE (event_id, tenant_id);

CREATE TABLE platform.event_deliveries (
  event_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'PENDING' CHECK (
    state IN ('PENDING', 'PROCESSING', 'RETRY_PENDING', 'PUBLISHED', 'DEAD_LETTERED')
  ),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claim_token uuid,
  claimed_by text CHECK (claimed_by IS NULL OR claimed_by ~ '^[a-zA-Z0-9_.:-]{1,100}$'),
  lease_expires_at timestamptz,
  last_error_code text CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  broker_reference text CHECK (broker_reference IS NULL OR length(broker_reference) BETWEEN 1 AND 200),
  published_at timestamptz,
  dead_lettered_at timestamptz,
  replay_count integer NOT NULL DEFAULT 0 CHECK (replay_count BETWEEN 0 AND 10),
  last_replayed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (event_id, tenant_id) REFERENCES platform.domain_events(event_id, tenant_id) ON DELETE CASCADE,
  CHECK (
    (state = 'PROCESSING' AND claim_token IS NOT NULL AND claimed_by IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (state <> 'PROCESSING' AND claim_token IS NULL AND claimed_by IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK ((state = 'PUBLISHED') = (published_at IS NOT NULL)),
  CHECK ((state = 'DEAD_LETTERED') = (dead_lettered_at IS NOT NULL))
);

CREATE INDEX event_deliveries_claim_idx
  ON platform.event_deliveries (state, next_attempt_at, created_at)
  WHERE state IN ('PENDING', 'RETRY_PENDING', 'PROCESSING');
CREATE INDEX event_deliveries_tenant_state_idx
  ON platform.event_deliveries (tenant_id, state, updated_at DESC);
CREATE INDEX event_deliveries_published_retention_idx
  ON platform.event_deliveries (published_at, event_id) WHERE state = 'PUBLISHED';

CREATE TABLE platform.consumer_event_receipts (
  consumer_name text NOT NULL CHECK (consumer_name ~ '^[a-zA-Z0-9_.:-]{1,100}$'),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  event_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('PROCESSING', 'PROCESSED')),
  claim_token uuid,
  lease_expires_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (consumer_name, tenant_id, event_id),
  FOREIGN KEY (event_id, tenant_id) REFERENCES platform.domain_events(event_id, tenant_id) ON DELETE CASCADE,
  CHECK (
    (state = 'PROCESSING' AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL AND processed_at IS NULL)
    OR (state = 'PROCESSED' AND claim_token IS NULL AND lease_expires_at IS NULL AND processed_at IS NOT NULL)
  )
);
CREATE INDEX consumer_event_receipts_cleanup_idx
  ON platform.consumer_event_receipts (expires_at, consumer_name) WHERE state = 'PROCESSED';

CREATE TABLE platform.event_lifecycle_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id),
  event_id uuid,
  actor_user_id uuid REFERENCES platform.users(id),
  action text NOT NULL CHECK (action ~ '^platform\.events\.[a-z_]{3,80}$'),
  outcome text NOT NULL CHECK (outcome IN ('ALLOWED', 'DENIED', 'FAILED')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  correlation_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 2048
  ),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX event_lifecycle_audit_tenant_time_idx
  ON platform.event_lifecycle_audit (tenant_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION platform.initialize_event_delivery() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO platform.event_deliveries(event_id, tenant_id) VALUES (NEW.event_id, NEW.tenant_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER domain_events_initialize_delivery
AFTER INSERT ON platform.domain_events FOR EACH ROW EXECUTE FUNCTION platform.initialize_event_delivery();
INSERT INTO platform.event_deliveries(event_id, tenant_id)
SELECT event_id, tenant_id FROM platform.domain_events ON CONFLICT (event_id) DO NOTHING;

CREATE OR REPLACE FUNCTION platform.reject_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_user = (SELECT tableowner FROM pg_tables WHERE schemaname='platform' AND tablename='domain_events') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'domain events are append-only' USING ERRCODE='42501';
END;
$$;

CREATE OR REPLACE FUNCTION platform.reject_lifecycle_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'event lifecycle audit is append-only' USING ERRCODE='42501'; END;
$$;
CREATE TRIGGER event_lifecycle_audit_append_only
BEFORE UPDATE OR DELETE ON platform.event_lifecycle_audit
FOR EACH ROW EXECUTE FUNCTION platform.reject_lifecycle_audit_mutation();

CREATE OR REPLACE FUNCTION platform.claim_event_delivery_batch(
  requested_worker text, requested_batch integer, requested_lease_seconds integer
) RETURNS TABLE (
  event_id uuid, tenant_id uuid, event_type text, schema_version text, occurred_at timestamptz,
  correlation_id uuid, causation_id uuid, producer text, classification text, payload jsonb,
  aggregate_key text, claim_token uuid, attempt_count integer
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF requested_worker !~ '^[a-zA-Z0-9_.:-]{1,100}$' OR requested_batch NOT BETWEEN 1 AND 500
     OR requested_lease_seconds NOT BETWEEN 1 AND 300 THEN
    RAISE EXCEPTION 'invalid claim configuration' USING ERRCODE='22023';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT d.event_id
    FROM platform.event_deliveries d
    WHERE (d.state IN ('PENDING','RETRY_PENDING') AND d.next_attempt_at <= clock_timestamp())
       OR (d.state='PROCESSING' AND d.lease_expires_at <= clock_timestamp())
    ORDER BY d.next_attempt_at, d.created_at, d.event_id
    FOR UPDATE SKIP LOCKED LIMIT requested_batch
  ), claimed AS (
    UPDATE platform.event_deliveries d SET
      state='PROCESSING', attempt_count=d.attempt_count+1,
      claim_token=gen_random_uuid(), claimed_by=requested_worker,
      lease_expires_at=clock_timestamp()+make_interval(secs=>requested_lease_seconds),
      last_error_code=NULL, dead_lettered_at=NULL, updated_at=clock_timestamp()
    FROM candidates c WHERE d.event_id=c.event_id
    RETURNING d.event_id,d.tenant_id,d.claim_token,d.attempt_count
  )
  SELECT e.event_id,e.tenant_id,e.event_type,e.schema_version,e.occurred_at,e.correlation_id,
         e.causation_id,e.producer,e.classification,e.payload,e.aggregate_key,c.claim_token,c.attempt_count
  FROM claimed c JOIN platform.domain_events e ON e.event_id=c.event_id;
END;
$$;

CREATE OR REPLACE FUNCTION platform.event_delivery_backlog()
RETURNS TABLE (pending bigint, oldest_pending_seconds double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
 SELECT count(*)::bigint,
   COALESCE(EXTRACT(epoch FROM (clock_timestamp()-min(d.created_at))),0)::double precision
 FROM platform.event_deliveries d
 WHERE d.state IN ('PENDING','RETRY_PENDING') OR (d.state='PROCESSING' AND d.lease_expires_at<=clock_timestamp());
$$;

CREATE OR REPLACE FUNCTION platform.mark_event_published(
  requested_event uuid, requested_claim uuid, requested_broker_reference text DEFAULT NULL
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
  UPDATE platform.event_deliveries SET state='PUBLISHED',claim_token=NULL,claimed_by=NULL,
    lease_expires_at=NULL,published_at=clock_timestamp(),dead_lettered_at=NULL,
    broker_reference=requested_broker_reference,updated_at=clock_timestamp()
  WHERE event_id=requested_event AND state='PROCESSING' AND claim_token=requested_claim
    AND (requested_broker_reference IS NULL OR length(requested_broker_reference) BETWEEN 1 AND 200)
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION platform.mark_event_publish_failed(
  requested_event uuid, requested_claim uuid, requested_error_code text, requested_retryable boolean,
  requested_max_attempts integer, requested_next_attempt timestamptz
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE resulting_state text;
DECLARE resulting_tenant uuid;
DECLARE resulting_correlation uuid;
BEGIN
  IF requested_error_code !~ '^[A-Z][A-Z0-9_]{2,79}$' OR requested_max_attempts NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid failure classification' USING ERRCODE='22023';
  END IF;
  IF requested_retryable AND (requested_next_attempt <= clock_timestamp() OR requested_next_attempt > clock_timestamp()+interval '1 hour') THEN
    RAISE EXCEPTION 'invalid retry schedule' USING ERRCODE='22023';
  END IF;
  UPDATE platform.event_deliveries SET
    state=CASE WHEN requested_retryable AND attempt_count < requested_max_attempts THEN 'RETRY_PENDING' ELSE 'DEAD_LETTERED' END,
    claim_token=NULL,claimed_by=NULL,lease_expires_at=NULL,last_error_code=requested_error_code,
    next_attempt_at=CASE WHEN requested_retryable AND attempt_count < requested_max_attempts THEN requested_next_attempt ELSE next_attempt_at END,
    dead_lettered_at=CASE WHEN requested_retryable AND attempt_count < requested_max_attempts THEN NULL ELSE clock_timestamp() END,
    updated_at=clock_timestamp()
  WHERE event_id=requested_event AND state='PROCESSING' AND claim_token=requested_claim
  RETURNING state,tenant_id INTO resulting_state,resulting_tenant;
  IF resulting_state IS NULL THEN RAISE EXCEPTION 'stale event claim' USING ERRCODE='40001'; END IF;
  SELECT correlation_id INTO resulting_correlation FROM platform.domain_events WHERE event_id=requested_event;
  INSERT INTO platform.event_lifecycle_audit(tenant_id,event_id,action,outcome,reason_code,correlation_id,metadata)
  VALUES(resulting_tenant,requested_event,
    CASE WHEN resulting_state='DEAD_LETTERED' THEN 'platform.events.dead_letter' ELSE 'platform.events.publish_failure' END,
    'FAILED',requested_error_code,resulting_correlation,jsonb_build_object('state',resulting_state));
  RETURN resulting_state;
END;
$$;

CREATE OR REPLACE FUNCTION platform.acquire_consumer_receipt(
  requested_consumer text, requested_tenant uuid, requested_event uuid,
  requested_lease_seconds integer, requested_retention_seconds integer
) RETURNS TABLE (claim_token uuid, duplicate boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE existing platform.consumer_event_receipts%ROWTYPE; new_claim uuid;
BEGIN
  IF requested_consumer !~ '^[a-zA-Z0-9_.:-]{1,100}$' OR requested_lease_seconds NOT BETWEEN 1 AND 300
     OR requested_retention_seconds NOT BETWEEN 60 AND 31536000 THEN
    RAISE EXCEPTION 'invalid consumer configuration' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM platform.domain_events e WHERE e.event_id=requested_event AND e.tenant_id=requested_tenant) THEN
    RAISE EXCEPTION 'unknown tenant event' USING ERRCODE='42501';
  END IF;
  SELECT * INTO existing FROM platform.consumer_event_receipts r
   WHERE r.consumer_name=requested_consumer AND r.tenant_id=requested_tenant AND r.event_id=requested_event FOR UPDATE;
  IF FOUND AND (existing.state='PROCESSED' OR existing.lease_expires_at > clock_timestamp()) THEN
    RETURN QUERY SELECT NULL::uuid,true; RETURN;
  END IF;
  new_claim:=gen_random_uuid();
  INSERT INTO platform.consumer_event_receipts(consumer_name,tenant_id,event_id,state,claim_token,lease_expires_at,expires_at)
  VALUES(requested_consumer,requested_tenant,requested_event,'PROCESSING',new_claim,
         clock_timestamp()+make_interval(secs=>requested_lease_seconds),
         clock_timestamp()+make_interval(secs=>requested_retention_seconds))
  ON CONFLICT (consumer_name,tenant_id,event_id) DO UPDATE SET state='PROCESSING',claim_token=new_claim,
    lease_expires_at=clock_timestamp()+make_interval(secs=>requested_lease_seconds),processed_at=NULL,
    expires_at=clock_timestamp()+make_interval(secs=>requested_retention_seconds);
  RETURN QUERY SELECT new_claim,false;
END;
$$;

CREATE OR REPLACE FUNCTION platform.complete_consumer_receipt(
 requested_consumer text,requested_tenant uuid,requested_event uuid,requested_claim uuid
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
 UPDATE platform.consumer_event_receipts SET state='PROCESSED',claim_token=NULL,lease_expires_at=NULL,
   processed_at=clock_timestamp()
 WHERE consumer_name=requested_consumer AND tenant_id=requested_tenant AND event_id=requested_event
   AND state='PROCESSING' AND claim_token=requested_claim RETURNING true;
$$;
CREATE OR REPLACE FUNCTION platform.release_consumer_receipt(
 requested_consumer text,requested_tenant uuid,requested_event uuid,requested_claim uuid
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
 DELETE FROM platform.consumer_event_receipts WHERE consumer_name=requested_consumer AND tenant_id=requested_tenant
   AND event_id=requested_event AND state='PROCESSING' AND claim_token=requested_claim RETURNING true;
$$;

CREATE OR REPLACE FUNCTION platform.request_event_replay(
 requested_event uuid,requested_tenant uuid,requested_actor uuid,requested_reason text,requested_correlation uuid
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF length(trim(requested_reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid replay reason' USING ERRCODE='22023';
  END IF;
  UPDATE platform.event_deliveries SET state='RETRY_PENDING',next_attempt_at=clock_timestamp(),
    dead_lettered_at=NULL,last_replayed_at=clock_timestamp(),replay_count=replay_count+1,
    last_error_code=NULL,updated_at=clock_timestamp()
  WHERE event_id=requested_event AND tenant_id=requested_tenant AND state='DEAD_LETTERED' AND replay_count < 10;
  IF NOT FOUND THEN
    INSERT INTO platform.event_lifecycle_audit(tenant_id,event_id,actor_user_id,action,outcome,reason_code,correlation_id)
    VALUES(requested_tenant,requested_event,requested_actor,'platform.events.replay','DENIED','EVENT_NOT_REPLAYABLE',requested_correlation);
    RETURN false;
  END IF;
  INSERT INTO platform.event_lifecycle_audit(tenant_id,event_id,actor_user_id,action,outcome,reason_code,correlation_id,metadata)
  VALUES(requested_tenant,requested_event,requested_actor,'platform.events.replay','ALLOWED','AUTHORIZED_REPLAY',requested_correlation,
    jsonb_build_object('reason_length',length(trim(requested_reason))));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION platform.cleanup_published_events(
 requested_retention_seconds integer,requested_batch integer,requested_correlation uuid
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE removed integer;
BEGIN
  IF requested_retention_seconds NOT BETWEEN 60 AND 31536000 OR requested_batch NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid retention configuration' USING ERRCODE='22023';
  END IF;
  WITH candidates AS (
    SELECT d.event_id,d.tenant_id FROM platform.event_deliveries d
    WHERE d.state='PUBLISHED' AND d.published_at < clock_timestamp()-make_interval(secs=>requested_retention_seconds)
    ORDER BY d.published_at,d.event_id FOR UPDATE SKIP LOCKED LIMIT requested_batch
  ), audit_rows AS (
    INSERT INTO platform.event_lifecycle_audit(tenant_id,event_id,action,outcome,reason_code,correlation_id)
    SELECT tenant_id,event_id,'platform.events.retention_cleanup','ALLOWED','PUBLISHED_EVENT_EXPIRED',requested_correlation FROM candidates
    RETURNING event_id
  )
  DELETE FROM platform.domain_events e USING audit_rows a WHERE e.event_id=a.event_id;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

CREATE OR REPLACE FUNCTION platform.cleanup_consumer_receipts(
 requested_batch integer,requested_correlation uuid
) RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE removed integer;
BEGIN
  IF requested_batch NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'invalid cleanup batch' USING ERRCODE='22023'; END IF;
  WITH candidates AS (
    SELECT consumer_name,tenant_id,event_id FROM platform.consumer_event_receipts
    WHERE state='PROCESSED' AND expires_at < clock_timestamp()
    ORDER BY expires_at,consumer_name,tenant_id,event_id FOR UPDATE SKIP LOCKED LIMIT requested_batch
  ), deleted AS (
    DELETE FROM platform.consumer_event_receipts r USING candidates c
    WHERE r.consumer_name=c.consumer_name AND r.tenant_id=c.tenant_id AND r.event_id=c.event_id
    RETURNING r.tenant_id,r.event_id
  )
  INSERT INTO platform.event_lifecycle_audit(tenant_id,event_id,action,outcome,reason_code,correlation_id)
  SELECT tenant_id,event_id,'platform.events.idempotency_cleanup','ALLOWED','CONSUMER_RECEIPT_EXPIRED',requested_correlation FROM deleted;
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

ALTER TABLE platform.event_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.event_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.consumer_event_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.consumer_event_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.event_lifecycle_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.event_lifecycle_audit FORCE ROW LEVEL SECURITY;

CREATE POLICY event_deliveries_tenant_read ON platform.event_deliveries FOR SELECT USING (
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.events.read'));
CREATE POLICY event_lifecycle_audit_tenant_read ON platform.event_lifecycle_audit FOR SELECT USING (
 platform.has_trusted_tenant_context(tenant_id,NULL,'platform.events.read'));

INSERT INTO platform.permissions(permission_key,description) VALUES
 ('platform.events.read','Inspect tenant event delivery state'),
 ('platform.events.replay','Request controlled replay of a tenant event')
ON CONFLICT(permission_key) DO NOTHING;

REVOKE ALL ON platform.event_deliveries,platform.consumer_event_receipts,platform.event_lifecycle_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.claim_event_delivery_batch(text,integer,integer),
 platform.event_delivery_backlog(),
 platform.mark_event_published(uuid,uuid,text),platform.mark_event_publish_failed(uuid,uuid,text,boolean,integer,timestamptz),
 platform.acquire_consumer_receipt(text,uuid,uuid,integer,integer),platform.complete_consumer_receipt(text,uuid,uuid,uuid),
 platform.release_consumer_receipt(text,uuid,uuid,uuid),platform.request_event_replay(uuid,uuid,uuid,text,uuid),
 platform.cleanup_published_events(integer,integer,uuid),platform.cleanup_consumer_receipts(integer,uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO acs_event_publisher,acs_event_consumer,acs_event_operator,acs_event_retention;
GRANT EXECUTE ON FUNCTION platform.claim_event_delivery_batch(text,integer,integer),
 platform.event_delivery_backlog(),
 platform.mark_event_published(uuid,uuid,text),platform.mark_event_publish_failed(uuid,uuid,text,boolean,integer,timestamptz)
 TO acs_event_publisher;
GRANT EXECUTE ON FUNCTION platform.acquire_consumer_receipt(text,uuid,uuid,integer,integer),
 platform.complete_consumer_receipt(text,uuid,uuid,uuid),platform.release_consumer_receipt(text,uuid,uuid,uuid)
 TO acs_event_consumer;
GRANT EXECUTE ON FUNCTION platform.request_event_replay(uuid,uuid,uuid,text,uuid) TO acs_event_operator;
GRANT EXECUTE ON FUNCTION platform.cleanup_published_events(integer,integer,uuid),
 platform.cleanup_consumer_receipts(integer,uuid) TO acs_event_retention;

COMMIT;
