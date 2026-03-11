alter table profiles
  add column if not exists public_identity_platform text
    check (public_identity_platform in ('instagram', 'tiktok', 'incognito')),
  add column if not exists public_identity_username text,
  add column if not exists public_identity_source_url text;

update profiles
set
  public_identity_platform = auth_provider,
  public_identity_username = platform_username,
  public_identity_source_url = null
where auth_provider in ('instagram', 'tiktok')
  and platform_username is not null
  and public_identity_platform is null;
