/**
 * date.js
 * Formats today's date in Russian and injects it into .today-tag elements.
 */

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

export function getTodayLabel() {
  const d = new Date();
  return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}`;
}

export function initDateLabel() {
  const label = getTodayLabel();
  document.querySelectorAll('.today-tag').forEach((el) => {
    el.innerHTML = `📅 Сегодня, ${label}`;
  });
}
