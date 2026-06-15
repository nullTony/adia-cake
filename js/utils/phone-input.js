// ================================
//  PHONE INPUT UTILITY
//  Simple +998 prefix formatter for admin/checkout inputs.
//  NOT the full country-selector component (that's js/modules/phone-input.js).
// ================================

// Format digits as UZ local part: XX XXX XX XX
function _formatLocal(digits) {
  digits = digits.replace(/\D/g, '').slice(0, 9);
  let out = '';
  if (digits.length > 0) out  = digits.slice(0, 2);
  if (digits.length > 2) out += ' ' + digits.slice(2, 5);
  if (digits.length > 5) out += ' ' + digits.slice(5, 7);
  if (digits.length > 7) out += ' ' + digits.slice(7, 9);
  return out;
}

// Set initial value. Parses an existing phone or sets +998 prefix.
export function initPhoneInput(inputEl, defaultPhone = null) {
  if (defaultPhone) {
    const digits = defaultPhone.replace(/\D/g, '');
    if (digits.startsWith('998')) {
      inputEl.value = '+998 ' + _formatLocal(digits.slice(3));
    } else if (digits.length > 0) {
      inputEl.value = '+' + digits;
    } else {
      inputEl.value = '+998 ';
    }
    return;
  }
  if (!inputEl.value) inputEl.value = '+998 ';
}

// Wire formatting event listeners. Call once per input.
export function handlePhoneInput(inputEl) {
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && (inputEl.value === '+' || inputEl.value === '')) {
      e.preventDefault();
    }
  });

  inputEl.addEventListener('input', () => {
    let val = inputEl.value;
    if (!val.startsWith('+')) val = '+' + val.replace(/\+/g, '');
    const digits = val.replace(/\D/g, '');
    if (digits.startsWith('998') && digits.length > 3) {
      inputEl.value = '+998 ' + _formatLocal(digits.slice(3));
    } else {
      inputEl.value = val;
    }
  });

  inputEl.addEventListener('focus', () => {
    if (!inputEl.value) inputEl.value = '+998 ';
  });

  inputEl.addEventListener('blur', () => {
    if (!inputEl.value.replace(/\D/g, '')) inputEl.value = '+998 ';
  });
}

// Returns phone stripped of spaces for DB storage: +998XXXXXXXXX
export function getPhoneValue(inputEl) {
  return inputEl.value.replace(/\s+/g, '');
}
