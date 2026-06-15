// ================================
//  BRANCH STORE — localStorage-backed
//  Persists the currently selected branch across pages.
//  Dispatches 'adia:branch-change' when branch changes.
// ================================

const KEY = 'adia_branch';

export function getSelectedBranch() {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; }
  catch { return null; }
}

// Saves { id, name, address } and dispatches adia:branch-change
export function setSelectedBranch(branch) {
  if (branch) {
    localStorage.setItem(KEY, JSON.stringify({
      id:      branch.id,
      name:    branch.name    || '',
      address: branch.address || '',
    }));
  } else {
    localStorage.removeItem(KEY);
  }
  window.dispatchEvent(new CustomEvent('adia:branch-change', {
    detail: { branch: branch || null },
  }));
}

export function getSelectedBranchId() {
  return getSelectedBranch()?.id || null;
}

export function getSelectedBranchName() {
  return getSelectedBranch()?.name || null;
}
