-- ============================================================
-- SAJI GROUP — Tablas en Supabase
-- Pega este SQL en Supabase > SQL Editor > New query > Run
-- ============================================================

create table if not exists ventas (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists pagos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists gastos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists fruta (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists pedidos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists catalogos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Habilitar tiempo real en todas las tablas
alter publication supabase_realtime add table ventas;
alter publication supabase_realtime add table pagos;
alter publication supabase_realtime add table gastos;
alter publication supabase_realtime add table fruta;
alter publication supabase_realtime add table pedidos;
alter publication supabase_realtime add table catalogos;

-- Política de acceso público (para la app sin login)
alter table ventas   enable row level security;
alter table pagos    enable row level security;
alter table gastos   enable row level security;
alter table fruta    enable row level security;
alter table pedidos  enable row level security;
alter table catalogos enable row level security;

create policy "acceso_publico_ventas"    on ventas    for all using (true) with check (true);
create policy "acceso_publico_pagos"     on pagos     for all using (true) with check (true);
create policy "acceso_publico_gastos"    on gastos    for all using (true) with check (true);
create policy "acceso_publico_fruta"     on fruta     for all using (true) with check (true);
create policy "acceso_publico_pedidos"   on pedidos   for all using (true) with check (true);
create policy "acceso_publico_catalogos" on catalogos for all using (true) with check (true);

-- Tablas adicionales para catálogos separados
create table if not exists catalogos_clientes (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists catalogos_productos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);
create table if not exists catalogos_proveedores (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

alter publication supabase_realtime add table catalogos_clientes;
alter publication supabase_realtime add table catalogos_productos;
alter publication supabase_realtime add table catalogos_proveedores;

alter table catalogos_clientes   enable row level security;
alter table catalogos_productos  enable row level security;
alter table catalogos_proveedores enable row level security;

create policy "pub_cat_cli"  on catalogos_clientes   for all using (true) with check (true);
create policy "pub_cat_pro"  on catalogos_productos  for all using (true) with check (true);
create policy "pub_cat_prov" on catalogos_proveedores for all using (true) with check (true);
