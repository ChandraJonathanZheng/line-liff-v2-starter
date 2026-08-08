create table public.line_users (
  line_user_id text primary key,
  display_name text not null,
  picture_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  description text,
  owner_line_user_id text not null references public.line_users(line_user_id) on delete restrict,
  menu_image_path text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_archives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  orders jsonb not null,
  total_items integer not null default 0,
  total_amount numeric(12, 2) not null default 0,
  archived_by_line_user_id text not null references public.line_users(line_user_id) on delete restrict,
  archived_at timestamptz not null default now()
);

create table public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  line_user_id text not null references public.line_users(line_user_id) on delete cascade,
  role text not null check (role in ('owner', 'member')) default 'member',
  created_at timestamptz not null default now(),
  primary key (tenant_id, line_user_id)
);

create table public.tenant_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  menu text not null check (char_length(trim(menu)) > 0),
  quantity integer not null check (quantity > 0),
  price numeric(12, 2) not null default 0 check (price >= 0),
  notes text,
  ordered_by_line_user_id text not null references public.line_users(line_user_id) on delete restrict,
  ordered_by_name text not null,
  created_at timestamptz not null default now()
);

create table public.tenant_invites (
  token uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by_line_user_id text not null references public.line_users(line_user_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index tenant_members_user_idx on public.tenant_members(line_user_id);
create index tenant_orders_tenant_idx on public.tenant_orders(tenant_id, created_at);
create index tenant_archives_tenant_idx on public.tenant_archives(tenant_id, archived_at desc);

-- Private bucket. Menu images are served through short-lived signed URLs from the server API.
insert into storage.buckets (id, name, public)
values ('tenant-menu-images', 'tenant-menu-images', false)
on conflict (id) do nothing;

-- The browser has no direct database access. Only the server API uses the secret key.
alter table public.line_users enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.tenant_orders enable row level security;
alter table public.tenant_invites enable row level security;
alter table public.tenant_archives enable row level security;
