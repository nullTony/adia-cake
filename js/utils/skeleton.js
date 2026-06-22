// ================================
//  SKELETON UTILITIES
//  Generates placeholder HTML matching real card/table DOM structure.
//  Skeleton is replaced automatically when real data renders.
// ================================

// Product card skeleton — matches real .product-card DOM structure
export function createProductSkeletons(count = 6) {
  return Array.from({ length: count }, (_, i) => `
    <div class="product-card skeleton" style="--i:${i}">
      <div class="pc-img"></div>
      <div class="pc-body"></div>
    </div>
  `).join('');
}

// Category card skeleton — matches real .cat-card DOM structure
export function createCategorySkeletons(count = 5) {
  return Array.from({ length: count }, (_, i) => `
    <div class="cat-card skeleton" style="--i:${i}">
      <div class="cat-ph-wrap"><div class="cat-ph"></div></div>
      <div class="cat-overlay"></div>
      <div class="cat-body">
        <div class="skeleton-title" style="width:60%"></div>
        <div class="skeleton-text" style="width:40%"></div>
      </div>
    </div>
  `).join('');
}

// Table row skeleton for admin tables
export function createTableSkeletons(rowCount = 5, colCount = 4) {
  return Array.from({ length: rowCount }, () =>
    `<tr>${Array.from({ length: colCount }, (_, j) =>
      `<td><div class="skeleton skeleton-text" style="width:${[80, 60, 70, 50, 75][j % 5]}%"></div></td>`
    ).join('')}</tr>`
  ).join('');
}
