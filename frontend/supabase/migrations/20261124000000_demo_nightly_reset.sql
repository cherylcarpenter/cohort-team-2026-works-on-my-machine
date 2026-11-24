-- FICTIONAL DEMO DATA ONLY. Nightly version of scripts/sql/reset-demo-invoices.sql.
-- Archives nonarchived BILL-1001 invoices for the ten exact demo vendor/property/
-- account combinations. Unlike the interactive script, an account mismatch or an
-- unresolved payment attempt SKIPS that invoice with a warning instead of
-- aborting, so one stuck invoice never blocks the rest of the nightly reset.
-- Missing prerequisites (unique index, paid-row trigger) still raise.

begin;

create or replace function app_private.reset_demo_invoices()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  cand record;
  archived_count integer;
  archive_ts timestamptz := transaction_timestamp();
  target_ids uuid[] := '{}';
begin
  -- Share the history seed's lock so resource/history setup cannot interleave.
  perform pg_advisory_xact_lock(2026, 110201);
  lock table public.invoices in access exclusive mode;
  lock table public.invoice_payment_attempts in share row exclusive mode;

  if not exists (
    select 1 from pg_index
    where indexrelid = to_regclass('public.invoices_vendor_property_reference_unique_idx')
      and indisunique
      and pg_get_expr(indpred, indrelid) = '(deleted_at IS NULL)'
  ) then
    raise exception 'Apply 20261104020000_allow_replacing_archived_invoices.sql first; archived invoices must not reserve their reference numbers';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.invoices'::regclass
      and tgname = 'protect_paid_invoices' and tgenabled = 'O'
  ) then
    raise exception 'The protect_paid_invoices trigger must be enabled before running this reset';
  end if;

  -- Candidate BILL-1001 invoices for the ten sample vendor/property pairs.
  -- Account mismatches and unresolved payment attempts are warned about and
  -- skipped, not fatal; everything else is collected into target_ids.
  for cand in
    with sources (vendor_name, property_name, account_number) as (
      values
        ('Alder Creek Landscaping', 'Alder Creek Workshop', '2000456700'),
        ('Brightwater Water & Sewer', 'Brightwater Print Studio', '2000456701'),
        ('Cedar Valley Pest Control', 'Cedar Valley Market', '2000456705'),
        ('Copper Ridge Waste Services', 'Copper Ridge Fabrication', '2000456702'),
        ('Harborlight Security', 'Harborlight Design Co.', '2000456706'),
        ('Maple Junction Storage', 'Maple Junction Books', '2000456708'),
        ('Northline Business Internet', 'Northline Logistics', '2000456703'),
        ('Prairie Grid HVAC Services', 'Prairie Grid Supply', '2000456707'),
        ('Summit Trail Equipment Rental', 'Summit Trail Outfitters', '2000456709'),
        ('Sunmeadow Cleaning', 'Sunmeadow Bakery', '2000456704')
    )
    select i.id, v.name as vendor_name, v.account_number,
      s.account_number as expected_account,
      (btrim(coalesce(v.account_number, '')) = s.account_number) as account_ok,
      pa.status as pending_status, pa.run_id as pending_run_id
    from public.invoices i
    join public.vendors v on v.id = i.vendor_id
    join public.properties p on p.id = i.property_id
    join sources s
      on lower(btrim(v.name)) = lower(btrim(s.vendor_name))
      and lower(btrim(p.name)) = lower(btrim(s.property_name))
    left join lateral (
      select a.status, a.run_id
      from public.invoice_payment_attempts a
      where a.invoice_id = i.id and a.status in ('starting', 'running', 'uncertain')
      order by a.created_at, a.id limit 1
    ) pa on true
    where i.deleted_at is null and lower(btrim(i.reference_number)) = 'bill-1001'
    order by i.id
  loop
    if not cand.account_ok then
      raise warning 'Demo reset skipped invoice % for vendor %: account is %, expected %.',
        cand.id, cand.vendor_name, coalesce(cand.account_number, '(missing)'), cand.expected_account;
    elsif cand.pending_status is not null then
      raise warning 'Demo reset skipped invoice %: unresolved % payment attempt (Browser Use task: %).',
        cand.id, cand.pending_status, coalesce(cand.pending_run_id::text, 'no task ID saved');
    else
      target_ids := target_ids || cand.id;
    end if;
  end loop;

  if cardinality(target_ids) = 0 then
    return 0;
  end if;

  alter table public.invoices disable trigger protect_paid_invoices;

  update public.invoices i
  set deleted_at = archive_ts, deleted_by = null
  where i.id = any (target_ids) and i.deleted_at is null;
  get diagnostics archived_count = row_count;

  alter table public.invoices enable trigger protect_paid_invoices;

  -- Annotate only the archive events created by this transaction.
  update public.audit_events e
  set reason = 'Demo reset: archived the original BILL-1001 sample to allow another upload.'
  where e.invoice_id = any (target_ids) and e.action = 'archived'
    and (e.changes -> 'deleted_at' ->> 'new')::timestamptz = archive_ts;

  return archived_count;
end;
$$;

revoke all on function app_private.reset_demo_invoices() from public, anon, authenticated;

create extension if not exists pg_cron;

-- Idempotent: replace any existing job of the same name.
select cron.unschedule(jobid) from cron.job where jobname = 'reset-demo-invoices';

-- 08:00 UTC is about 2 AM Central.
select cron.schedule('reset-demo-invoices', '0 8 * * *', $$select app_private.reset_demo_invoices()$$);

commit;
