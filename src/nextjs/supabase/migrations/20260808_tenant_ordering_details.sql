alter table public.tenants
  add column if not exists ordering_deadline timestamptz,
  add column if not exists pickup_notes text,
  add column if not exists payment_notes text;
