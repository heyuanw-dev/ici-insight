-- Synchronize administrator-created email accounts as well as invitations.
-- Preserve retained history and privileges while aligning linked profile IDs.
begin;
set local lock_timeout = '5s';

-- Block concurrent identity/profile writes while checking conflicts and
-- replacing the trigger. Ordinary reads can continue until the FK changes.
lock table auth.users, public.users in share row exclusive mode;

do $$
begin
  if exists (
    select 1 from public.users u join public.users other
      on other.id = u.auth_user_id and other.id <> u.id
  ) or exists (
    select 1 from auth.users a join public.users u on u.id = a.id
    where a.is_anonymous is not true and a.deleted_at is null
      and nullif(btrim(a.email), '') is not null
      and u.auth_user_id is distinct from a.id
  ) then
    raise exception using errcode = '23505', message = 'auth_sync_identity_conflict',
      hint = 'Resolve conflicting profile UUIDs explicitly before retrying. No profiles have been merged.';
  end if;
  if exists (
    select 1 from auth.users a join public.users u
      on lower(btrim(u.email)) = lower(btrim(a.email))
    where a.is_anonymous is not true and a.deleted_at is null
      and nullif(btrim(a.email), '') is not null
      and u.auth_user_id is distinct from a.id
  ) or exists (
    select lower(btrim(email)) from auth.users
    where is_anonymous is not true and deleted_at is null
      and nullif(btrim(email), '') is not null
    group by lower(btrim(email)) having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'auth_sync_email_conflict',
      hint = 'Resolve duplicate or retained profile emails explicitly before retrying. Email alone cannot transfer an account or administrator role.';
  end if;
end;
$$;

-- Keep all ownership relationships when a legacy application UUID is aligned
-- with its already-linked Auth UUID. Deletion still retains/restricts history.
alter table public.presentations
  drop constraint presentations_presenter_user_id_fkey,
  add constraint presentations_presenter_user_id_fkey foreign key (presenter_user_id)
    references public.users(id) on update cascade on delete restrict;
alter table public.presentation_files
  drop constraint presentation_files_uploaded_by_fkey,
  add constraint presentation_files_uploaded_by_fkey foreign key (uploaded_by)
    references public.users(id) on update cascade on delete restrict;
alter table public.presentation_file_uploads
  drop constraint presentation_file_uploads_uploaded_by_fkey,
  add constraint presentation_file_uploads_uploaded_by_fkey foreign key (uploaded_by)
    references public.users(id) on update cascade on delete restrict;

update public.users set id = auth_user_id
where auth_user_id is not null and id <> auth_user_id;

alter table public.users add constraint users_auth_identity_matches
  check (auth_user_id is null or id = auth_user_id);

create function private.auth_employee_name(metadata jsonb, email text)
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    case when jsonb_typeof(metadata -> 'name') = 'string' then nullif(btrim(metadata ->> 'name'), '') end,
    case when jsonb_typeof(metadata -> 'full_name') = 'string' then nullif(btrim(metadata ->> 'full_name'), '') end,
    nullif(split_part(btrim(email), '@', 1), ''),
    'Employee'
  );
$$;
revoke all on function private.auth_employee_name(jsonb, text) from public, anon, authenticated;

create function private.sync_auth_employee()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  password_changed boolean := false;
  clean_email text := nullif(btrim(new.email), '');
begin
  -- This workspace uses email accounts. Anonymous/phone-only/deleted identities
  -- must not become employees merely by existing in Supabase Auth.
  if clean_email is null or new.is_anonymous is true or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    -- Invitation acceptance can install an unknown random password. Preserve
    -- the existing requirement for a subsequent change after confirmation.
    password_changed := old.email_confirmed_at is not null
      and new.encrypted_password is distinct from old.encrypted_password
      and coalesce(new.encrypted_password, '') <> '';
  end if;

  insert into public.users(id, auth_user_id, name, email, password_setup_required)
  values (
    new.id, new.id, private.auth_employee_name(new.raw_user_meta_data, clean_email), clean_email,
    not password_changed
  )
  on conflict (auth_user_id) do update set
    email = excluded.email,
    password_setup_required = case when password_changed then false else public.users.password_setup_required end
  where public.users.email is distinct from excluded.email
    or (password_changed and public.users.password_setup_required);
  -- Auth can generate a random password hash even for Create user without a
  -- password. New profiles therefore require website setup, just like invites.
  -- The default role is 'user'. Never copy role, is_active, or setup flags from
  -- editable user metadata; preserve administrators and existing display names.
  return new;
end;
$$;
revoke all on function private.sync_auth_employee() from public, anon, authenticated;

drop trigger sync_invited_employee on auth.users;
drop function private.sync_invited_employee();
create trigger sync_auth_employee
  after insert or update of email, encrypted_password, invited_at on auth.users
  for each row execute function private.sync_auth_employee();

-- Only missing profiles are inserted. Existing roles, names, active status and
-- password-setup flags are left untouched. No email-based account linking.
insert into public.users(id, auth_user_id, name, email, password_setup_required)
select a.id, a.id, private.auth_employee_name(a.raw_user_meta_data, a.email), btrim(a.email), true
from auth.users a
where a.is_anonymous is not true and a.deleted_at is null
  and nullif(btrim(a.email), '') is not null
  and not exists (select 1 from public.users u where u.auth_user_id = a.id)
on conflict (auth_user_id) do nothing;

comment on column public.users.auth_user_id is
  'Linked Auth UUID, equal to the application user ID while linked. Auth deletion clears this link and retains the profile and authored records.';
comment on column public.users.password_setup_required is
  'New profiles require website password setup, including manually provisioned accounts. An existing hash can be generated by Auth and does not prove setup. A later password change after email confirmation clears the flag. Never writable by clients.';

commit;
