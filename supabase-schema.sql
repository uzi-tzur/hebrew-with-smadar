create table if not exists public.students (
  id bigint primary key,
  name text not null,
  parent text not null,
  phone text not null default '',
  accent text not null default 'teal',
  created_at timestamptz not null default now()
);

alter table public.students enable row level security;

create policy "Public can read students"
  on public.students for select
  using (true);

create policy "Public can insert students"
  on public.students for insert
  with check (true);

create policy "Public can update students"
  on public.students for update
  using (true)
  with check (true);

create policy "Public can delete students"
  on public.students for delete
  using (true);

create table if not exists public.classes (
  id bigint primary key,
  number text not null,
  name text not null default '',
  day text not null,
  cost numeric(10, 2) not null default 0,
  student_ids bigint[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.classes enable row level security;

create policy "Public can read classes"
  on public.classes for select
  using (true);

create policy "Public can insert classes"
  on public.classes for insert
  with check (true);

create policy "Public can update classes"
  on public.classes for update
  using (true)
  with check (true);

create policy "Public can delete classes"
  on public.classes for delete
  using (true);

create table if not exists public.attendance (
  class_id bigint not null references public.classes(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  attendance_date date not null,
  present boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id, attendance_date)
);

alter table public.attendance enable row level security;

create policy "Public can read attendance"
  on public.attendance for select
  using (true);

create policy "Public can insert attendance"
  on public.attendance for insert
  with check (true);

create policy "Public can update attendance"
  on public.attendance for update
  using (true)
  with check (true);

create policy "Public can delete attendance"
  on public.attendance for delete
  using (true);

create table if not exists public.billing (
  parent text not null,
  billing_month integer not null check (billing_month between 1 and 12),
  billing_year integer not null,
  amount_paid numeric(10, 2) not null default 0,
  payment_method text,
  balance_forward numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  primary key (parent, billing_month, billing_year)
);

alter table public.billing add column if not exists balance_forward numeric(10, 2) not null default 0;

alter table public.billing enable row level security;

create policy "Public can read billing"
  on public.billing for select
  using (true);

create policy "Public can insert billing"
  on public.billing for insert
  with check (true);

create policy "Public can update billing"
  on public.billing for update
  using (true)
  with check (true);

create policy "Public can delete billing"
  on public.billing for delete
  using (true);
