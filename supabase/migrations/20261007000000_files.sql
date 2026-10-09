-- Phase 6: immutable private uploads and atomic publication of validated slides.
begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('presentation-slides', 'presentation-slides', false, 52428800,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']);

-- No client Storage policies are granted. The server issues upload-only tokens;
-- all reads pass through employee-authorized, uncached application endpoints.
create table public.presentation_file_uploads (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.presentations(id) on delete cascade,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  kind text not null check (kind in ('powerpoint', 'pdf')),
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  object_path text not null unique,
  expected_file_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '2 hours',
  completed_at timestamptz,
  failed_at timestamptz
);
create index presentation_file_uploads_presentation_idx on public.presentation_file_uploads(presentation_id);
create index presentation_file_uploads_uploader_idx on public.presentation_file_uploads(uploaded_by);
alter table public.presentation_file_uploads enable row level security;
revoke all on public.presentation_file_uploads from public, anon, authenticated;
grant all on public.presentation_file_uploads to service_role;

create function public.prepare_file_upload(
  p_presentation_id uuid, p_kind text, p_filename text, p_mime_type text,
  p_size_bytes bigint, p_expected_file_id uuid default null
)
returns public.presentation_file_uploads
language plpgsql volatile security definer set search_path = '' as $$
declare
  employee_id uuid;
  current_file_id uuid;
  upload_id uuid := gen_random_uuid();
  result public.presentation_file_uploads;
  size_limit bigint;
begin
  -- Serialize preparations/publications with presentation changes; recheck access
  -- after waiting, including deactivation, deletion, and presenter reassignment.
  perform id from public.presentations where id = p_presentation_id for update;
  employee_id := private.current_employee_id();
  if employee_id is null or not private.can_manage_presentation_files(p_presentation_id) then
    raise exception using errcode = '42501', message = 'file_access_denied';
  end if;
  select file_size_limit into size_limit from storage.buckets where id = 'presentation-slides' and not public;
  if size_limit is null then
    raise exception using errcode = 'P0001', message = 'file_storage_unavailable';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > size_limit then
    raise exception using errcode = '23514', message = 'file_size_invalid';
  end if;
  if p_filename is null or char_length(p_filename) > 200 or p_filename ~ '[[:cntrl:]/\\]'
    or p_kind is null or p_kind not in ('powerpoint', 'pdf') or p_mime_type is null
    or (p_kind = 'pdf' and (p_filename !~* '\.pdf$' or p_mime_type <> 'application/pdf'))
    or (p_kind = 'powerpoint' and (p_filename !~* '\.pptx$' or p_mime_type <> 'application/vnd.openxmlformats-officedocument.presentationml.presentation')) then
    raise exception using errcode = '23514', message = 'file_type_invalid';
  end if;
  select id into current_file_id from public.presentation_files
    where presentation_id = p_presentation_id and kind = p_kind;
  if current_file_id is distinct from p_expected_file_id then
    raise exception using errcode = 'P0001', message = 'file_changed';
  end if;
  insert into public.presentation_file_uploads(id, presentation_id, uploaded_by, kind,
    original_filename, mime_type, size_bytes, object_path, expected_file_id)
  values (upload_id, p_presentation_id, employee_id, p_kind, p_filename, p_mime_type,
    p_size_bytes, p_presentation_id::text || '/' || upload_id::text || case when p_kind = 'pdf' then '.pdf' else '.pptx' end,
    current_file_id) returning * into result;
  return result;
end;
$$;
revoke all on function public.prepare_file_upload(uuid, text, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.prepare_file_upload(uuid, text, text, text, bigint, uuid) to authenticated;

-- Only the server, after validating the actual stored bytes, can publish a file.
-- The Auth ID is obtained from getUser(), never from request parameters.
create function public.complete_file_upload(p_upload_id uuid, p_auth_user_id uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  upload public.presentation_file_uploads;
  presentation public.presentations;
  employee public.users;
  current_file_id uuid;
begin
  select * into upload from public.presentation_file_uploads where id = p_upload_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'file_access_denied';
  end if;
  select * into presentation from public.presentations where id = upload.presentation_id for update;
  select u.* into employee from public.users u join auth.users a on a.id = u.auth_user_id
    where a.id = p_auth_user_id and u.is_active and not u.password_setup_required
      and a.email_confirmed_at is not null and a.is_anonymous is not true
      and a.deleted_at is null and (a.banned_until is null or a.banned_until <= clock_timestamp());
  if employee.id is null or employee.id <> upload.uploaded_by or presentation.id is null
    or presentation.deleted_at is not null
    or (employee.role <> 'admin' and presentation.presenter_user_id <> employee.id) then
    raise exception using errcode = '42501', message = 'file_access_denied';
  end if;
  if upload.completed_at is not null then return upload.id; end if;
  if upload.failed_at is not null or upload.expires_at <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'file_upload_expired';
  end if;
  if not exists (
    select 1 from storage.objects o join storage.buckets b on b.id = o.bucket_id
    where o.bucket_id = 'presentation-slides' and o.name = upload.object_path and not b.public
      and (o.metadata->>'size')::bigint = upload.size_bytes
      and upload.size_bytes <= b.file_size_limit
      and o.metadata->>'mimetype' = upload.mime_type
  ) then
    raise exception using errcode = '23514', message = 'file_object_invalid';
  end if;
  select id into current_file_id from public.presentation_files
    where presentation_id = upload.presentation_id and kind = upload.kind;
  if current_file_id is distinct from upload.expected_file_id then
    raise exception using errcode = 'P0001', message = 'file_changed';
  end if;
  insert into public.presentation_files(id, presentation_id, kind, bucket, object_path,
    original_filename, mime_type, size_bytes, uploaded_by)
  values (upload.id, upload.presentation_id, upload.kind, 'presentation-slides', upload.object_path,
    upload.original_filename, upload.mime_type, upload.size_bytes, employee.id)
  on conflict (presentation_id, kind) do update set
    id = excluded.id, bucket = excluded.bucket, object_path = excluded.object_path,
    original_filename = excluded.original_filename, mime_type = excluded.mime_type,
    size_bytes = excluded.size_bytes, uploaded_by = excluded.uploaded_by, created_at = clock_timestamp();
  update public.presentation_file_uploads set completed_at = clock_timestamp() where id = upload.id;
  return upload.id;
end;
$$;
revoke all on function public.complete_file_upload(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_file_upload(uuid, uuid) to service_role;

comment on table public.presentation_file_uploads is 'Private upload intents. Unattached and superseded objects are inaccessible and retained pending a future retention policy. No client table access.';
comment on table public.presentation_files is 'One current validated immutable private object per file kind. Replacement is atomic and does not edit presentation metadata.';
commit;
