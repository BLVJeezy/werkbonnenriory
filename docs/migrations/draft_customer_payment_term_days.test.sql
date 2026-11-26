-- SYNTHETIC TEST FIXTURE ONLY — DO NOT RUN ON THE PROJECT/PRODUCTION DATABASE.
-- Run manually on a disposable database after applying the draft migration.
-- Supply existing disposable test user IDs with psql variables:
--   admin_user_id: has public.user_roles role 'admin'
--   marketing_user_id: has public.user_roles role 'marketing', never 'admin'
-- Expected outcomes are stated next to each statement. No invoices, reminders,
-- mail, Peppol operations or existing customer records are needed or changed.

BEGIN;

INSERT INTO public.customers (name)
VALUES ('QA fallback customer')
RETURNING id AS fallback_customer_id;
-- Keep the returned UUID for the fallback check below.

-- Admin INSERT with a term: succeeds and stores 30.
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'admin_user_id', 'role', 'authenticated')::text,
  true
);
INSERT INTO public.customers (name, payment_term_days)
VALUES ('QA admin insert', 30)
RETURNING id, payment_term_days;
-- Expected: payment_term_days = 30.

-- Admin UPDATE set/clear: succeeds with 60, then NULL.
UPDATE public.customers
SET payment_term_days = 60
WHERE name = 'QA admin insert';
UPDATE public.customers
SET payment_term_days = NULL
WHERE name = 'QA admin insert'
RETURNING payment_term_days;
-- Expected: final payment_term_days IS NULL.

RESET ROLE;

-- Marketing INSERT with a non-null term: rejected with SQLSTATE 42501.
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'marketing_user_id', 'role', 'authenticated')::text,
  true
);
SAVEPOINT rejected_marketing_insert;
INSERT INTO public.customers (name, payment_term_days)
VALUES ('QA rejected marketing insert', 14);
-- Expected: ERROR Only admins may set customer payment terms (42501).
ROLLBACK TO SAVEPOINT rejected_marketing_insert;
RELEASE SAVEPOINT rejected_marketing_insert;

-- Marketing UPDATE that actually changes a term: rejected with SQLSTATE 42501.
SAVEPOINT rejected_marketing_update;
UPDATE public.customers
SET payment_term_days = 0
WHERE name = 'QA admin insert';
-- Expected: ERROR Only admins may change customer payment terms (42501).
ROLLBACK TO SAVEPOINT rejected_marketing_update;
RELEASE SAVEPOINT rejected_marketing_update;
RESET ROLE;

-- Admin establishes 30, then a marketing unrelated UPDATE must preserve it.
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'admin_user_id', 'role', 'authenticated')::text,
  true
);
UPDATE public.customers
SET payment_term_days = 30
WHERE name = 'QA admin insert';
RESET ROLE;
SET ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'marketing_user_id', 'role', 'authenticated')::text,
  true
);
UPDATE public.customers
SET phone = '+32000000000'
WHERE name = 'QA admin insert'
RETURNING phone, payment_term_days;
-- Expected: phone changed; payment_term_days remains 30.

-- NULL auth is not an admin: rejected rather than allowed as a migration/admin.
SELECT set_config('request.jwt.claims', '', true);
SAVEPOINT rejected_null_auth;
UPDATE public.customers
SET payment_term_days = 14
WHERE name = 'QA admin insert';
-- Expected: ERROR Only admins may change customer payment terms (42501).
ROLLBACK TO SAVEPOINT rejected_null_auth;
RELEASE SAVEPOINT rejected_null_auth;

RESET ROLE;

-- Fallback remains global settings.payment_days, then 14 only when absent.
SELECT COALESCE(
  c.payment_term_days,
  (SELECT s.payment_days FROM public.settings s WHERE s.id = 1),
  14
) AS effective_term_days
FROM public.customers c
WHERE c.name = 'QA fallback customer';
-- Expected: current settings.payment_days (or 14 if that setting is NULL/absent).

ROLLBACK;
