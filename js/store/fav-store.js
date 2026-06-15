// ================================
//  FAVOURITES STORE — localStorage-backed
// ================================
//
//  Favourite item shape:
//  { id, name, priceVal, priceStr, unit, img }

const FAV_KEY = 'adia_favorites';

export function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY)) || [];
  } catch {
    return [];
  }
}

function saveFavorites(favs) {
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

export function isFavorite(id) {
  return getFavorites().some(f => f.id === id);
}

export function addToFavorites(product) {
  if (isFavorite(product.id)) return;
  const favs = getFavorites();
  favs.push({ id: product.id, name: product.name, priceVal: product.priceVal, priceStr: product.priceStr, unit: product.unit, img: product.img });
  saveFavorites(favs);
}

export function removeFromFavorites(id) {
  saveFavorites(getFavorites().filter(f => f.id !== id));
}

export function toggleFavorite(product) {
  if (isFavorite(product.id)) {
    removeFromFavorites(product.id);
    return false;
  } else {
    addToFavorites(product);
    return true;
  }
}

export function getFavCount() {
  return getFavorites().length;
}

export function clearFavorites() {
  localStorage.removeItem(FAV_KEY);
}
