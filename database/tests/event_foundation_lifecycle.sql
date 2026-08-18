DO $$
DECLARE
  tenant_a constant uuid := '00000000-0000-4000-8000-000000000011';
  tenant_b constant uuid := '00000000-0000-4000-8000-000000000022';
  actor_a constant uuid := '10000000-0000-4000-8000-000000000011';
  event_a constant uuid := '91000000-0000-4000-8000-000000000011';
  event_b constant uuid := '91000000-0000-4000-8000-000000000022';
  claim_a uuid;
  receipt_claim uuid;
  found_event uuid;
  found_attempt integer;
  state_value text;
  changed boolean;
  removed integer;
BEGIN
  INSERT INTO platform.domain_events(event_id,event_type,tenant_id,correlation_id,payload)
  VALUES
    (event_a,'platform.test.event_created',tenant_a,'92000000-0000-4000-8000-000000000011','{"value":"safe"}'::jsonb),
    (event_b,'platform.test.event_created',tenant_b,'92000000-0000-4000-8000-000000000022','{"value":"safe"}'::jsonb);

  IF (SELECT count(*) FROM platform.event_deliveries WHERE event_id IN (event_a,event_b)) <> 2 THEN
    RAISE EXCEPTION 'outbox delivery initialization failed';
  END IF;

  SELECT c.event_id,c.claim_token,c.attempt_count INTO found_event,claim_a,found_attempt
  FROM platform.claim_event_delivery_batch('db-test-worker-a',1,30) c;
  IF found_event IS NULL OR claim_a IS NULL OR found_attempt <> 1 THEN
    RAISE EXCEPTION 'bounded claim failed';
  END IF;

  IF EXISTS (SELECT 1 FROM platform.claim_event_delivery_batch('db-test-worker-b',10,30) WHERE event_id=found_event) THEN
    RAISE EXCEPTION 'concurrent-safe claim returned an active claim twice';
  END IF;

  SELECT platform.mark_event_publish_failed(found_event,claim_a,'TRANSIENT_TEST',true,2,clock_timestamp()+interval '1 second') INTO state_value;
  IF state_value <> 'RETRY_PENDING' THEN RAISE EXCEPTION 'retry transition failed'; END IF;
  UPDATE platform.event_deliveries SET next_attempt_at=clock_timestamp() WHERE event_id=found_event;

  SELECT c.claim_token,c.attempt_count INTO claim_a,found_attempt
  FROM platform.claim_event_delivery_batch('db-test-worker-a',10,30) c WHERE c.event_id=found_event;
  IF found_attempt <> 2 THEN RAISE EXCEPTION 'retry attempt count failed'; END IF;
  SELECT platform.mark_event_publish_failed(found_event,claim_a,'TRANSIENT_TEST',true,2,clock_timestamp()+interval '1 second') INTO state_value;
  IF state_value <> 'DEAD_LETTERED' THEN RAISE EXCEPTION 'retry exhaustion did not dead-letter'; END IF;

  SELECT platform.request_event_replay(found_event,
    CASE (SELECT tenant_id FROM platform.domain_events WHERE event_id=found_event) WHEN tenant_a THEN tenant_b ELSE tenant_a END,
    actor_a,'Cross tenant replay must be denied.',gen_random_uuid()) INTO changed;
  IF changed THEN RAISE EXCEPTION 'cross-tenant replay escaped isolation'; END IF;
  SELECT platform.request_event_replay(found_event,
    (SELECT tenant_id FROM platform.domain_events WHERE event_id=found_event),actor_a,
    'Authorized controlled database replay test.',gen_random_uuid()) INTO changed;
  IF NOT changed THEN RAISE EXCEPTION 'eligible replay failed'; END IF;

  SELECT c.claim_token INTO claim_a FROM platform.claim_event_delivery_batch('db-test-worker-c',10,30) c WHERE c.event_id=found_event;
  SELECT platform.mark_event_published(found_event,claim_a,'test-only:accepted') INTO changed;
  IF NOT changed THEN RAISE EXCEPTION 'publish acknowledgement failed'; END IF;

  SELECT a.claim_token,a.duplicate INTO receipt_claim,changed
  FROM platform.acquire_consumer_receipt('db-test-consumer',
    (SELECT tenant_id FROM platform.domain_events WHERE event_id=found_event),found_event,30,60) a;
  IF receipt_claim IS NULL OR changed THEN RAISE EXCEPTION 'consumer receipt acquisition failed'; END IF;
  SELECT platform.complete_consumer_receipt('db-test-consumer',
    (SELECT tenant_id FROM platform.domain_events WHERE event_id=found_event),found_event,receipt_claim) INTO changed;
  IF NOT changed THEN RAISE EXCEPTION 'consumer receipt completion failed'; END IF;
  SELECT a.duplicate INTO changed FROM platform.acquire_consumer_receipt('db-test-consumer',
    (SELECT tenant_id FROM platform.domain_events WHERE event_id=found_event),found_event,30,60) a;
  IF NOT changed THEN RAISE EXCEPTION 'duplicate consumer event was not detected'; END IF;

  IF has_table_privilege('acs_event_publisher','platform.event_deliveries','SELECT')
     OR has_table_privilege('acs_event_operator','platform.event_deliveries','UPDATE') THEN
    RAISE EXCEPTION 'event roles have unsafe direct table privileges';
  END IF;

  UPDATE platform.event_deliveries SET published_at=clock_timestamp()-interval '120 seconds'
   WHERE event_id=found_event;
  SELECT platform.cleanup_published_events(60,10,gen_random_uuid()) INTO removed;
  IF removed <> 1 OR EXISTS(SELECT 1 FROM platform.domain_events WHERE event_id=found_event) THEN
    RAISE EXCEPTION 'published event retention cleanup failed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM platform.domain_events WHERE event_id=event_b) THEN
    RAISE EXCEPTION 'retention deleted an unqualified event';
  END IF;
  DELETE FROM platform.domain_events WHERE event_id=event_b;
END;
$$;
