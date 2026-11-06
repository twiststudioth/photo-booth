import { createClient } from '@supabase/supabase-js';

// Supabase (Postgres) storage - ใช้ secret/service_role key ฝั่ง server เท่านั้น
// ทุกฟังก์ชันจะ throw เมื่ออ่าน/เขียนไม่สำเร็จ (ไม่คืนค่าว่างแทน) เพื่อไม่ให้ข้อมูลถูกเขียนทับโดยไม่ตั้งใจ
let client = null;

function sb() {
  if (!client) {
    const url = process.env.SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
      throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set');
    }
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function check({ data, error }) {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

// ---------- Events ----------
// แถวใน DB: { id, photo_counter, data (jsonb), created_at } <-> object เดิมที่แอปใช้

// ฟิลด์ที่ไม่เก็บใน data (มีคอลัมน์ของตัวเอง หรือจัดการผ่าน nextPhotoNumber เท่านั้น)
function stripColumns({ id, photoCounter, createdAt, ...rest }) {
  return rest;
}

function rowToEvent(row) {
  return {
    ...row.data,
    id: row.id,
    photoCounter: row.photo_counter,
    createdAt: row.created_at
  };
}

export async function getAllEvents() {
  const rows = check(await sb().from('events').select('*').order('created_at', { ascending: true }));
  return rows.map(rowToEvent);
}

export async function getEventById(id) {
  const row = check(await sb().from('events').select('*').eq('id', id).maybeSingle());
  return row ? rowToEvent(row) : null;
}

export async function createEvent(event) {
  const row = check(await sb().from('events').insert({
    id: event.id,
    photo_counter: event.photoCounter || 0,
    data: stripColumns(event),
    created_at: event.createdAt || new Date().toISOString()
  }).select().single());
  return rowToEvent(row);
}

// Merge updates เข้า data (photoCounter จะถูกเมิน - ใช้ nextPhotoNumber แทน กันเลขถอยหลัง)
export async function updateEvent(id, updates) {
  const current = check(await sb().from('events').select('data').eq('id', id).maybeSingle());
  if (!current) return null;

  const row = check(await sb().from('events')
    .update({ data: { ...current.data, ...stripColumns(updates) } })
    .eq('id', id)
    .select()
    .single());
  return rowToEvent(row);
}

// ลบอีเว้นท์ (รายการรูปของอีเว้นท์จะถูกลบตามด้วย on delete cascade)
export async function deleteEvent(id) {
  check(await sb().from('events').delete().eq('id', id));
  return true;
}

// เลขรันไฟล์ถัดไปแบบ atomic: max(counter + 1, requested)
export async function nextPhotoNumber(eventId, requested = 0) {
  const n = check(await sb().rpc('next_photo_number', { p_event_id: eventId, p_requested: requested }));
  if (!Number.isInteger(n)) throw new Error('Event not found');
  return n;
}

// ---------- Photo sets ----------

function rowToPhoto(row) {
  return {
    id: row.id,
    eventId: row.event_id,
    fileName: row.file_name,
    photos: row.photos,
    composite: row.composite,
    gif: null,
    frameId: row.frame_id,
    cardPhotoIndex: row.card_photo_index,
    createdAt: row.created_at
  };
}

function photoToRow(photo) {
  return {
    id: photo.id,
    event_id: photo.eventId,
    file_name: photo.fileName,
    photos: photo.photos,
    composite: photo.composite ?? null,
    frame_id: photo.frameId ?? null,
    card_photo_index: Number.isInteger(photo.cardPhotoIndex) ? photo.cardPhotoIndex : null,
    created_at: photo.createdAt || new Date().toISOString()
  };
}

export async function getPhotosByEventId(eventId) {
  const rows = check(await sb().from('photo_sets')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false }));
  return rows.map(rowToPhoto);
}

export async function getPhotoById(id) {
  const row = check(await sb().from('photo_sets').select('*').eq('id', id).maybeSingle());
  return row ? rowToPhoto(row) : null;
}

export async function createPhoto(photo) {
  const row = check(await sb().from('photo_sets').insert(photoToRow(photo)).select().single());
  return rowToPhoto(row);
}

export async function deletePhoto(id) {
  check(await sb().from('photo_sets').delete().eq('id', id));
  return true;
}

// ---------- Login attempts (กันเดารหัสผ่าน) ----------

export async function countFailedLogins(ip, sinceMinutes) {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
  const { count, error } = await sb().from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('attempted_at', since);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return count || 0;
}

export async function recordFailedLogin(ip) {
  check(await sb().from('login_attempts').insert({ ip }));
  // เก็บกวาดแถวเก่ากว่า 1 วัน
  const old = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  check(await sb().from('login_attempts').delete().lt('attempted_at', old));
}

export async function clearFailedLogins(ip) {
  check(await sb().from('login_attempts').delete().eq('ip', ip));
}

// ใช้ตอนย้ายข้อมูล: upsert ทีละหลายแถว
export async function importEvents(events) {
  if (!events.length) return;
  check(await sb().from('events').upsert(events.map(e => ({
    id: e.id,
    photo_counter: e.photoCounter || 0,
    data: stripColumns(e),
    created_at: e.createdAt || new Date().toISOString()
  }))));
}

export async function importPhotos(photos) {
  if (!photos.length) return;
  check(await sb().from('photo_sets').upsert(photos.map(photoToRow)));
}
