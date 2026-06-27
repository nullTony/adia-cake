// ================================
//  IMAGE UPLOAD — ImgBB
//
//  To activate: set IMGBB.API_KEY in js/config/api-config.js
//  Get a free key at: https://imgbb.com/
// ================================

import { API_CONFIG } from '../config/api-config.js';

const { API_KEY, BASE_URL } = API_CONFIG.IMGBB;

const MAX_SIDE    = 1280;
const JPEG_Q      = 0.82;
const RASTER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/heic', 'image/heif']);

// Shrinks the image client-side before upload. Returns the original on any failure.
async function compressImage(file) {
  if (!RASTER_MIME.has(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;

    let newW = width;
    let newH = height;
    const longest = Math.max(width, height);
    if (longest > MAX_SIDE) {
      const r = MAX_SIDE / longest;
      newW = Math.round(width  * r);
      newH = Math.round(height * r);
    }

    const canvas = document.createElement('canvas');
    canvas.width  = newW;
    canvas.height = newH;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, newW, newH);
    bitmap.close();

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', JPEG_Q));
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export function isImgBBConfigured() {
  return !!(API_KEY && API_KEY !== 'PUT_YOUR_IMGBB_API_KEY_HERE');
}

// Uploads a File object to ImgBB. Returns the direct image URL string.
export async function uploadImage(file) {
  if (!isImgBBConfigured()) {
    throw new Error('ImgBB API key not configured. Set IMGBB.API_KEY in js/config/api-config.js');
  }

  const toUpload = await compressImage(file);

  const formData = new FormData();
  formData.append('image', toUpload);

  const res = await fetch(`${BASE_URL}?key=${API_KEY}`, {
    method: 'POST',
    body:   formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `ImgBB upload failed: ${res.status}`);
  }

  const data = await res.json();
  if (!data.success || !data.data?.url) {
    throw new Error('ImgBB returned an unexpected response');
  }

  return data.data.url;
}
