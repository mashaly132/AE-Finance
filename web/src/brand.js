import { supabase } from './data';
import { logoAsset } from './logo-data';

// All office-facing surfaces share this brand source, including anonymous sign-in.
export const OFFICE_LOGO_EVENT = 'ae-finance:brand-logo-updated';
export const OFFICE_LOGO_BUCKET = 'ae-office-brand';
export const OFFICE_LOGO_PATH = 'office-logo';
const CACHE_KEY = 'ae-finance-office-logo-v4';

const isImageDataUrl = value => typeof value === 'string' &&
  /^data:image\/(?:png|jpe?g|webp);base64,/.test(value);

let currentLogo = null;
let lastLoadedAt = 0;
let pendingLoad = null;

export function cachedOfficeLogo() {
  if (isImageDataUrl(currentLogo)) return currentLogo;
  try {
    const cached = window.localStorage.getItem(CACHE_KEY);
    if (isImageDataUrl(cached)) return cached;
  } catch {}
  return logoAsset;
}

const blobToDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('تعذر قراءة صورة شعار المكتب'));
  reader.readAsDataURL(blob);
});

export async function loadOfficeLogo({ force = false } = {}) {
  if (pendingLoad) return pendingLoad;
  if (!force && currentLogo && Date.now() - lastLoadedAt < 30000) return currentLogo;
  pendingLoad = (async () => {
    try {
      if (!supabase) throw new Error('غير متصل');
      const { data } = supabase.storage.from(OFFICE_LOGO_BUCKET).getPublicUrl(OFFICE_LOGO_PATH);
      const url = data?.publicUrl;
      if (!url) throw new Error('رابط اللوجو مش متاح');
      // Cache-bust the fixed public URL so changes are visible on the login screen too.
      const response = await fetch(url + '?v=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('لا يوجد شعار جديد محفوظ');
      const blob = await response.blob();
      if (!/^image\/(png|jpeg|webp)$/.test(blob.type) || blob.size > 3145728)
        throw new Error('ملف الشعار المحفوظ غير صالح');
      const imageData = await blobToDataUrl(blob);
      if (!isImageDataUrl(imageData)) throw new Error('تنسيق صورة الشعار غير مدعوم');
      currentLogo = imageData;
      try { window.localStorage.setItem(CACHE_KEY, imageData); } catch {}
      return imageData;
    } catch {
      // The exact original office logo is included in the app, works before sign-in,
      // and remains available if the public bucket has not been customized yet.
      if (isImageDataUrl(currentLogo)) return currentLogo;
      try {
        const cached = window.localStorage.getItem(CACHE_KEY);
        if (isImageDataUrl(cached)) return cached;
      } catch {}
      try {
        const response = await fetch(logoAsset);
        if (response.ok) {
          const value = await blobToDataUrl(await response.blob());
          if (isImageDataUrl(value)) return value;
        }
      } catch {}
      return logoAsset;
    } finally {
      lastLoadedAt = Date.now();
    }
  })();
  try { return await pendingLoad; }
  finally { pendingLoad = null; }
}

export function announceOfficeLogoChange() {
  currentLogo = null;
  lastLoadedAt = 0;
  try { window.localStorage.removeItem(CACHE_KEY); } catch {}
  window.dispatchEvent(new Event(OFFICE_LOGO_EVENT));
}
