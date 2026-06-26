// ================================
//  AUTH GUARD
//  Wrap any action with guardAction(fn).
//  If the user is logged in, fn() runs immediately.
//  Otherwise the auth modal opens; fn() runs after successful login.
// ================================

import { isAuthenticated } from '../services/auth-service.js';
import { openAuthModal } from './auth-modal.js';

function closeAllModals() {
  document.getElementById('qvOverlay')?.classList.remove('open');
  document.getElementById('cartPanel')?.classList.remove('open');
  document.getElementById('favPanel')?.classList.remove('open');
  document.getElementById('panelBackdrop')?.classList.remove('open');
}

export function guardAction(fn) {
  if (isAuthenticated()) {
    fn();
  } else {
    closeAllModals();
    // Wait for modal close animation before opening auth modal
    setTimeout(() => {
      openAuthModal({ onSuccess: fn });
    }, 150);
  }
}
