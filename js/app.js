/* ============================================================
   EXPENSE & BUDGET VISUALIZER — app.js
   Pure Vanilla JS | LocalStorage | Chart.js pie chart
   Features: add/delete transactions, income/expense, custom
   categories, sort, dark/light toggle, confirm-delete modal
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────
// 1. STATE
// ─────────────────────────────────────────────
let transactions = [];   // { id, name, amount, type, category, date }
let categories   = [];   // string[]  (user-defined + defaults)
let currentSort  = 'newest';
let pendingDeleteId = null;
let pieChart     = null; // Chart.js instance

const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];

// Category → emoji map (auto-populated for defaults; custom ones store their own)
const CATEGORY_EMOJI = {
  Food:      '🍔',
  Transport: '🚗',
  Fun:       '🎮',
};

// ─────────────────────────────────────────────
// 2. DOM REFERENCES
// ─────────────────────────────────────────────
const dom = {
  html:           document.documentElement,
  themeToggle:    document.getElementById('themeToggle'),
  themeIcon:      document.querySelector('.theme-icon'),

  // Balance
  totalBalance:   document.getElementById('totalBalance'),
  totalIncome:    document.getElementById('totalIncome'),
  totalExpense:   document.getElementById('totalExpense'),

  // Form
  form:           document.getElementById('transactionForm'),
  itemName:       document.getElementById('itemName'),
  amount:         document.getElementById('amount'),
  amountType:     document.getElementById('amountType'),
  category:       document.getElementById('category'),
  errName:        document.getElementById('err-name'),
  errAmount:      document.getElementById('err-amount'),
  errCategory:    document.getElementById('err-category'),

  // Sort / Clear
  sortSelect:     document.getElementById('sortSelect'),
  clearAll:       document.getElementById('clearAll'),

  // List
  transactionList: document.getElementById('transactionList'),
  listEmpty:       document.getElementById('listEmpty'),

  // Chart
  pieChart:       document.getElementById('pieChart'),
  chartEmpty:     document.getElementById('chartEmpty'),

  // Custom Category Modal
  openCatModal:   document.getElementById('openCatModal'),
  catModal:       document.getElementById('catModal'),
  catEmoji:       document.getElementById('catEmoji'),
  catName:        document.getElementById('catName'),
  errCatName:     document.getElementById('err-catName'),
  saveCat:        document.getElementById('saveCat'),
  closeCatModal:  document.getElementById('closeCatModal'),

  // Confirm Delete Modal
  confirmModal:   document.getElementById('confirmModal'),
  confirmDelete:  document.getElementById('confirmDelete'),
  cancelDelete:   document.getElementById('cancelDelete'),
};

// ─────────────────────────────────────────────
// 3. LOCAL STORAGE
// ─────────────────────────────────────────────
const LS_KEYS = {
  transactions: 'bv_transactions',
  categories:   'bv_categories',
  theme:        'bv_theme',
  sort:         'bv_sort',
};

function saveToStorage() {
  localStorage.setItem(LS_KEYS.transactions, JSON.stringify(transactions));
  localStorage.setItem(LS_KEYS.categories,   JSON.stringify(categories));
}

function loadFromStorage() {
  try {
    const txRaw  = localStorage.getItem(LS_KEYS.transactions);
    const catRaw = localStorage.getItem(LS_KEYS.categories);

    transactions = txRaw  ? JSON.parse(txRaw)  : [];
    categories   = catRaw ? JSON.parse(catRaw) : [...DEFAULT_CATEGORIES];
  } catch {
    transactions = [];
    categories   = [...DEFAULT_CATEGORIES];
  }

  // Ensure defaults always present
  DEFAULT_CATEGORIES.forEach(c => {
    if (!categories.includes(c)) categories.unshift(c);
  });

  // Restore sort preference
  const savedSort = localStorage.getItem(LS_KEYS.sort);
  if (savedSort) {
    currentSort = savedSort;
    dom.sortSelect.value = savedSort;
  }
}

// ─────────────────────────────────────────────
// 4. THEME
// ─────────────────────────────────────────────
function applyTheme(theme) {
  dom.html.setAttribute('data-theme', theme);
  dom.themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
  localStorage.setItem(LS_KEYS.theme, theme);
}

function toggleTheme() {
  const current = dom.html.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Redraw chart so its colours stay consistent
  renderChart();
}

function loadTheme() {
  const saved = localStorage.getItem(LS_KEYS.theme) || 'dark';
  applyTheme(saved);
}

// ─────────────────────────────────────────────
// 5. CATEGORIES
// ─────────────────────────────────────────────
function renderCategoryOptions() {
  // Keep first placeholder option, replace the rest
  dom.category.innerHTML = '<option value="">— Select —</option>';
  categories.forEach(cat => {
    const emoji  = CATEGORY_EMOJI[cat] || '🏷️';
    const option = document.createElement('option');
    option.value       = cat;
    option.textContent = `${emoji} ${cat}`;
    dom.category.appendChild(option);
  });
}

function addCustomCategory(emoji, name) {
  const trimmed = name.trim();
  if (categories.map(c => c.toLowerCase()).includes(trimmed.toLowerCase())) {
    return false; // duplicate
  }
  if (emoji.trim()) {
    CATEGORY_EMOJI[trimmed] = emoji.trim();
  }
  categories.push(trimmed);
  saveToStorage();
  renderCategoryOptions();
  return true;
}

// ─────────────────────────────────────────────
// 6. TRANSACTIONS — ADD / DELETE
// ─────────────────────────────────────────────
function generateId() {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('id-ID', {
    style:    'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  });
}

function addTransaction(name, amount, type, category) {
  const tx = {
    id:       generateId(),
    name:     name.trim(),
    amount:   parseInt(amount, 10),
    type,               // 'income' | 'expense'
    category,
    date:     new Date().toISOString(),
  };
  transactions.push(tx);
  saveToStorage();
  refresh();
}

function deleteTransaction(id) {
  transactions = transactions.filter(tx => tx.id !== id);
  saveToStorage();
  refresh();
}

function clearAllTransactions() {
  transactions = [];
  saveToStorage();
  refresh();
}

// ─────────────────────────────────────────────
// 7. BALANCE CALCULATION
// ─────────────────────────────────────────────
function updateBalance() {
  let income  = 0;
  let expense = 0;

  transactions.forEach(tx => {
    if (tx.type === 'income')  income  += tx.amount;
    else                        expense += tx.amount;
  });

  const balance = income - expense;

  dom.totalBalance.textContent = formatCurrency(balance);
  dom.totalIncome.textContent  = formatCurrency(income);
  dom.totalExpense.textContent = formatCurrency(expense);

  // Colour the balance value
  dom.totalBalance.style.textShadow =
    balance < 0
      ? '0 0 20px rgba(244,106,106,0.5)'
      : '0 0 20px rgba(52,195,143,0.3)';
}

// ─────────────────────────────────────────────
// 8. SORT
// ─────────────────────────────────────────────
function getSortedTransactions() {
  const copy = [...transactions];

  switch (currentSort) {
    case 'newest':
      return copy.sort((a, b) => new Date(b.date) - new Date(a.date));
    case 'oldest':
      return copy.sort((a, b) => new Date(a.date) - new Date(b.date));
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'category':
      return copy.sort((a, b) => a.category.localeCompare(b.category));
    default:
      return copy;
  }
}

// ─────────────────────────────────────────────
// 9. RENDER TRANSACTION LIST
// ─────────────────────────────────────────────
function renderList() {
  const sorted = getSortedTransactions();
  dom.transactionList.innerHTML = '';

  if (sorted.length === 0) {
    dom.listEmpty.classList.add('visible');
    return;
  }
  dom.listEmpty.classList.remove('visible');

  sorted.forEach(tx => {
    const emoji = CATEGORY_EMOJI[tx.category] || '🏷️';
    const sign  = tx.type === 'income' ? '+' : '−';

    const li = document.createElement('li');
    li.className = `transaction-item ${tx.type}`;
    li.dataset.id = tx.id;

    li.innerHTML = `
      <div class="tx-icon" aria-hidden="true">${emoji}</div>
      <div class="tx-info">
        <p class="tx-name">${escapeHtml(tx.name)}</p>
        <p class="tx-meta">
          <span class="tx-cat-badge">${escapeHtml(tx.category)}</span>
          <span>${formatDate(tx.date)}</span>
        </p>
      </div>
      <span class="tx-amount">${sign}${formatCurrency(tx.amount)}</span>
      <button class="tx-delete" data-id="${tx.id}" aria-label="Delete ${escapeHtml(tx.name)}">✕</button>
    `;

    dom.transactionList.appendChild(li);
  });
}

// ─────────────────────────────────────────────
// 10. PIE CHART  (Chart.js)
// ─────────────────────────────────────────────
function buildChartData() {
  // Only count expenses
  const expenseTxs = transactions.filter(tx => tx.type === 'expense');
  const totals = {};

  expenseTxs.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  return {
    labels: Object.keys(totals),
    data:   Object.values(totals),
  };
}

// Palette that works on both themes
const CHART_COLORS = [
  '#6c63ff', '#34c38f', '#f46a6a', '#f1b44c',
  '#50a5f1', '#e83e8c', '#20c997', '#fd7e14',
  '#6f42c1', '#17a2b8',
];

function renderChart() {
  const { labels, data } = buildChartData();
  const isDark = dom.html.getAttribute('data-theme') === 'dark';

  const hasData = data.length > 0;
  dom.chartEmpty.style.display = hasData ? 'none' : 'block';

  if (!hasData) {
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    return;
  }

  const chartConfig = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderColor:      isDark ? '#1e2130' : '#ffffff',
        borderWidth:      3,
        hoverOffset:      8,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      cutout:              '58%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:      isDark ? '#8b8fa8' : '#5a5e7a',
            padding:    16,
            font:       { size: 12, family: "'Segoe UI', sans-serif" },
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((ctx.parsed / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${formatCurrency(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  };

  if (pieChart) {
    // Update in place to animate the change
    pieChart.data                         = chartConfig.data;
    pieChart.options.plugins.legend.labels.color =
      isDark ? '#8b8fa8' : '#5a5e7a';
    pieChart.options.plugins.legend.labels.color =
      isDark ? '#8b8fa8' : '#5a5e7a';
    pieChart.update();
  } else {
    pieChart = new Chart(dom.pieChart, chartConfig);
  }
}

// ─────────────────────────────────────────────
// 11. VALIDATION
// ─────────────────────────────────────────────
function clearErrors() {
  [dom.errName, dom.errAmount, dom.errCategory].forEach(el => el.textContent = '');
  [dom.itemName, dom.amount, dom.category].forEach(el => el.classList.remove('invalid'));
}

function validateForm() {
  clearErrors();
  let valid = true;

  if (!dom.itemName.value.trim()) {
    dom.errName.textContent = 'Item name is required.';
    dom.itemName.classList.add('invalid');
    valid = false;
  }

  const amt = parseInt(dom.amount.value, 10);
  if (!dom.amount.value || isNaN(amt) || amt <= 0) {
    dom.errAmount.textContent = 'Masukkan jumlah yang valid (lebih dari 0).';
    dom.amount.classList.add('invalid');
    valid = false;
  }

  if (!dom.category.value) {
    dom.errCategory.textContent = 'Please select a category.';
    dom.category.classList.add('invalid');
    valid = false;
  }

  return valid;
}

// ─────────────────────────────────────────────
// 12. CENTRAL REFRESH
// ─────────────────────────────────────────────
function refresh() {
  updateBalance();
  renderList();
  renderChart();
}

// ─────────────────────────────────────────────
// 13. UTILITY
// ─────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

// ─────────────────────────────────────────────
// 14. MODAL HELPERS
// ─────────────────────────────────────────────
function openModal(el) {
  el.hidden = false;
  // Trap focus inside modal — focus first interactive element
  requestAnimationFrame(() => {
    const first = el.querySelector('input, button, select');
    if (first) first.focus();
  });
}

function closeModal(el) {
  el.hidden = true;
}

// Close modal on overlay click (not on the modal box itself)
function onOverlayClick(e, el) {
  if (e.target === el) closeModal(el);
}

// ─────────────────────────────────────────────
// 15. EVENT LISTENERS
// ─────────────────────────────────────────────

// — Theme toggle
dom.themeToggle.addEventListener('click', toggleTheme);

// — Submit form
dom.form.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateForm()) return;

  addTransaction(
    dom.itemName.value,
    dom.amount.value,
    dom.amountType.value,
    dom.category.value
  );

  // Reset form
  dom.form.reset();
  clearErrors();
});

// — Sort change
dom.sortSelect.addEventListener('change', () => {
  currentSort = dom.sortSelect.value;
  localStorage.setItem(LS_KEYS.sort, currentSort);
  renderList();
});

// — Clear all
dom.clearAll.addEventListener('click', () => {
  if (transactions.length === 0) return;
  // Re-use confirm modal for this too
  pendingDeleteId = '__ALL__';
  document.getElementById('confirmTitle').textContent = 'Clear All Transactions?';
  document.querySelector('.confirm-text').textContent =
    `This will permanently delete all ${transactions.length} transaction(s).`;
  openModal(dom.confirmModal);
});

// — Delete button (event delegation on the list)
dom.transactionList.addEventListener('click', e => {
  const btn = e.target.closest('.tx-delete');
  if (!btn) return;
  pendingDeleteId = btn.dataset.id;
  document.getElementById('confirmTitle').textContent = 'Delete Transaction?';
  document.querySelector('.confirm-text').textContent = 'This action cannot be undone.';
  openModal(dom.confirmModal);
});

// — Confirm delete
dom.confirmDelete.addEventListener('click', () => {
  if (pendingDeleteId === '__ALL__') {
    clearAllTransactions();
  } else if (pendingDeleteId) {
    deleteTransaction(pendingDeleteId);
  }
  pendingDeleteId = null;
  closeModal(dom.confirmModal);
});

// — Cancel delete
dom.cancelDelete.addEventListener('click', () => {
  pendingDeleteId = null;
  closeModal(dom.confirmModal);
});

// Confirm modal overlay click
dom.confirmModal.addEventListener('click', e => onOverlayClick(e, dom.confirmModal));

// — Open custom-category modal
dom.openCatModal.addEventListener('click', () => {
  dom.catEmoji.value    = '';
  dom.catName.value     = '';
  dom.errCatName.textContent = '';
  openModal(dom.catModal);
});

// — Save custom category
dom.saveCat.addEventListener('click', () => {
  dom.errCatName.textContent = '';
  const name  = dom.catName.value.trim();
  const emoji = dom.catEmoji.value.trim();

  if (!name) {
    dom.errCatName.textContent = 'Category name cannot be empty.';
    dom.catName.classList.add('invalid');
    return;
  }
  dom.catName.classList.remove('invalid');

  const added = addCustomCategory(emoji, name);
  if (!added) {
    dom.errCatName.textContent = 'This category already exists.';
    dom.catName.classList.add('invalid');
    return;
  }

  // Pre-select the new category in the form
  dom.category.value = name;
  closeModal(dom.catModal);
});

// — Close category modal
dom.closeCatModal.addEventListener('click', () => closeModal(dom.catModal));
dom.catModal.addEventListener('click', e => onOverlayClick(e, dom.catModal));

// — Enter key in category modal name input
dom.catName.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); dom.saveCat.click(); }
});

// — Escape key closes any open modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!dom.catModal.hidden)     closeModal(dom.catModal);
    if (!dom.confirmModal.hidden) { pendingDeleteId = null; closeModal(dom.confirmModal); }
  }
});

// — Clear form field error styling on input
dom.itemName.addEventListener('input',  () => { dom.errName.textContent     = ''; dom.itemName.classList.remove('invalid'); });
dom.amount.addEventListener('input',    () => { dom.errAmount.textContent   = ''; dom.amount.classList.remove('invalid');   });
dom.category.addEventListener('change', () => { dom.errCategory.textContent = ''; dom.category.classList.remove('invalid'); });

// ─────────────────────────────────────────────
// 16. INIT
// ─────────────────────────────────────────────
function init() {
  loadTheme();
  loadFromStorage();
  renderCategoryOptions();
  refresh();
}

init();
