-- user_access: admin-managed table.
-- Set is_active=true and device_limit to grant access.
-- Manage rows manually in Supabase Studio.
create table if not exists user_access (
  user_id      text        primary key,           -- Clerk user ID (user_xxxx)
  is_active    boolean     not null default false,
  device_limit integer     not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- user_devices: one row per registered device per user.
create table if not exists user_devices (
  id             uuid        primary key default gen_random_uuid(),
  user_id        text        not null references user_access(user_id) on delete cascade,
  device_id      text        not null,            -- stable UUID generated per machine
  device_name    text        not null default 'Unknown',
  registered_at  timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  unique(user_id, device_id)
);

-- Trigger to keep user_access.updated_at fresh
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_access_updated_at
  before update on user_access
  for each row execute function set_updated_at();

-- RLS: the edge function uses the service role key, which bypasses RLS.
-- Enable RLS anyway so no anon/authenticated policy accidentally exposes data.
alter table user_access enable row level security;
alter table user_devices enable row level security;
