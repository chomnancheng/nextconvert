alter table user_access add column if not exists is_admin boolean not null default false;
