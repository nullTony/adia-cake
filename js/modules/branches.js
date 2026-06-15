// ================================
//  BRANCHES MODULE
//  Left panel: searchable branch list
//  Right panel: Yandex Maps iframe, updates on branch select
// ================================

import { getBranches } from '../api/branches-api.js';

let _branches = [];
let _activeIdx = -1;

function esc(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderCard(branch, index) {
  const hours = branch.workingHours || '';
  const routeBtn = branch.mapsUrl
    ? `<button class="br-card-route" data-maps-url="${esc(branch.mapsUrl)}">Маршрут →</button>`
    : '';

  return `
    <div class="br-card" data-idx="${index}" role="button" tabindex="0" aria-label="${esc(branch.name)}">
      <div class="br-card-name">${esc(branch.name)}</div>
      <div class="br-card-addr">${esc(branch.address)}</div>
      <div class="br-card-meta">
        ${branch.phone ? `<span class="br-card-row"><span class="br-card-ico">📞</span>${esc(branch.phone)}</span>` : ''}
        ${hours       ? `<span class="br-card-row"><span class="br-card-ico">🕐</span>${esc(hours)}</span>`       : ''}
      </div>
      ${routeBtn}
    </div>`;
}

function setActive(index) {
  if (_activeIdx === index) return;
  _activeIdx = index;

  document.querySelectorAll('#brList .br-card').forEach((card, i) => {
    card.classList.toggle('active', i === index);
  });

  _updateMap(_branches[index]);
}

function _updateMap(branch) {
  const container = document.getElementById('brMapContainer');
  if (!container) return;

  if (branch?.mapWidgetUrl) {
    container.innerHTML = `<iframe
      src="${esc(branch.mapWidgetUrl)}"
      width="100%"
      height="100%"
      frameborder="0"
      allowfullscreen="true"
      style="display:block;border:none;"
      title="Карта филиала ${esc(branch.name)}"
    ></iframe>`;
  } else {
    container.innerHTML = `
      <div class="br-map-no-url">
        <div class="br-map-no-ico">🗺️</div>
        <p class="br-map-no-text">Карта недоступна</p>
      </div>`;
  }
}

function _filterCards(query) {
  const q = query.toLowerCase().trim();
  let visibleCount = 0;

  document.querySelectorAll('#brList .br-card').forEach((card, i) => {
    const b     = _branches[i];
    const match = !q ||
      (b.name    || '').toLowerCase().includes(q) ||
      (b.address || '').toLowerCase().includes(q) ||
      (b.phone   || '').toLowerCase().includes(q);
    card.hidden = !match;
    if (match) visibleCount++;
  });

  const empty = document.getElementById('brEmpty');
  if (empty) empty.hidden = visibleCount > 0;
}

export async function initBranches() {
  const brList   = document.getElementById('brList');
  const brSearch = document.getElementById('brSearch');
  if (!brList) return;

  try {
    _branches = await getBranches();
  } catch (err) {
    console.error('[branches] Failed to load branches:', err);
    return;
  }

  if (!_branches.length) return;

  brList.innerHTML = _branches.map(renderCard).join('');

  // Card click / keyboard
  brList.addEventListener('click', e => {
    // "Маршрут" button → open maps_url in new tab
    const routeBtn = e.target.closest('.br-card-route');
    if (routeBtn) {
      window.open(routeBtn.dataset.mapsUrl, '_blank', 'noopener');
      return;
    }
    const card = e.target.closest('.br-card');
    if (!card) return;
    setActive(parseInt(card.dataset.idx, 10));
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  brList.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.br-card');
    if (card) { e.preventDefault(); setActive(parseInt(card.dataset.idx, 10)); }
  });

  // Search
  brSearch?.addEventListener('input', () => _filterCards(brSearch.value));

  // Auto-select first branch
  setActive(0);
}
