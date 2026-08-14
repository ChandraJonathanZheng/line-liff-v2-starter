alter table public.tenant_orders
  add column if not exists is_paid boolean not null default false;
