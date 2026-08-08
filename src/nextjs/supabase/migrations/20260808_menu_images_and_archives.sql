alter table public.tenants add column if not exists menu_image_path text;
alter table public.tenants add column if not exists is_archived boolean not null default false;

create table if not exists public.tenant_archives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  orders jsonb not null,
  total_items integer not null default 0,
  total_amount numeric(12, 2) not null default 0,
  archived_by_line_user_id text not null references public.line_users(line_user_id) on delete restrict,
  archived_at timestamptz not null default now()
);

create index if not exists tenant_archives_tenant_idx on public.tenant_archives(tenant_id, archived_at desc);

insert into storage.buckets (id, name, public)
values ('tenant-menu-images', 'tenant-menu-images', false)
on conflict (id) do nothing;

alter table public.tenant_archives enable row level security;
