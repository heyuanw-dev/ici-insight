-- Phase 1: schema and integrity only. No application access policies or workflows.
begin;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (length(btrim(name)) > 0),
  email text not null check (length(btrim(email)) > 0),
  role text not null default 'user' check (role in ('user', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index users_email_unique on public.users (lower(btrim(email)));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_name_unique on public.categories (lower(btrim(name)));

create table public.presentation_slots (
  id uuid primary key default gen_random_uuid(),
  presentation_date date not null,
  slot_number smallint not null default 1 check (slot_number > 0),
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint presentation_slots_date_number_unique unique (presentation_date, slot_number)
);

create table public.presentations (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.presentation_slots(id) on delete restrict,
  presenter_user_id uuid not null references public.users(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  description text check (char_length(description) <= 500),
  category_id uuid references public.categories(id) on delete restrict,
  reference_url text check (reference_url ~* '^https?://[^[:space:]]+$'),
  cancelled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Applies to upcoming and completed presentations. Historical bookings stay occupied.
-- Cancellation and soft deletion preserve records while releasing this constraint.
create unique index presentations_one_booking_per_slot
  on public.presentations (slot_id)
  where cancelled_at is null and deleted_at is null;

create index presentations_presenter_idx on public.presentations (presenter_user_id);
create index presentations_category_idx on public.presentations (category_id);
create index presentations_slot_idx on public.presentations (slot_id);

create table public.presentation_files (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.presentations(id) on delete restrict,
  kind text not null check (kind in ('powerpoint', 'pdf')),
  bucket text not null check (length(btrim(bucket)) > 0),
  object_path text not null check (length(btrim(object_path)) > 0),
  original_filename text not null check (length(btrim(original_filename)) > 0),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint presentation_files_one_per_kind unique (presentation_id, kind),
  constraint presentation_files_object_unique unique (bucket, object_path),
  constraint presentation_files_kind_mime_check check (
    (kind = 'powerpoint' and mime_type = 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    or (kind = 'pdf' and mime_type = 'application/pdf')
  )
);

create index presentation_files_uploaded_by_idx on public.presentation_files (uploaded_by);

-- Timezone is intentionally fixed to the confirmed company requirement.
-- An explicit instant makes midnight and daylight-saving boundaries testable.
create function public.presentation_status(
  presentation_date date,
  cancelled_at timestamptz,
  as_of timestamptz default now()
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when cancelled_at is not null then 'cancelled'
    when presentation_date < (as_of at time zone 'America/Vancouver')::date then 'completed'
    else 'upcoming'
  end;
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger presentation_slots_updated_at before update on public.presentation_slots
  for each row execute function public.set_updated_at();
create trigger presentations_updated_at before update on public.presentations
  for each row execute function public.set_updated_at();

create view public.presentation_overview
with (security_invoker = true)
as
select
  p.id,
  p.slot_id,
  s.presentation_date,
  s.slot_number,
  p.presenter_user_id,
  u.name as presenter_name,
  p.title,
  p.description,
  p.category_id,
  c.name as category_name,
  p.reference_url,
  public.presentation_status(s.presentation_date, p.cancelled_at) as status,
  pptx.id as powerpoint_file_id,
  pdf.id as pdf_file_id,
  p.created_at,
  p.updated_at
from public.presentations p
join public.presentation_slots s on s.id = p.slot_id
join public.users u on u.id = p.presenter_user_id
left join public.categories c on c.id = p.category_id
left join public.presentation_files pptx on pptx.presentation_id = p.id and pptx.kind = 'powerpoint'
left join public.presentation_files pdf on pdf.presentation_id = p.id and pdf.kind = 'pdf'
where p.deleted_at is null;

comment on view public.presentation_overview is
  'Non-deleted presentations with status calculated at Vancouver midnight. Archive queries must filter status = completed; upcoming queries must filter status = upcoming.';
comment on column public.users.auth_user_id is
  'External identity link. Application user IDs and authored presentations survive identity-provider changes.';
comment on table public.presentation_files is
  'Current validated file references only. Private bucket provisioning, upload validation, replacement, and cleanup are Phase 6.';

-- Fail closed until Phase 2 supplies audited grants and ownership/admin policies.
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.presentation_slots enable row level security;
alter table public.presentations enable row level security;
alter table public.presentation_files enable row level security;

revoke all on table public.users, public.categories, public.presentation_slots,
  public.presentations, public.presentation_files, public.presentation_overview
  from public, anon, authenticated;
revoke all on function public.presentation_status(date, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

commit;
