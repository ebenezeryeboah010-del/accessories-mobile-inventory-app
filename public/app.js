const app = document.querySelector("#app");
const state = {
  token: localStorage.getItem("token"),
  me: null,
  business: null,
  page: "Dashboard",
  authMode: "login",
  resetToken: "",
  accounting: null,
  offlineQueue: JSON.parse(localStorage.getItem("offlineQueue") || "[]"),
  inventory: [],
  categories: [],
  analytics: null,
  notifications: [],
  users: [],
  filters: { q: "", category: "" },
  editing: null,
};

const pages = [
  ["Dashboard", "Dashboard"],
  ["Inventory", "Inventory"],
  ["Analytics", "Analytics"],
  ["Accounting", "Accounting"],
  ["Notifications", "Notifications"],
  ["Users", "Users"],
  ["Settings", "Settings"],
];

const icons = {
  Dashboard: "DB",
  Inventory: "IN",
  Analytics: "AN",
  Accounting: "AC",
  Notifications: "NT",
  Users: "US",
  Settings: "ST",
};

const currencies = [
  ["USD", "US Dollar"],
  ["GHS", "Ghana Cedi"],
  ["NGN", "Nigerian Naira"],
  ["ZAR", "South African Rand"],
  ["KES", "Kenyan Shilling"],
  ["UGX", "Ugandan Shilling"],
  ["TZS", "Tanzanian Shilling"],
  ["RWF", "Rwandan Franc"],
  ["XOF", "West African CFA Franc"],
  ["XAF", "Central African CFA Franc"],
  ["EGP", "Egyptian Pound"],
  ["MAD", "Moroccan Dirham"],
  ["DZD", "Algerian Dinar"],
  ["TND", "Tunisian Dinar"],
  ["ETB", "Ethiopian Birr"],
  ["MWK", "Malawian Kwacha"],
  ["ZMW", "Zambian Kwacha"],
  ["BWP", "Botswana Pula"],
  ["NAD", "Namibian Dollar"],
  ["SLL", "Sierra Leonean Leone"],
  ["LRD", "Liberian Dollar"],
  ["GMD", "Gambian Dalasi"],
  ["MZN", "Mozambican Metical"],
  ["AOA", "Angolan Kwanza"],
  ["CDF", "Congolese Franc"],
  ["GBP", "British Pound"],
  ["EUR", "Euro"],
];

async function api(path, options = {}) {
  if (!navigator.onLine && shouldQueueOffline(path, options)) {
    queueOfflineRequest(path, options);
    return { queued: true };
  }
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function shouldQueueOffline(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  return path.startsWith("/api/inventory") && ["POST", "PUT"].includes(method);
}

function queueOfflineRequest(path, options) {
  state.offlineQueue.push({
    id: crypto.randomUUID(),
    path,
    options: {
      method: options.method,
      body: options.body,
    },
    createdAt: new Date().toISOString(),
  });
  localStorage.setItem("offlineQueue", JSON.stringify(state.offlineQueue));
  toast("Saved offline. It will sync when internet returns.");
}

async function syncOfflineQueue() {
  if (!navigator.onLine || !state.token || !state.offlineQueue.length) return;
  const queue = [...state.offlineQueue];
  for (const entry of queue) {
    await fetch(entry.path, {
      ...entry.options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
      },
    });
    state.offlineQueue = state.offlineQueue.filter((item) => item.id !== entry.id);
    localStorage.setItem("offlineQueue", JSON.stringify(state.offlineQueue));
  }
  await loadAll();
  renderApp();
  toast("Offline inventory changes synced.");
}

function money(value) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: state.business?.settings?.currency || "USD" }).format(value || 0);
}

function date(value) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function toast(message) {
  let element = document.querySelector(".toast");
  if (!element) {
    element = document.createElement("div");
    element.className = "toast";
    document.body.appendChild(element);
  }
  element.textContent = message;
  element.classList.add("show");
  setTimeout(() => element.classList.remove("show"), 2600);
}

