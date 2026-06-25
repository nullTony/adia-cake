// ================================
//  FORMAT UTILITIES
//  Shared price, date, and HTML-escaping helpers.
// ================================

// Formats a price as "85 000 сум" (space-separated thousands)
export function formatPrice(val) {
  return String(Math.round(val || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' сум';
}

// Formats a date+time ISO string as "DD.MM.YYYY, HH:MM"
export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Formats a date-only ISO string as "DD.MM.YYYY"
export function formatDateOnly(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Escapes HTML special characters to prevent XSS
export function esc(str) {
  return (str || '').toString()
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
