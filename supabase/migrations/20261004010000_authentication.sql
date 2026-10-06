-- Phase 2: employee identity and read authorization. Business mutations stay closed.
begin;

alter table public.users add column password_setup_required boolean not null default true;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Only administrator-issued Auth invitations create application membership.
-- Auth user_metadata is editable by its owner: never take a role or active flag from it.
create function private.sync_invited_employee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  password_changed boolean := false;
begin
  -- Accepting an invitation also installs an unknown random password in Auth.
  -- Only a later password change on an already-confirmed identity finishes setup.
  if tg_op = 'UPDATE' then
    password_changed := old.email_confirmed_at is not null
      and new.encrypted_password is distinct from old.encrypted_password
      and coalesce(new.encrypted_password, '') <> '';
  end if;
  if new.email is null then
    return new;
  end if;

  if new.invited_at is not null then
    insert into public.users (auth_user_id, name, email, password_setup_required)
    values (
      new.id,
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
      new.email,
      not password_changed
    )
    on conflict (auth_user_id) do update set
      email = excluded.email,
      password_setup_required = case when password_changed then false else public.users.password_setup_required end;
  else
    -- Preserve explicitly provisioned existing profiles without creating new membership.
    update public.users set
      email = new.email,
      password_setup_required = case when password_changed then false else password_setup_required end
    where auth_user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.sync_invited_employee() from public, anon, authenticated;

create trigger sync_invited_employee
  after insert or update of email, encrypted_password, invited_at on auth.users
  for each row execute function private.sync_invited_employee();

-- Existing invited employees are provisioned when upgrading a local/hosted database.
insert into public.users (auth_user_id, name, email, password_setup_required)
select id,
  coalesce(nullif(btrim(raw_user_meta_data ->> 'name'), ''), split_part(email, '@', 1)),
  email,
  true
from auth.users
where invited_at is not null and email is not null
on conflict (auth_user_id) do update set
  email = excluded.email,
  password_setup_required = public.users.password_setup_required;

-- Security-definer helpers avoid recursive users policies. They accept no caller-supplied
-- identity or role, use a fixed search path, and resolve the verified JWT's identity.
create function private.current_employee_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select u.id
  from public.users u join auth.users a on a.id = u.auth_user_id
  where u.auth_user_id = (select auth.uid())
    and u.is_active and not u.password_setup_required
    and a.email_confirmed_at is not null
    and a.is_anonymous is not true
    and a.deleted_at is null
    and (a.banned_until is null or a.banned_until <= now());
$$;

create function private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users
    where id = (select private.current_employee_id()) and role = 'admin'
  );
$$;

create function private.can_edit_presentation(target_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.presentations p
    join public.presentation_slots s on s.id = p.slot_id
    where p.id = target_id and p.deleted_at is null
      and (select private.current_employee_id()) is not null
      and (
        (select private.is_admin())
        or (
          p.presenter_user_id = (select private.current_employee_id())
          and p.cancelled_at is null
          and s.presentation_date >= (now() at time zone 'America/Vancouver')::date
        )
      )
  );
$$;

create function private.can_manage_presentation_files(target_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.presentations p
    where p.id = target_id and p.deleted_at is null
      and (select private.current_employee_id()) is not null
      and ((select private.is_admin()) or p.presenter_user_id = (select private.current_employee_id()))
  );
$$;

revoke all on function private.current_employee_id(), private.is_admin(),
  private.can_edit_presentation(uuid), private.can_manage_presentation_files(uuid)
  from public, anon, authenticated;
grant execute on function private.current_employee_id(), private.is_admin(),
  private.can_edit_presentation(uuid), private.can_manage_presentation_files(uuid)
  to authenticated;

create policy employee_profiles_read on public.users for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select private.current_employee_id()) is not null);
create policy employee_categories_read on public.categories for select to authenticated
  using ((select private.current_employee_id()) is not null);
create policy employee_slots_read on public.presentation_slots for select to authenticated
  using ((select private.current_employee_id()) is not null);
create policy employee_presentations_read on public.presentations for select to authenticated
  using ((select private.current_employee_id()) is not null and deleted_at is null);
create policy employee_file_metadata_read on public.presentation_files for select to authenticated
  using (
    (select private.current_employee_id()) is not null
    and exists (select 1 from public.presentations p where p.id = presentation_id and p.deleted_at is null)
  );

grant usage on schema public to authenticated;
grant select on public.users, public.categories, public.presentation_slots,
  public.presentations, public.presentation_files, public.presentation_overview to authenticated;
grant execute on function public.presentation_status(date, timestamptz, timestamptz) to authenticated;

-- Read-only permission lookup for server guards. No booking/editing/upload endpoint.
create function public.presentation_permissions(presentation_id uuid)
returns table (can_edit_metadata boolean, can_manage_files boolean)
language sql stable security invoker
set search_path = ''
as $$
  select private.can_edit_presentation(p.id), private.can_manage_presentation_files(p.id)
  from public.presentations p where p.id = presentation_id;
$$;
revoke all on function public.presentation_permissions(uuid) from public, anon;
grant execute on function public.presentation_permissions(uuid) to authenticated;

-- Even application administrators cannot bypass unfinished workflow invariants through
-- direct Data API writes. Later workflow migrations must grant only the operations needed.
revoke insert, update, delete, truncate, references, trigger
  on public.users, public.categories, public.presentation_slots,
  public.presentations, public.presentation_files from public, anon, authenticated;

comment on column public.users.password_setup_required is
  'Cleared by a password change after email confirmation, never by invitation acceptance alone. Clients cannot write this flag or alter role/is_active.';
comment on function public.presentation_permissions(uuid) is
  'Read-only authorization for an active employee. Metadata edits include the current Vancouver date; own file management continues after completion. Business mutations remain disabled.';

commit;