async function boot() {
  if (!state.token) return renderAuth();
  try {
    const me = await api("/api/me");
    state.me = me.user;
    state.business = me.business;
    document.body.classList.toggle("dark", Boolean(state.business.settings.darkMode));
    connectNotifications();
    await loadAll();
    renderApp();
  } catch {
    localStorage.removeItem("token");
    state.token = null;
    renderAuth();
  }
}

function connectNotifications() {
  if (window.__inventorySocketStarted || !state.token) return;
  window.__inventorySocketStarted = true;
  const script = document.createElement("script");
  script.src = "/socket.io/socket.io.js";
  script.onload = () => {
    if (!window.io) return;
    const socket = window.io({ auth: { token: state.token } });
    socket.on("notification", async (notification) => {
      state.notifications.unshift(notification);
      toast(notification.message);
      if (state.page === "Notifications" || state.page === "Dashboard") {
        await loadAll();
        renderApp();
      }
    });
  };
  script.onerror = () => {};
  document.head.appendChild(script);
}

async function loadAll() {
  const [inventory, analytics, notifications] = await Promise.all([
    api(`/api/inventory?q=${encodeURIComponent(state.filters.q)}&category=${encodeURIComponent(state.filters.category)}`),
    api("/api/analytics"),
    api("/api/notifications"),
  ]);
  state.inventory = inventory.items;
  state.categories = inventory.categories;
  state.analytics = analytics;
  state.notifications = notifications.notifications;
  if (["CEO", "Admin"].includes(state.me.role)) {
    state.users = (await api("/api/users")).users;
  }
}

