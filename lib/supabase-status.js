// สถานะโปรเจ็ค Supabase + ปลุกเมื่อถูก pause (ผ่าน Management API ด้วย SUPABASE_ACCESS_TOKEN)
const MGMT_API = 'https://api.supabase.com/v1';

function projectRef() {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return null;
  }
}

function dashboardUrl(ref) {
  return ref ? `https://supabase.com/dashboard/project/${ref}` : 'https://supabase.com/dashboard';
}

// แปลงสถานะของ Supabase เป็น 4 กลุ่มที่หน้า admin ใช้
function normalize(status) {
  switch (status) {
    case 'ACTIVE_HEALTHY':
      return 'active';
    case 'INACTIVE':
    case 'PAUSED':
    case 'PAUSING':
      return 'paused';
    case 'COMING_UP':
    case 'RESTORING':
    case 'RESTARTING':
    case 'UPGRADING':
    case 'GOING_DOWN':
    case 'ACTIVE_UNHEALTHY':
      return 'waking';
    default:
      return 'error';
  }
}

async function mgmtFetch(path, init = {}) {
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const res = await fetch(`${MGMT_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) }
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

function permissionError(res, body) {
  if (res.status !== 403 && res.status !== 401) return null;
  const missing = body.missing_permissions || body.missingPermissions;
  return Array.isArray(missing) && missing.length
    ? `Access token ขาดสิทธิ์: ${missing.join(', ')}`
    : 'Access token ไม่มีสิทธิ์ หรือหมดอายุ';
}

export async function getProjectStatus() {
  const ref = projectRef();
  const base = { dashboardUrl: dashboardUrl(ref), canWake: false };

  if (!ref) return { ...base, state: 'error', message: 'ยังไม่ได้ตั้งค่า SUPABASE_URL' };

  if (!process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return { ...base, state: 'unknown', message: 'ไม่ได้ตั้ง SUPABASE_ACCESS_TOKEN จึงเช็คสถานะไม่ได้' };
  }

  try {
    const { res, body } = await mgmtFetch(`/projects/${ref}`);
    const permError = permissionError(res, body);
    if (permError) return { ...base, state: 'error', message: permError };
    if (!res.ok) return { ...base, state: 'error', message: `Management API ตอบกลับ ${res.status}` };

    const state = normalize(body.status);
    return { ...base, state, raw: body.status, canWake: state === 'paused' };
  } catch (error) {
    return { ...base, state: 'error', message: `ติดต่อ Supabase ไม่ได้: ${error.message}` };
  }
}

export async function wakeProject() {
  const ref = projectRef();
  if (!ref || !process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return { ok: false, message: 'ยังไม่ได้ตั้ง SUPABASE_URL / SUPABASE_ACCESS_TOKEN', dashboardUrl: dashboardUrl(ref) };
  }

  try {
    const { res, body } = await mgmtFetch(`/projects/${ref}/restore`, { method: 'POST' });
    const permError = permissionError(res, body);
    if (permError) return { ok: false, message: permError, dashboardUrl: dashboardUrl(ref) };
    if (!res.ok) {
      return {
        ok: false,
        message: body.message || `ปลุกไม่สำเร็จ (${res.status}) ลองกด Restore ใน Supabase Dashboard`,
        dashboardUrl: dashboardUrl(ref)
      };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: `ติดต่อ Supabase ไม่ได้: ${error.message}`, dashboardUrl: dashboardUrl(ref) };
  }
}
