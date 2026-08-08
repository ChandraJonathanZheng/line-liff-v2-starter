alter table public.tenants
  add column if not exists currency_code text not null default 'TWD'
  check (currency_code in ('TWD', 'USD', 'IDR', 'SGD', 'JPY'));

alter table public.tenant_archives
  add column if not exists currency_code text not null default 'TWD'
  check (currency_code in ('TWD', 'USD', 'IDR', 'SGD', 'JPY'));