function renderAuth(mode = state.authMode || "login") {
  state.authMode = mode;
  document.body.classList.remove("dark");
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-story">
        <h1>MobileHub Inventory</h1>
        <p>Stock control for phone shops, accessory counters, managers, staff, and CEOs who need fast counts and clean accountability.</p>
      </section>
      <section class="auth-card">
        <div class="tabs">
          <button class="${mode === "login" ? "active" : ""}" data-auth-tab="login">Login</button>
          <button class="${mode === "register" ? "active" : ""}" data-auth-tab="register">Register</button>
        </div>
        ${authForm(mode)}
      </section>
    </main>
  `;
}

function authForm(mode) {
  if (mode === "register") return registerForm();
  if (mode === "forgot") return forgotForm();
  if (mode === "reset") return resetForm();
  return loginForm();
}

function loginForm() {
  return `
    <form id="loginForm">
      <label class="field"><span>Email</span><input name="email" type="email" required /></label>
      <label class="field"><span>Password</span><input name="password" type="password" required /></label>
      <button class="primary wide" type="submit">Sign in</button>
      <button class="secondary wide" type="button" data-auth-tab="forgot" style="margin-top:10px">Forgot password?</button>
    </form>
  `;
}

function registerForm() {
  return `
    <form id="registerForm">
      <label class="field"><span>Business name</span><input name="businessName" required /></label>
      <label class="field"><span>Your name</span><input name="name" required /></label>
      <label class="field"><span>Email</span><input name="email" type="email" required /></label>
      <label class="field"><span>Password</span><input name="password" type="password" minlength="8" required /></label>
      <button class="primary wide" type="submit">Create account</button>
    </form>
  `;
}

function forgotForm() {
  return `
    <form id="forgotForm">
      <label class="field"><span>Email</span><input name="email" type="email" required /></label>
      <button class="primary wide" type="submit">Send reset code</button>
      <button class="secondary wide" type="button" data-auth-tab="login" style="margin-top:10px">Back to login</button>
    </form>
  `;
}

function resetForm() {
  return `
    <form id="resetForm">
      <label class="field"><span>Reset code</span><input name="token" value="${escapeHtml(state.resetToken)}" required /></label>
      <label class="field"><span>New password</span><input name="password" type="password" minlength="8" required /></label>
      <button class="primary wide" type="submit">Reset password</button>
      <button class="secondary wide" type="button" data-auth-tab="login" style="margin-top:10px">Back to login</button>
    </form>
  `;
}

function renderApp() {
  app.innerHTML = `
    <main class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">MH</span><span>${escapeHtml(state.business.name)}</span></div>
        <nav class="nav">
          ${pages.map(([name, icon]) => `<button class="${state.page === name ? "active" : ""}" data-page="${name}" aria-label="Open ${name}"><span class="nav-icon" title="${name}">${icons[icon]}</span>${name}</button>`).join("")}
        </nav>
      </aside>
      <section class="main">
        <header class="topbar">
          <div>
            <h2>${state.page}</h2>
            <p>${escapeHtml(state.me.name)} &middot; ${escapeHtml(state.me.role)}</p>
          </div>
          <div class="actions">
            <button class="secondary" data-refresh>Refresh</button>
            <button class="secondary" data-theme>${state.business.settings.darkMode ? "Light" : "Dark"}</button>
            <button class="danger" data-logout>Logout</button>
          </div>
        </header>
        ${renderPage()}
      </section>
    </main>
  `;
}

function renderPage() {
  if (state.page === "Dashboard") return dashboard();
  if (state.page === "Inventory") return inventory();
  if (state.page === "Analytics") return analytics();
  if (state.page === "Accounting") return accounting();
  if (state.page === "Notifications") return notifications();
  if (state.page === "Users") return users();
  return settings();
}

function dashboard() {
  const a = state.analytics;
  return `
    <section class="grid stats">
      ${metric("Total stock", a.totalStock, "Live")}
      ${metric("SKUs", a.totalItems, "Items")}
      ${metric("Stock value", money(a.stockValue), "Cost")}
      ${metric("Low stock", a.lowStock.length, "Alert")}
    </section>
    ${offlineBanner()}
    <section class="grid two-col" style="margin-top:16px">
      <div class="card">
        <h3>Category stock</h3>
        ${barChart(a.categoryTotals)}
      </div>
      <div class="card">
        <h3>Recent activity</h3>
        ${logList(a.logs)}
      </div>
    </section>
  `;
}

function offlineBanner() {
  if (navigator.onLine && !state.offlineQueue.length) return "";
  return `<section class="card" style="margin-top:16px"><strong>${navigator.onLine ? "Pending sync" : "Offline mode"}</strong><p class="muted">${state.offlineQueue.length} inventory change(s) waiting to sync.</p>${navigator.onLine ? `<button class="primary" data-sync-offline>Sync now</button>` : ""}</section>`;
}

function metric(label, value, chip) {
  return `<article class="card metric"><div><span>${label}</span><b>${value}</b></div><span class="chip">${chip}</span></article>`;
}

function barChart(rows) {
  const max = Math.max(1, ...rows.map((row) => row.quantity));
  const visible = rows.filter((row) => row.quantity > 0).slice(0, 10);
  if (!visible.length) return `<div class="empty">No category stock yet.</div>`;
  return `<div class="bar-chart">${visible.map((row) => `
    <div class="bar-row">
      <strong>${escapeHtml(row.name)}</strong>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(5, (row.quantity / max) * 100)}%"></div></div>
      <span>${row.quantity}</span>
    </div>`).join("")}</div>`;
}

function logList(logs) {
  if (!logs.length) return `<div class="empty">No activity yet.</div>`;
  return `<div class="log-list">${logs.map((entry) => `<div class="list-item"><strong>${escapeHtml(entry.action)}</strong><span class="muted">${date(entry.createdAt)}</span></div>`).join("")}</div>`;
}

function inventory() {
  const canWrite = ["CEO", "Admin", "Manager"].includes(state.me.role);
  const totalCost = state.inventory.reduce((sum, entry) => sum + entry.quantity * entry.costPrice, 0);
  const totalRetail = state.inventory.reduce((sum, entry) => sum + entry.quantity * entry.sellingPrice, 0);
  const totalUnitPrice = state.inventory.reduce((sum, entry) => sum + Number(entry.sellingPrice || 0), 0);
  return `
    <section class="grid stats" style="margin-bottom:16px">
      ${metric("Inventory cost", money(totalCost), "Sum")}
      ${metric("Retail value", money(totalRetail), "Sum")}
      ${metric("Potential profit", money(totalRetail - totalCost), "Margin")}
      ${metric("Total unit price", money(totalUnitPrice), "Units")}
    </section>
    <section class="grid two-col">
      <div class="card">
        <div class="toolbar">
          <input data-search placeholder="Search stock, SKU, type" value="${escapeHtml(state.filters.q)}" />
          <select data-filter-category>
            <option value="">All categories</option>
            ${state.categories.map((category) => `<option value="${category.id}" ${state.filters.category === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}
          </select>
          <button class="secondary" data-export>Export CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Category</th><th>In stock</th><th>Sold</th><th>Unit cost</th><th>Unit price</th><th>Total cost</th><th>Total retail</th><th>Barcode</th><th></th></tr></thead>
            <tbody>${state.inventory.map((entry) => row(entry, canWrite)).join("")}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h3>${state.editing ? "Edit stock" : "Add stock"}</h3>
        ${canWrite ? itemForm(state.editing) : `<div class="empty">Your role can view inventory only.</div>`}
      </div>
    </section>
  `;
}

function row(entry, canWrite) {
  const category = state.categories.find((candidate) => candidate.id === entry.categoryId);
  const low = entry.quantity <= Number(state.business.settings.lowStockThreshold || 8);
  return `
    <tr>
      <td><strong>${escapeHtml(entry.name)}</strong><br><span class="muted">${escapeHtml(entry.sku)} &middot; ${escapeHtml(entry.location)}</span></td>
      <td>${escapeHtml(category?.name || "Uncategorized")}</td>
      <td><span class="stock-pill ${low ? "low" : ""}">${entry.quantity}</span></td>
      <td><span class="stock-pill">${Number(entry.soldQuantity || 0)}</span></td>
      <td>${money(entry.costPrice)}</td>
      <td>${money(entry.sellingPrice)}</td>
      <td>${money(entry.quantity * entry.costPrice)}</td>
      <td>${money(entry.quantity * entry.sellingPrice)}</td>
      <td>${escapeHtml(entry.barcode)}</td>
      <td class="actions">
        ${canWrite ? `<button class="secondary" data-edit="${entry.id}">Edit</button><button class="danger" data-delete="${entry.id}">Delete</button>` : ""}
      </td>
    </tr>
  `;
}

function itemForm(item) {
  const current = item || {};
  return `
    <form id="itemForm" class="form-grid">
      <input type="hidden" name="id" value="${escapeHtml(current.id || "")}" />
      <label class="field wide"><span>Name</span><input name="name" value="${escapeHtml(current.name || "")}" required /></label>
      <label class="field"><span>Category</span><select name="categoryId" required>${state.categories.map((category) => `<option value="${category.id}" ${current.categoryId === category.id ? "selected" : ""}>${escapeHtml(category.name)}</option>`).join("")}</select></label>
      <label class="field"><span>Type</span><input name="type" value="${escapeHtml(current.type || "")}" placeholder="Android accessories" /></label>
      <label class="field"><span>Quantity</span><input name="quantity" type="number" min="0" value="${current.quantity ?? 0}" required /></label>
      <label class="field"><span>Sold quantity</span><input name="soldQuantity" type="number" min="0" value="${current.soldQuantity ?? 0}" /></label>
      <label class="field"><span>Cost price</span><input name="costPrice" type="number" min="0" step="0.01" value="${current.costPrice ?? 0}" /></label>
      <label class="field"><span>Selling price</span><input name="sellingPrice" type="number" min="0" step="0.01" value="${current.sellingPrice ?? 0}" /></label>
      <label class="field"><span>Location</span><input name="location" value="${escapeHtml(current.location || "Main store")}" /></label>
      <label class="field wide"><span>Barcode</span><input name="barcode" value="${escapeHtml(current.barcode || "")}" placeholder="Auto generated when blank" /></label>
      <div class="actions wide">
        <button class="primary" type="submit">${item ? "Save changes" : "Add item"}</button>
        ${item ? `<button class="secondary" type="button" data-cancel-edit>Cancel</button>` : ""}
      </div>
    </form>
  `;
}

function analytics() {
  return `
    <section class="grid two-col">
      <div class="card"><h3>Stock by category</h3>${barChart(state.analytics.categoryTotals)}</div>
      <div class="card"><h3>Low stock alerts</h3>${lowStock()}</div>
    </section>
    <section class="card" style="margin-top:16px"><h3>Category stock and sold goods</h3>${categoryStockTable()}</section>
    <section class="card" style="margin-top:16px"><h3>Old and new stock after edits</h3>${stockHistoryTable()}</section>
    <section class="card" style="margin-top:16px"><h3>Activity monitoring</h3>${logList(state.analytics.logs)}</section>
  `;
}

function categoryStockTable() {
  const rows = state.analytics.categoryTotals || [];
  if (!rows.length) return `<div class="empty">No category stock yet.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Category</th><th>In stock</th><th>Sold</th><th>Total unit price</th><th>Stock value</th><th>Retail value</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${row.quantity}</td><td>${row.soldQuantity || 0}</td><td>${money(row.unitPriceTotal || 0)}</td><td>${money(row.stockValue || 0)}</td><td>${money(row.retailValue || 0)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function stockHistoryTable() {
  const rows = state.analytics.history || [];
  if (!rows.length) return `<div class="empty">No stock edits recorded yet.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Category</th><th>Action</th><th>Old stock</th><th>New stock</th><th>Sold</th><th>Date</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.categoryName)}</td><td>${escapeHtml(row.action)}</td><td>${row.oldQuantity}</td><td>${row.newQuantity}</td><td>${row.soldQuantity || 0}</td><td>${date(row.createdAt)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function accounting() {
  const a = state.accounting;
  if (!a) {
    loadAccounting();
    return `<section class="card"><div class="empty">Loading accounting summary...</div></section>`;
  }
  return `
    <section class="grid stats">
      ${metric("Inventory cost", money(a.inventoryValue), "Cost")}
      ${metric("Retail value", money(a.retailValue), "Retail")}
      ${metric("Potential profit", money(a.potentialProfit), "Margin")}
      ${metric("Provider", escapeHtml(a.provider), "Export")}
    </section>
    <section class="card" style="margin-top:16px">
      <div class="actions" style="justify-content:space-between">
        <h3>Accounting export</h3>
        <button class="secondary" data-accounting-export>Export accounting CSV</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Category</th><th>In stock</th><th>Sold</th><th>Total unit price</th><th>Cost value</th><th>Retail value</th></tr></thead>
          <tbody>${a.categoryRows.map((row) => `<tr><td>${escapeHtml(row.category)}</td><td>${row.quantity}</td><td>${row.soldQuantity || 0}</td><td>${money(row.unitPriceTotal || 0)}</td><td>${money(row.costValue)}</td><td>${money(row.retailValue)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

async function loadAccounting() {
  try {
    state.accounting = await api("/api/accounting/summary");
    if (state.page === "Accounting") renderApp();
  } catch (error) {
    toast(error.message);
  }
}

function lowStock() {
  if (!state.analytics.lowStock.length) return `<div class="empty">No low stock items.</div>`;
  return `<div class="notify-list">${state.analytics.lowStock.map((entry) => `<div class="list-item"><strong>${escapeHtml(entry.name)}</strong><span class="muted">${entry.quantity} remaining &middot; ${escapeHtml(entry.location)}</span></div>`).join("")}</div>`;
}

function notifications() {
  if (!state.notifications.length) return `<section class="card"><div class="empty">No notifications yet.</div></section>`;
  return `<section class="card"><div class="notify-list">${state.notifications.map((entry) => `<div class="list-item"><strong>${escapeHtml(entry.message)}</strong><span class="muted">${date(entry.createdAt)}</span></div>`).join("")}</div></section>`;
}

function users() {
  if (!["CEO", "Admin"].includes(state.me.role)) return `<section class="card"><div class="empty">User management is available to CEO and Admin roles.</div></section>`;
  return `
    <section class="grid two-col">
      <div class="card">
        <h3>Business users</h3>
        <div class="user-list">${state.users.map((user) => `<div class="list-item"><strong>${escapeHtml(user.name)}</strong><span class="muted">${escapeHtml(user.email)} &middot; ${escapeHtml(user.role)}</span></div>`).join("")}</div>
      </div>
      <div class="card">
        <h3>Add user</h3>
        <form id="userForm" class="form-grid">
          <label class="field wide"><span>Name</span><input name="name" required /></label>
          <label class="field wide"><span>Email</span><input name="email" type="email" required /></label>
          <label class="field"><span>Role</span><select name="role"><option>Manager</option><option>Staff</option><option>Admin</option><option>CEO</option></select></label>
          <label class="field"><span>Password</span><input name="password" type="password" minlength="8" required /></label>
          <button class="primary wide" type="submit">Create user</button>
        </form>
      </div>
    </section>
  `;
}

function settings() {
  const settings = state.business.settings;
  return `
    <section class="card">
      <form id="settingsForm" class="form-grid">
        <label class="field"><span>Low stock threshold</span><input name="lowStockThreshold" type="number" min="1" value="${settings.lowStockThreshold}" /></label>
        <label class="field"><span>Currency</span><select name="currency">${currencies.map(([code, label]) => `<option value="${code}" ${settings.currency === code ? "selected" : ""}>${code} - ${label}</option>`).join("")}</select></label>
        <label class="field"><span>Night vision mode</span><select name="darkMode"><option value="false" ${!settings.darkMode ? "selected" : ""}>Off</option><option value="true" ${settings.darkMode ? "selected" : ""}>On</option></select></label>
        <label class="field"><span>CEO stock notifications</span><select name="notifyCeoOnManagerStock"><option value="true" ${settings.notifyCeoOnManagerStock ? "selected" : ""}>On</option><option value="false" ${!settings.notifyCeoOnManagerStock ? "selected" : ""}>Off</option></select></label>
        <label class="field"><span>Email notifications</span><select name="emailNotifications"><option value="true" ${settings.emailNotifications !== false ? "selected" : ""}>On</option><option value="false" ${settings.emailNotifications === false ? "selected" : ""}>Off</option></select></label>
        <label class="field"><span>SMS notifications</span><select name="smsNotifications"><option value="false" ${!settings.smsNotifications ? "selected" : ""}>Off</option><option value="true" ${settings.smsNotifications ? "selected" : ""}>On</option></select></label>
        <label class="field"><span>Accounting provider</span><select name="accountingProvider">${["CSV", "QuickBooks", "Xero", "Wave", "Zoho Books"].map((provider) => `<option value="${provider}" ${(settings.accountingProvider || "CSV") === provider ? "selected" : ""}>${provider}</option>`).join("")}</select></label>
        <label class="field"><span>Email destination</span><input name="accountingEmail" type="email" value="${escapeHtml(settings.accountingEmail || "")}" placeholder="owner@example.com" /></label>
        <label class="field wide"><span>SMS phone number</span><input name="smsPhone" value="${escapeHtml(settings.smsPhone || "")}" placeholder="+233..." /></label>
        <button class="primary wide" type="submit">Save settings</button>
      </form>
    </section>
  `;
}

app.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.authTab) renderAuth(target.dataset.authTab);
  if (target.dataset.page) {
    state.page = target.dataset.page;
    renderApp();
  }
  if (target.dataset.logout !== undefined) {
    localStorage.removeItem("token");
    location.reload();
  }
  if (target.dataset.refresh !== undefined) {
    await loadAll();
    renderApp();
    toast("Dashboard refreshed");
  }
  if (target.dataset.theme !== undefined) {
    await saveSettings({ ...state.business.settings, darkMode: !state.business.settings.darkMode });
  }
  if (target.dataset.edit) {
    state.editing = state.inventory.find((entry) => entry.id === target.dataset.edit);
    renderApp();
  }
  if (target.dataset.cancelEdit !== undefined) {
    state.editing = null;
    renderApp();
  }
  if (target.dataset.delete) {
    if (!confirm("Delete this inventory item?")) return;
    await api(`/api/inventory/${target.dataset.delete}`, { method: "DELETE" });
    await loadAll();
    renderApp();
    toast("Inventory item deleted");
  }
  if (target.dataset.export !== undefined) exportCsv();
  if (target.dataset.accountingExport !== undefined) exportAccountingCsv();
  if (target.dataset.syncOffline !== undefined) await syncOfflineQueue();
});

app.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const formId = form.getAttribute("id");
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (formId === "loginForm") {
      const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify(data) });
      localStorage.setItem("token", result.token);
      state.token = result.token;
      await boot();
      return toast("Signed in");
    }
    if (formId === "registerForm") {
      await api("/api/auth/register", { method: "POST", body: JSON.stringify(data) });
      renderAuth("login");
      return toast("Account created. Sign in with your new CEO account.");
    }
    if (formId === "forgotForm") {
      const result = await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify(data) });
      state.resetToken = result.resetToken || "";
      renderAuth("reset");
      return toast(result.message || "Reset instructions sent.");
    }
    if (formId === "resetForm") {
      await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify(data) });
      state.resetToken = "";
      renderAuth("login");
      return toast("Password reset. Sign in with your new password.");
    }
    if (formId === "itemForm") {
      const id = data.id;
      delete data.id;
      await api(id ? `/api/inventory/${id}` : "/api/inventory", { method: id ? "PUT" : "POST", body: JSON.stringify(data) });
      state.editing = null;
      if (navigator.onLine) await loadAll();
      renderApp();
      return toast(navigator.onLine ? (id ? "Stock updated" : "Stock added") : "Stock saved offline");
    }
    if (formId === "settingsForm") {
      await saveSettings({
        lowStockThreshold: Number(data.lowStockThreshold),
        currency: data.currency,
        darkMode: data.darkMode === "true",
        notifyCeoOnManagerStock: data.notifyCeoOnManagerStock === "true",
        emailNotifications: data.emailNotifications === "true",
        smsNotifications: data.smsNotifications === "true",
        accountingProvider: data.accountingProvider,
        accountingEmail: data.accountingEmail,
        smsPhone: data.smsPhone,
      });
    }
    if (formId === "userForm") {
      await api("/api/users", { method: "POST", body: JSON.stringify(data) });
      state.users = (await api("/api/users")).users;
      renderApp();
      return toast("User created. They can now sign in.");
    }
  } catch (error) {
    toast(error.message);
  }
});

