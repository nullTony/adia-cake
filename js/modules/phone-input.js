const COUNTRIES = [
  { iso: 'UZ', flag: '🇺🇿', name: 'Узбекистан',     dial: '998', mask: '## ### ## ##'  },
  { iso: 'RU', flag: '🇷🇺', name: 'Россия',          dial: '7',   mask: '### ###-##-##' },
  { iso: 'KZ', flag: '🇰🇿', name: 'Казахстан',       dial: '7',   mask: '### ###-##-##' },
  { iso: 'KG', flag: '🇰🇬', name: 'Кыргызстан',      dial: '996', mask: '### ###-###'   },
  { iso: 'TJ', flag: '🇹🇯', name: 'Таджикистан',     dial: '992', mask: '## ###-####'   },
  { iso: 'TM', flag: '🇹🇲', name: 'Туркменистан',    dial: '993', mask: '# ###-####'    },
  { iso: 'AZ', flag: '🇦🇿', name: 'Азербайджан',     dial: '994', mask: '## ###-##-##'  },
  { iso: 'GE', flag: '🇬🇪', name: 'Грузия',          dial: '995', mask: '### ###-###'   },
  { iso: 'AM', flag: '🇦🇲', name: 'Армения',         dial: '374', mask: '## ###-###'    },
  { iso: 'UA', flag: '🇺🇦', name: 'Украина',         dial: '380', mask: '## ###-##-##'  },
  { iso: 'BY', flag: '🇧🇾', name: 'Беларусь',        dial: '375', mask: '## ###-##-##'  },
  { iso: 'MD', flag: '🇲🇩', name: 'Молдова',         dial: '373', mask: '## ##-##-##'   },
  { iso: 'TR', flag: '🇹🇷', name: 'Турция',          dial: '90',  mask: '### ###-##-##' },
  { iso: 'DE', flag: '🇩🇪', name: 'Германия',        dial: '49',  mask: '### #######'   },
  { iso: 'GB', flag: '🇬🇧', name: 'Великобритания',  dial: '44',  mask: '#### ######'   },
  { iso: 'US', flag: '🇺🇸', name: 'США',             dial: '1',   mask: '### ###-####'  },
  { iso: 'CN', flag: '🇨🇳', name: 'Китай',           dial: '86',  mask: '### #### ####' },
];

