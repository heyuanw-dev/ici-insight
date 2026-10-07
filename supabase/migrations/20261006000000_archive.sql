-- Phase 5: completed metadata, literal substring search, and archive filters.
begin;

create view public.archive_presentations with (security_invoker = true) as
select * from public.presentation_overview where status = 'completed';
revoke all on public.archive_presentations from public, anon, authenticated;
grant select on public.archive_presentations to authenticated;

create function public.search_archive(
  p_query text default '',
  p_presenter_id uuid default null,
  p_category_id uuid default null,
  p_year integer default null,
  p_date_from date default null,
  p_date_to date default null
)
returns setof public.archive_presentations
language plpgsql stable security invoker set search_path = '' as $$
begin
  if private.current_employee_id() is null then
    raise exception using errcode = '42501', message = 'employee_access_required';
  end if;
  if char_length(p_query) > 200 then
    raise exception using errcode = '22023', message = 'archive_query_too_long';
  end if;
  if p_year is not null and p_year not between 1 and 9999 then
    raise exception using errcode = '22023', message = 'archive_invalid_year';
  end if;
  if p_date_from > p_date_to then
    raise exception using errcode = '22023', message = 'archive_invalid_date_range';
  end if;
  if (p_date_from is not null and (not isfinite(p_date_from) or p_date_from < date '0001-01-01' or p_date_from > date '9999-12-31'))
    or (p_date_to is not null and (not isfinite(p_date_to) or p_date_to < date '0001-01-01' or p_date_to > date '9999-12-31')) then
    raise exception using errcode = '22023', message = 'archive_invalid_date';
  end if;

  return query
  select a.* from public.archive_presentations a
  where (p_presenter_id is null or a.presenter_user_id = p_presenter_id)
    and (p_category_id is null or a.category_id = p_category_id)
    and (p_year is null or extract(year from a.presentation_date)::integer = p_year)
    and (p_date_from is null or a.presentation_date >= p_date_from)
    and (p_date_to is null or a.presentation_date <= p_date_to)
    -- Each whitespace-separated term is a literal, case-insensitive substring.
    -- No wildcard syntax, query interpolation, or external search service.
    and not exists (
      select 1 from regexp_split_to_table(lower(coalesce(p_query, '')), '[[:space:]]+') as terms(term)
      where strpos(lower(concat_ws(' ', a.title, a.presenter_name, a.description, a.category_name)), terms.term) = 0
    )
  order by a.presentation_date desc, a.slot_number, a.id;
end;
$$;

-- Options come only from visible completed presentations. Former presenters and
-- inactive categories remain discoverable; cancelled/deleted-only values do not.
create function public.archive_filter_options()
returns table (filter_type text, value text, label text)
language sql stable security invoker set search_path = '' as $$
  with archive as materialized (
    select presenter_user_id, presenter_name, category_id, category_name, presentation_date
    from public.archive_presentations
  )
  select distinct 'presenter'::text, presenter_user_id::text, presenter_name from archive
  union all
  select distinct 'category'::text, category_id::text, category_name from archive where category_id is not null
  union all
  select distinct 'year'::text, extract(year from presentation_date)::integer::text, extract(year from presentation_date)::integer::text from archive;
$$;

revoke all on function public.search_archive(text, uuid, uuid, integer, date, date), public.archive_filter_options() from public, anon, authenticated;
grant execute on function public.search_archive(text, uuid, uuid, integer, date, date), public.archive_filter_options() to authenticated;

comment on view public.archive_presentations is
  'Completed, non-cancelled, non-deleted metadata derived at Vancouver midnight. All underlying employee RLS applies; files are optional.';
comment on function public.search_archive(text, uuid, uuid, integer, date, date) is
  'Read-only employee archive search. All terms and filters combine with AND; date bounds are inclusive. Ordered by date descending, slot ascending, ID ascending. PostgREST supports count/range pagination.';
commit;
