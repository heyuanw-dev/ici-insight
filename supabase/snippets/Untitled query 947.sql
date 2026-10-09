update public.users
set role = 'admin'
where lower(email) = lower('meng.zhang1@h-partners.com')
returning email, role;