app.addEventListener("input", async (event) => {
  if (event.target.matches("[data-search]")) {
    state.filters.q = event.target.value;
    await delayedInventoryLoad();
  }
});

app.addEventListener("change", async (event) => {
  if (event.target.matches("[data-filter-category]")) {
    state.filters.category = event.target.value;
    await delayedInventoryLoad();
  }
});

let searchTimer;
function delayedInventoryLoad() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const result = await api(`/api/inventory?q=${encodeURIComponent(state.filters.q)}&category=${encodeURIComponent(state.filters.category)}`);
    state.inventory = result.items;
    state.categories = result.categories;
    renderApp();
  }, 180);
}

async function saveSettings(settings) {
  const result = await api("/api/settings", { method: "PUT", body: JSON.stringify(settings) });
  state.business = result.business;
  document.body.classList.toggle("dark", Boolean(state.business.settings.darkMode));
  await loadAll();
  renderApp();
  toast("Settings saved");
}

function exportCsv() {
  const headers = ["Name", "SKU", "Type", "In Stock", "Sold", "Unit Cost", "Unit Price", "Total Cost", "Total Retail", "Location", "Barcode"];
  const lines = state.inventory.map((entry) => [
    entry.name,
    entry.sku,
    entry.type,
    entry.quantity,
    entry.soldQuantity || 0,
    entry.costPrice,
    entry.sellingPrice,
    entry.quantity * entry.costPrice,
    entry.quantity * entry.sellingPrice,
    entry.location,
    entry.barcode,
  ].map(csvCell).join(","));
  downloadCsv("mobile-inventory.csv", [headers.join(","), ...lines].join("\n"));
}

function exportAccountingCsv() {
  if (!state.accounting) return;
  const headers = ["Category", "In Stock", "Sold", "Total Unit Price", "Cost Value", "Retail Value"];
  const lines = state.accounting.categoryRows.map((row) => [row.category, row.quantity, row.soldQuantity || 0, row.unitPriceTotal || 0, row.costValue, row.retailValue].map(csvCell).join(","));
  const totals = ["TOTAL", "", "", "", state.accounting.inventoryValue, state.accounting.retailValue].map(csvCell).join(",");
  downloadCsv("accounting-summary.csv", [headers.join(","), ...lines, totals].join("\n"));
}

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

boot();

window.addEventListener("online", syncOfflineQueue);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
