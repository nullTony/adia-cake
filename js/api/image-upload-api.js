// ================================
//  IMAGE UPLOAD — ImgBB
//
//  To activate: set IMGBB.API_KEY in js/config/api-config.js
//  Get a free key at: https://imgbb.com/
// ================================

import { API_CONFIG } from '../config/api-config.js';

const { API_KEY, BASE_URL } = API_CONFIG.IMGBB;

export function isImgBBConfigured() {
  return !!(API_KEY && API_KEY !== 'PUT_YOUR_IMGBB_API_KEY_HERE');
}

// Uploads a File object to ImgBB. Returns the direct image URL string.
export async function uploadImage(file) {
  if (!isImgBBConfigured()) {
    throw new Error('ImgBB API key not configured. Set IMGBB.API_KEY in js/config/api-config.js');
  }

  const formData = new FormData();
  formData.append('image', file);

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