function maskToPlaceholder(mask) { return mask.replace(/#/g, '—'); }

function countDigits(mask) { return (mask.match(/#/g) || []).length; }

function formatNational(raw, mask) {
  const digits = raw.replace(/\D/g, '').slice(0, countDigits(mask));
  let out = '', di = 0;
  for (let i = 0; i < mask.length && di < digits.length; i++) {
    if (mask[i] === '#') out += digits[di++];
    else out += mask[i];
  }
  return out;
}

export function initPhoneInput(mountEl, hiddenInput, opts = {}) {
  const { onEnter } = opts;
  const ac = new AbortController();

  let selected = COUNTRIES.find(c => c.iso === 'UZ');
  let natRaw   = '';
  let ddOpen   = false;

  let _card, _dd, _dialEl, _natEl, _searchEl, _listEl, _chevron, _flagEl, _cnameEl;

  function syncHidden() {
    hiddenInput.value = '+' + selected.dial + natRaw.replace(/\D/g, '');
  }

  function renderList(q = '') {
    const lq = q.toLowerCase();
    _listEl.innerHTML = COUNTRIES
      .filter(c => !lq || c.name.toLowerCase().includes(lq) || c.dial.includes(lq))
      .map(c => `
        <div class="pi-item${c.iso === selected.iso ? ' pi-item--sel' : ''}" data-iso="${c.iso}">
          <span class="pi-iflag">${c.flag}</span>
          <span class="pi-iname">${c.name}</span>
          <span class="pi-idial">+${c.dial}</span>
        </div>`).join('');
  }

  function applyCountry(c) {
    selected = c;
    natRaw   = '';
    ddOpen   = false;

    _flagEl.textContent   = c.flag;
    _cnameEl.textContent  = c.name;
    _dialEl.value         = c.dial;
    _natEl.value          = '';
    _natEl.placeholder    = maskToPlaceholder(c.mask);
    _chevron.style.transform = '';
    _dd.classList.remove('pi-dd--open');
    _searchEl.value = '';
    renderList();
    syncHidden();
    setTimeout(() => _natEl.focus(), 40);
  }

  mountEl.style.position = 'relative';

  mountEl.innerHTML = `
    <div class="pi-card">
      <button type="button" class="pi-country-btn">
        <span class="pi-flag">${selected.flag}</span>
        <span class="pi-cname">${selected.name}</span>
        <i class="pi-chevron ti ti-chevron-down"></i>
      </button>
      <div class="pi-sep"></div>
      <div class="pi-num-row">
        <span class="pi-plus">+</span>
        <input class="pi-dial" type="text" inputmode="numeric" maxlength="5" value="${selected.dial}">
        <div class="pi-vsep"></div>
        <input class="pi-national" type="tel" inputmode="numeric"
               placeholder="${maskToPlaceholder(selected.mask)}">
      </div>
    </div>
    <div class="pi-dd">
      <div class="pi-search-wrap">
        <input class="pi-search" type="text" placeholder="Поиск страны...">
      </div>
      <div class="pi-list"></div>
    </div>`;

  _card    = mountEl.querySelector('.pi-card');
  _dd      = mountEl.querySelector('.pi-dd');
  _dialEl  = mountEl.querySelector('.pi-dial');
  _natEl   = mountEl.querySelector('.pi-national');
  _searchEl = mountEl.querySelector('.pi-search');
  _listEl  = mountEl.querySelector('.pi-list');
  _chevron = mountEl.querySelector('.pi-chevron');
  _flagEl  = mountEl.querySelector('.pi-flag');
  _cnameEl = mountEl.querySelector('.pi-cname');

  renderList();

  _card.querySelector('.pi-country-btn').addEventListener('click', () => {
    ddOpen = !ddOpen;
    _dd.classList.toggle('pi-dd--open', ddOpen);
    _chevron.style.transform = ddOpen ? 'rotate(180deg)' : '';
    if (ddOpen) setTimeout(() => _searchEl.focus(), 40);
  });

  _searchEl.addEventListener('input', () => renderList(_searchEl.value));

  _listEl.addEventListener('click', e => {
    const item = e.target.closest('.pi-item');
    if (!item) return;
    const c = COUNTRIES.find(x => x.iso === item.dataset.iso);
    if (c) applyCountry(c);
  });

  _dialEl.addEventListener('input', () => {
    const d = _dialEl.value.replace(/\D/g, '');
    _dialEl.value = d;
    const match = COUNTRIES.find(c => c.dial === d);
    if (match && match.iso !== selected.iso) {
      selected = match;
      natRaw   = '';
      _flagEl.textContent  = match.flag;
      _cnameEl.textContent = match.name;
      _natEl.value         = '';
      _natEl.placeholder   = maskToPlaceholder(match.mask);
      renderList(_searchEl.value);
    }
    syncHidden();
  });

  _natEl.addEventListener('input', () => {
    natRaw = _natEl.value.replace(/\D/g, '');
    _natEl.value = formatNational(natRaw, selected.mask);
    syncHidden();
  });

  if (onEnter) {
    _natEl.addEventListener('keydown',  e => { if (e.key === 'Enter') onEnter(); });
    _dialEl.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter(); });
  }

  document.addEventListener('click', e => {
    if (ddOpen && !mountEl.contains(e.target)) {
      ddOpen = false;
      _dd.classList.remove('pi-dd--open');
      _chevron.style.transform = '';
    }
  }, { signal: ac.signal });

  syncHidden();

  return () => ac.abort();
}
