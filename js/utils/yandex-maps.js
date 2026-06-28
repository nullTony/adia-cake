// ================================
//  YANDEX MAPS — lazy loader
//  Loads Yandex Maps JS API 2.1 once on demand.
//  Returns a Promise<ymaps> that resolves after ymaps.ready().
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
