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
  owner_line_user_id text not null references public.line_users(line_user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

-- The browser has no direct database access. Only the server API uses the secret key.
alter table public.line_users enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.tenant_orders enable row level security;
alter table public.tenant_invites enable row level security;
