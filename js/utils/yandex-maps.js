// ================================
//  YANDEX MAPS — lazy loader + HTTP geocoder
//  Loads Yandex Maps JS API 2.1 once on demand.
//  Returns a Promise<ymaps> that resolves after ymaps.ready().
//
//  reverseGeocode uses the HTTP Geocoder API (not ymaps.geocode which
//  fails with "scriptError" on this key type) — coords order: lng,lat in URL.
// ================================

import { API_CONFIG } from '../config/api-config.js';

let _promise = null;

export function loadYandexMaps() {
  if (_promise) return _promise;

  _promise = new Promise((resolve, reject) => {
    if (window.ymaps) {
      window.ymaps.ready(() => resolve(window.ymaps));
      return;
    }
    const s = document.createElement('script');
    s.src   = `https://api-maps.yandex.ru/2.1/?apikey=${API_CONFIG.YANDEX.MAPS_API_KEY}&lang=ru_RU`;
    s.async = true;
    s.onload  = () => window.ymaps.ready(() => resolve(window.ymaps));
    s.onerror = () => { _promise = null; reject(new Error('Yandex Maps load failed')); };
    document.head.appendChild(s);
  });

  return _promise;
}

// HTTP Geocoder — works where ymaps.geocode fails with scriptError.
// Note: URL uses lng,lat order (longitude first).
export async function reverseGeocode(lat, lng) {
  const key = API_CONFIG.YANDEX.MAPS_API_KEY;
  const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${key}&format=json&geocode=${lng},${lat}&results=1&lang=ru_RU`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const m = j?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
    return m?.metaDataProperty?.GeocoderMetaData?.text || null;
  } catch {
    return null;
  }
}
