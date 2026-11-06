-- รันไฟล์นี้ใน Supabase SQL Editor (สำหรับโปรเจ็คที่รัน schema.sql รอบแรกไปแล้ว)
create table if not exists public.login_attempts (
  id           bigserial primary key,
  ip           text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_time_idx
  on public.login_attempts (ip, attempted_at desc);

alter table public.login_attempts enable row level security;
