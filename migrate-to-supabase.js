// ย้ายข้อมูล events.json / photos.json จาก Cloudinary ไป Supabase
//   node migrate-to-supabase.js          -> dry run: อ่าน + backup + สรุป ไม่เขียนอะไร
//   node migrate-to-supabase.js --apply  -> เขียนลง Supabase (upsert รันซ้ำได้)
// ไม่ลบไฟล์ JSON บน Cloudinary - เก็บไว้เป็น backup
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import { importEvents, importPhotos } from './lib/db.js';

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  api_key: process.env.CLOUDINARY_API_KEY?.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET?.trim()
});

const APPLY = process.argv.includes('--apply');
const FOLDER = (process.env.CLOUDINARY_FOLDER || 'photobooth').trim();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 200;

async function readJson(publicId) {
  try {
    const resource = await cloudinary.api.resource(publicId, { resource_type: 'raw' });
    const response = await fetch(resource.secure_url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.error?.http_code === 404) return [];
    throw new Error(`อ่าน ${publicId} ไม่ได้: ${error.message || error.error?.message}`);
  }
}

async function inBatches(items, fn) {
  for (let i = 0; i < items.length; i += BATCH) {
    await fn(items.slice(i, i + BATCH));
  }
}

async function main() {
  console.log(`📥 อ่านข้อมูลจาก Cloudinary (folder: ${FOLDER})`);
  const events = await readJson(`${FOLDER}/data/events.json`);
  const photos = await readJson(`${FOLDER}/data/photos.json`);

  // Backup ลงเครื่องก่อนทุกครั้ง
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.mkdir('backup', { recursive: true });
  await fs.writeFile(`backup/events-${stamp}.json`, JSON.stringify(events, null, 2));
  await fs.writeFile(`backup/photos-${stamp}.json`, JSON.stringify(photos, null, 2));
  console.log(`💾 Backup: backup/events-${stamp}.json, backup/photos-${stamp}.json`);

  // ตรวจข้อมูล
  const badEvents = events.filter(e => !UUID_RE.test(e.id || ''));
  const goodEvents = events.filter(e => UUID_RE.test(e.id || ''));
  const eventIds = new Set(goodEvents.map(e => e.id));

  const badPhotos = photos.filter(p => !UUID_RE.test(p.id || '') || !Array.isArray(p.photos) || !p.fileName);
  const orphanPhotos = photos.filter(p => !badPhotos.includes(p) && !eventIds.has(p.eventId));
  const goodPhotos = photos.filter(p => !badPhotos.includes(p) && eventIds.has(p.eventId));

  console.log('\n📊 สรุป');
  console.log(`  events: ${events.length} (ย้ายได้ ${goodEvents.length}, id ไม่ใช่ uuid ${badEvents.length})`);
  console.log(`  photo sets: ${photos.length} (ย้ายได้ ${goodPhotos.length}, ข้อมูลไม่ครบ ${badPhotos.length}, ไม่มีอีเว้นท์ ${orphanPhotos.length})`);
  for (const e of goodEvents) {
    const count = goodPhotos.filter(p => p.eventId === e.id).length;
    console.log(`   - ${e.name || '(ไม่มีชื่อ)'}: ${count} ชุด, counter ${e.photoCounter || 0}`);
  }
  if (badEvents.length) console.log('  ⚠️ events ที่ข้าม:', badEvents.map(e => e.id));
  if (badPhotos.length) console.log('  ⚠️ photo sets ที่ข้าม (ข้อมูลไม่ครบ):', badPhotos.map(p => p.id));
  if (orphanPhotos.length) console.log('  ℹ️ photo sets ของอีเว้นท์ที่ถูกลบไปแล้ว (ข้าม):', orphanPhotos.length);

  if (!APPLY) {
    console.log('\n🔎 Dry run - ยังไม่ได้เขียนอะไร รันอีกครั้งด้วย --apply เพื่อย้ายจริง');
    return;
  }

  console.log('\n📤 เขียนลง Supabase...');
  await inBatches(goodEvents, importEvents);
  await inBatches(goodPhotos, importPhotos);
  console.log(`✅ เสร็จ: ${goodEvents.length} events, ${goodPhotos.length} photo sets`);
}

main().catch(error => {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
});
