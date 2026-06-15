// ================================
//  AUTH GUARD
//  Wrap any action with guardAction(fn).
//  If the user is logged in, fn() runs immediately.
//  Otherwise the auth modal opens; fn() runs after successful login.
// ================================

import { isAuthenticated } from '../services/auth-service.js';
import { openAuthModal } from './auth-modal.js';

export function guardAction(fn) {
  if (isAuthenticated()) {
    fn();
  } else {
    openAuthModal({ onSuccess: fn });
  }
}
