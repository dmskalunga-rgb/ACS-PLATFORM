DO $$
DECLARE subscription_a uuid; entitlement_a uuid; usage_a uuid;
BEGIN
  SELECT id INTO subscription_a FROM commercial.subscriptions WHERE tenant_id='00000000-0000-4000-8000-000000000011' AND status='ACTIVE' LIMIT 1;
  SELECT id INTO entitlement_a FROM commercial.entitlements WHERE tenant_id='00000000-0000-4000-8000-000000000011' AND status='ACTIVE' LIMIT 1;
  SELECT id INTO usage_a FROM commercial.usage_aggregates WHERE tenant_id='00000000-0000-4000-8000-000000000011' LIMIT 1;
  IF subscription_a IS NULL OR entitlement_a IS NULL OR usage_a IS NULL THEN RAISE EXCEPTION 'Rating fixture requires Usage, Subscription and Entitlement lineage'; END IF;
  INSERT INTO commercial.rate_plans(id,tenant_id,code,name,owner_membership_id,created_by,updated_by) VALUES
    ('85000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011','fixture-a','Tenant A fixture rate plan','30000000-0000-4000-8000-000000000055','40000000-0000-4000-8000-000000000044','40000000-0000-4000-8000-000000000044'),
    ('85000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','fixture-a-draft','Tenant A draft rate plan','30000000-0000-4000-8000-000000000055','40000000-0000-4000-8000-000000000044','40000000-0000-4000-8000-000000000044');
  INSERT INTO commercial.rate_plan_versions(id,tenant_id,rate_plan_id,version_number,status,effective_from,created_by_membership_id,approved_by_membership_id,activated_by_membership_id) VALUES
    ('85100000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011','85000000-0000-4000-8000-000000000011',1,'ACTIVE',clock_timestamp()-interval '1 day','30000000-0000-4000-8000-000000000055','30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000011'),
    ('85100000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','85000000-0000-4000-8000-000000000012',1,'DRAFT',clock_timestamp()+interval '1 day','30000000-0000-4000-8000-000000000055',NULL,NULL);
  INSERT INTO commercial.rate_rules(id,tenant_id,rate_plan_version_id,measurement_type,unit,pricing_model,flat_amount) VALUES
    ('85200000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011','85100000-0000-4000-8000-000000000011','api.request','request','FLAT',1.00000000);
  INSERT INTO commercial.rate_rules(id,tenant_id,rate_plan_version_id,measurement_type,unit,pricing_model,unit_rate) VALUES
    ('85200000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','85100000-0000-4000-8000-000000000011','api.byte','byte','PER_UNIT',0.12500000);
  INSERT INTO commercial.rate_rules(id,tenant_id,rate_plan_version_id,measurement_type,unit,pricing_model) VALUES
    ('85200000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000011','85100000-0000-4000-8000-000000000011','api.compute','second','TIERED_GRADUATED');
  INSERT INTO commercial.rate_tiers(id,tenant_id,rate_rule_id,ordinal,lower_bound,upper_bound,unit_rate) VALUES
    ('85400000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011','85200000-0000-4000-8000-000000000013',1,0,100,0.10000000),
    ('85400000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000011','85200000-0000-4000-8000-000000000013',2,100,NULL,0.05000000);
  INSERT INTO commercial.rating_applicabilities(id,tenant_id,subscription_id,rate_plan_id,rate_plan_version_id,effective_from) VALUES
    ('85300000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011',subscription_a,'85000000-0000-4000-8000-000000000011','85100000-0000-4000-8000-000000000011',clock_timestamp()-interval '1 day');
  INSERT INTO commercial.rated_facts(id,tenant_id,subscription_id,entitlement_id,usage_aggregate_id,usage_window,measurement_type,quantity,unit,rate_plan_id,rate_plan_version_id,pricing_model,currency_code,rate_evidence,pre_tax_amount) VALUES
    ('85500000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000011',subscription_a,entitlement_a,usage_a,'HOURLY','api.request',1,'request','85000000-0000-4000-8000-000000000011','85100000-0000-4000-8000-000000000011','FLAT','USD','{"flat_amount":"1.00000000","rounding":"HALF_UP"}',1.0000);
  INSERT INTO commercial.rate_plans(id,tenant_id,code,name,owner_membership_id,created_by,updated_by) VALUES
    ('85000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000022','fixture-b','Tenant B fixture rate plan','30000000-0000-4000-8000-000000000088','60000000-0000-4000-8000-000000000066','60000000-0000-4000-8000-000000000066');
  INSERT INTO commercial.rate_plan_versions(id,tenant_id,rate_plan_id,version_number,status,effective_from,created_by_membership_id,approved_by_membership_id,activated_by_membership_id) VALUES
    ('85100000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000022','85000000-0000-4000-8000-000000000022',1,'ACTIVE',clock_timestamp()-interval '1 day','30000000-0000-4000-8000-000000000088',NULL,NULL);
END $$;
