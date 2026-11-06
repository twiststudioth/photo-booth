-- Twist Photobooth - Supabase schema
-- รันไฟล์นี้ครั้งเดียวใน Supabase Dashboard -> SQL Editor

-- Events: เก็บฟิลด์ที่ query บ่อยเป็นคอลัมน์ ที่เหลือ (name, filePrefix, frames, qrCode, ...) อยู่ใน data
create table if not exists public.events (
  id            uuid primary key,
  photo_counter integer not null default 0,
  data          jsonb   not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Photo sets: 1 แถว = 1 ชุดรูป (3 รูป + composite)
create table if not exists public.photo_sets (
  id               uuid primary key,
  event_id         uuid not null references public.events(id) on delete cascade,
  file_name        text not null,
  photos           text[] not null,
  composite        text,
  frame_id         text,
  card_photo_index smallint,
  created_at       timestamptz not null default now()
);

create index if not exists photo_sets_event_created_idx
  on public.photo_sets (event_id, created_at desc);

-- เปิด RLS โดยไม่มี policy = ปิดการเข้าถึงจาก anon/publishable key ทั้งหมด
-- server ใช้ service_role/secret key ซึ่งข้าม RLS ได้
alter table public.events     enable row level security;
alter table public.photo_sets enable row level security;

-- เลขรันไฟล์แบบ atomic: ไม่ซ้ำแม้หลายเครื่องอัพโหลดพร้อมกัน
-- ใช้เลขที่บูธส่งมาถ้ามากกว่า และไม่ถอยหลัง
create or replace function public.next_photo_number(p_event_id uuid, p_requested integer default 0)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.events
     set photo_counter = greatest(photo_counter + 1, coalesce(p_requested, 0))
   where id = p_event_id
  returning photo_counter;
$$;

revoke execute on function public.next_photo_number(uuid, integer) from public, anon, authenticated;

-- ---------- เพิ่มเติม (v2): จำกัดการเดารหัสผ่าน admin ----------
-- เก็บเฉพาะครั้งที่ login ผิด (ลบอัตโนมัติเมื่อเก่ากว่า 1 วัน)
create table if not exists public.login_attempts (
  id           bigserial primary key,
  ip           text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_time_idx
  on public.login_attempts (ip, attempted_at desc);

alter table public.login_attempts enable row level security;
