const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 4173;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

const roles = {
  CEO: ["inventory:read", "inventory:write", "users:read", "notifications:read", "settings:write", "analytics:read"],
  Admin: ["inventory:read", "inventory:write", "users:read", "notifications:read", "settings:write", "analytics:read"],
  Manager: ["inventory:read", "inventory:write", "notifications:read", "analytics:read", "settings:write"],
  Staff: ["inventory:read", "notifications:read"],
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const emailProvider = process.env.EMAIL_PROVIDER || "";
const resendApiKey = process.env.RESEND_API_KEY || "";
const emailFrom = process.env.EMAIL_FROM || "no-reply@mobilehub.local";
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "";
const twilioFrom = process.env.TWILIO_FROM || "";

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) return;

  const businessId = crypto.randomUUID();
  const ceoId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const now = new Date().toISOString();

  const db = {
    businesses: [
      {
        id: businessId,
        name: "MobileHub Accessories",
        createdAt: now,
        settings: {
          lowStockThreshold: 8,
          darkMode: false,
          notifyCeoOnManagerStock: true,
          emailNotifications: true,
          smsNotifications: false,
          accountingProvider: "CSV",
          accountingEmail: "",
          smsPhone: "",
          currency: "USD",
        },
      },
    ],
    users: [
      {
        id: ceoId,
        businessId,
        name: "Amina CEO",
        email: "ceo@mobilehub.test",
        role: "CEO",
        passwordHash: hashPassword("password123"),
        createdAt: now,
      },
      {
        id: managerId,
        businessId,
        name: "Musa Manager",
        email: "manager@mobilehub.test",
        role: "Manager",
        passwordHash: hashPassword("password123"),
        createdAt: now,
      },
    ],
    categories: [
      { id: crypto.randomUUID(), businessId, name: "Android phones", group: "Phones" },
      { id: crypto.randomUUID(), businessId, name: "Cell phones", group: "Phones" },
      { id: crypto.randomUUID(), businessId, name: "Android accessories", group: "Accessories" },
      { id: crypto.randomUUID(), businessId, name: "Cell phone accessories", group: "Accessories" },
      { id: crypto.randomUUID(), businessId, name: "Chargers", group: "Power" },
      { id: crypto.randomUUID(), businessId, name: "Headsets and earphones", group: "Audio" },
      { id: crypto.randomUUID(), businessId, name: "AirPods", group: "Audio" },
      { id: crypto.randomUUID(), businessId, name: "Screen protectors", group: "Protection" },
      { id: crypto.randomUUID(), businessId, name: "Phone batteries", group: "Power" },
      { id: crypto.randomUUID(), businessId, name: "Other accessories", group: "Accessories" },
    ],
    inventory: [],
    notifications: [],
    notificationDeliveries: [],
    stockHistory: [],
    auditLogs: [],
    passwordResetTokens: [],
    sessions: [],
  };

  const categoryByName = Object.fromEntries(db.categories.map((category) => [category.name, category.id]));
  db.inventory = [
    item(businessId, categoryByName["Android phones"], "Samsung Galaxy A35", "Phones", 18, 210, 315, "Shelf A1"),
    item(businessId, categoryByName["Cell phones"], "Nokia 105", "Phones", 32, 18, 29, "Shelf A2"),
    item(businessId, categoryByName["Chargers"], "45W USB-C Fast Charger", "Android accessories", 6, 7, 15, "Bin C4"),
    item(businessId, categoryByName["Headsets and earphones"], "Braided Type-C Earphones", "Cell phone accessories", 24, 4, 10, "Bin D2"),
    item(businessId, categoryByName["AirPods"], "Wireless Earbuds Pro", "Cell phone accessories", 11, 19, 39, "Glass case"),
    item(businessId, categoryByName["Screen protectors"], "Tempered Glass Screen Saver", "Android accessories", 84, 1, 4, "Drawer S"),
    item(businessId, categoryByName["Phone batteries"], "BL-5C Replacement Battery", "Cell phone accessories", 5, 3, 8, "Battery rack"),
  ];
  db.auditLogs.push(log(businessId, ceoId, "System seeded demo inventory"));
  saveDb(db);
}

function item(businessId, categoryId, name, type, quantity, costPrice, sellingPrice, location) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    businessId,
    categoryId,
    name,
    sku: name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18),
    type,
    quantity,
    soldQuantity: 0,
    costPrice,
    sellingPrice,
    location,
    barcode: crypto.randomInt(100000000000, 999999999999).toString(),
    createdAt: now,
    updatedAt: now,
  };
}

function log(businessId, userId, action) {
  return { id: crypto.randomUUID(), businessId, userId, action, createdAt: new Date().toISOString() };
}

function stockChange(businessId, userId, categoryId, itemId, action, oldQuantity, newQuantity, soldQuantity) {
  return {
    id: crypto.randomUUID(),
    businessId,
    userId,
    categoryId,
    itemId,
    action,
    oldQuantity,
    newQuantity,
    soldQuantity,
    createdAt: new Date().toISOString(),
  };
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  return hashPassword(password, salt) === `${salt}:${hash}`;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function sanitize(input) {
  return String(input ?? "").trim().replace(/[<>]/g, "");
}

function getAuth(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const session = db.sessions.find((entry) => entry.token === token && Date.parse(entry.expiresAt) > Date.now());
  if (!session) return null;
  const user = db.users.find((entry) => entry.id === session.userId);
  if (!user) return null;
  const business = db.businesses.find((entry) => entry.id === user.businessId);
  return { user, business, permissions: roles[user.role] || [] };
}

function requireAuth(req, res, db, permission) {
  const auth = getAuth(req, db);
  if (!auth) {
    json(res, 401, { error: "Authentication required" });
    return null;
  }
  if (permission && !auth.permissions.includes(permission)) {
    json(res, 403, { error: "Insufficient permissions" });
    return null;
  }
  return auth;
}

function publicUser(user) {
  return {
    id: user.id,
    businessId: user.businessId,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!url.pathname.startsWith("/api")) return serveStatic(req, res, url);

  parseBody(req)
    .then((body) => handleApi(req, res, url, body))
    .catch((error) => json(res, 400, { error: error.message }));
}

async function handleApi(req, res, url, body) {
  const db = readDb();
  const method = req.method;
  const pathname = url.pathname;

  if (method === "POST" && pathname === "/api/auth/login") {
    const email = sanitize(body.email).toLowerCase();
    const password = String(body.password || "");
    const user = db.users.find((entry) => entry.email.toLowerCase() === email);
    if (!user || !verifyPassword(password, user.passwordHash)) return json(res, 401, { error: "Invalid email or password" });
    const token = crypto.randomBytes(32).toString("hex");
    db.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString() });
    db.auditLogs.push(log(user.businessId, user.id, "Signed in"));
    saveDb(db);
    return json(res, 200, { token, user: publicUser(user), business: db.businesses.find((entry) => entry.id === user.businessId) });
  }

  if (method === "POST" && pathname === "/api/auth/register") {
    const businessName = sanitize(body.businessName);
    const name = sanitize(body.name);
    const email = sanitize(body.email).toLowerCase();
    const password = String(body.password || "");
    if (!businessName || !name || !email || password.length < 8) return json(res, 422, { error: "Business, name, email, and an 8+ character password are required" });
    if (db.users.some((entry) => entry.email.toLowerCase() === email)) return json(res, 409, { error: "Email already exists" });
    const businessId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.businesses.push({
      id: businessId,
      name: businessName,
      createdAt: now,
      settings: {
        lowStockThreshold: 8,
        darkMode: false,
        notifyCeoOnManagerStock: true,
        emailNotifications: true,
        smsNotifications: false,
        accountingProvider: "CSV",
        accountingEmail: "",
        smsPhone: "",
        currency: "USD",
      },
    });
    db.users.push({ id: userId, businessId, name, email, role: "CEO", passwordHash: hashPassword(password), createdAt: now });
    const defaults = ["Android phones", "Cell phones", "Android accessories", "Cell phone accessories", "Chargers", "Headsets and earphones", "AirPods", "Screen protectors", "Phone batteries", "Other accessories"];
    defaults.forEach((categoryName) => db.categories.push({ id: crypto.randomUUID(), businessId, name: categoryName, group: categoryName.includes("phones") ? "Phones" : "Accessories" }));
    db.auditLogs.push(log(businessId, userId, "Registered business account"));
    saveDb(db);
    return json(res, 201, { ok: true });
  }

  if (method === "POST" && pathname === "/api/auth/forgot-password") {
    db.passwordResetTokens ||= [];
    const email = sanitize(body.email).toLowerCase();
    const user = db.users.find((entry) => entry.email.toLowerCase() === email);
    if (!user) {
      return json(res, 200, { message: "If the email exists, reset instructions have been created." });
    }
    const token = crypto.randomBytes(20).toString("hex");
    db.passwordResetTokens = db.passwordResetTokens.filter((entry) => entry.userId !== user.id);
    db.passwordResetTokens.push({
      token,
      userId: user.id,
      businessId: user.businessId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
      usedAt: null,
    });
    db.auditLogs.push(log(user.businessId, user.id, "Requested password reset"));
    saveDb(db);
    return json(res, 200, {
      message: "Reset code created. In production this code should be emailed to the user.",
      resetToken: token,
    });
  }

  if (method === "POST" && pathname === "/api/auth/reset-password") {
    db.passwordResetTokens ||= [];
    const token = sanitize(body.token);
    const password = String(body.password || "");
    if (!token || password.length < 8) return json(res, 422, { error: "Reset code and an 8+ character password are required" });
    const reset = db.passwordResetTokens.find((entry) => entry.token === token && !entry.usedAt && Date.parse(entry.expiresAt) > Date.now());
    if (!reset) return json(res, 400, { error: "Reset code is invalid or expired" });
    const user = db.users.find((entry) => entry.id === reset.userId);
    if (!user) return json(res, 400, { error: "Reset code is invalid or expired" });
    user.passwordHash = hashPassword(password);
    reset.usedAt = new Date().toISOString();
    db.sessions = db.sessions.filter((session) => session.userId !== user.id);
    db.auditLogs.push(log(user.businessId, user.id, "Reset password"));
    saveDb(db);
    return json(res, 200, { ok: true });
  }

  if (method === "GET" && pathname === "/api/me") {
    const auth = requireAuth(req, res, db);
    if (!auth) return;
    return json(res, 200, { user: publicUser(auth.user), business: auth.business, permissions: auth.permissions });
  }

  if (method === "GET" && pathname === "/api/inventory") {
    const auth = requireAuth(req, res, db, "inventory:read");
    if (!auth) return;
    const query = sanitize(url.searchParams.get("q")).toLowerCase();
    const category = sanitize(url.searchParams.get("category"));
    const items = db.inventory
      .filter((entry) => entry.businessId === auth.user.businessId)
      .filter((entry) => !query || `${entry.name} ${entry.sku} ${entry.type}`.toLowerCase().includes(query))
      .filter((entry) => !category || entry.categoryId === category)
      .sort((a, b) => a.name.localeCompare(b.name));
    return json(res, 200, { items, categories: db.categories.filter((entry) => entry.businessId === auth.user.businessId) });
  }

  if (method === "POST" && pathname === "/api/inventory") {
    const auth = requireAuth(req, res, db, "inventory:write");
    if (!auth) return;
    const newItem = {
      id: crypto.randomUUID(),
      businessId: auth.user.businessId,
      categoryId: sanitize(body.categoryId),
      name: sanitize(body.name),
      sku: sanitize(body.sku || body.name).toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 24),
      type: sanitize(body.type || "Accessory"),
      quantity: Number(body.quantity || 0),
      soldQuantity: Number(body.soldQuantity || 0),
      costPrice: Number(body.costPrice || 0),
      sellingPrice: Number(body.sellingPrice || 0),
      location: sanitize(body.location || "Main store"),
      barcode: sanitize(body.barcode || crypto.randomInt(100000000000, 999999999999).toString()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!newItem.name || !newItem.categoryId || Number.isNaN(newItem.quantity)) return json(res, 422, { error: "Name, category, and quantity are required" });
    db.inventory.push(newItem);
    db.stockHistory ||= [];
    db.stockHistory.push(stockChange(auth.user.businessId, auth.user.id, newItem.categoryId, newItem.id, "created", 0, newItem.quantity, newItem.soldQuantity));
    db.auditLogs.push(log(auth.user.businessId, auth.user.id, `Added stock item: ${newItem.name}`));
    await notifyCeoIfManager(db, auth, `Manager added stock: ${newItem.name}`);
    saveDb(db);
    return json(res, 201, { item: newItem });
  }

  const itemMatch = pathname.match(/^\/api\/inventory\/([a-f0-9-]+)$/);
  if (itemMatch && method === "PUT") {
    const auth = requireAuth(req, res, db, "inventory:write");
    if (!auth) return;
    const entry = db.inventory.find((candidate) => candidate.id === itemMatch[1] && candidate.businessId === auth.user.businessId);
    if (!entry) return json(res, 404, { error: "Inventory item not found" });
    const oldQuantity = Number(entry.quantity || 0);
    const oldSoldQuantity = Number(entry.soldQuantity || 0);
    const oldCategoryId = entry.categoryId;
    Object.assign(entry, {
      categoryId: sanitize(body.categoryId || entry.categoryId),
      name: sanitize(body.name || entry.name),
      sku: sanitize(body.sku || entry.sku).toUpperCase(),
      type: sanitize(body.type || entry.type),
      quantity: Number(body.quantity ?? entry.quantity),
      soldQuantity: Number(body.soldQuantity ?? entry.soldQuantity ?? 0),
      costPrice: Number(body.costPrice ?? entry.costPrice),
      sellingPrice: Number(body.sellingPrice ?? entry.sellingPrice),
      location: sanitize(body.location || entry.location),
      barcode: sanitize(body.barcode || entry.barcode),
      updatedAt: new Date().toISOString(),
    });
    db.stockHistory ||= [];
    db.stockHistory.push(stockChange(auth.user.businessId, auth.user.id, oldCategoryId, entry.id, "before_edit", oldQuantity, oldQuantity, oldSoldQuantity));
    db.stockHistory.push(stockChange(auth.user.businessId, auth.user.id, entry.categoryId, entry.id, "after_edit", oldQuantity, entry.quantity, entry.soldQuantity));
    db.auditLogs.push(log(auth.user.businessId, auth.user.id, `Updated stock item: ${entry.name}`));
    await notifyCeoIfManager(db, auth, `Manager updated stock: ${entry.name}`);
    saveDb(db);
    return json(res, 200, { item: entry });
  }

  if (itemMatch && method === "DELETE") {
    const auth = requireAuth(req, res, db, "inventory:write");
    if (!auth) return;
    const index = db.inventory.findIndex((candidate) => candidate.id === itemMatch[1] && candidate.businessId === auth.user.businessId);
    if (index === -1) return json(res, 404, { error: "Inventory item not found" });
    const [removed] = db.inventory.splice(index, 1);
    db.auditLogs.push(log(auth.user.businessId, auth.user.id, `Deleted stock item: ${removed.name}`));
    saveDb(db);
    return json(res, 200, { ok: true });
  }

  if (method === "GET" && pathname === "/api/analytics") {
    const auth = requireAuth(req, res, db, "analytics:read");
    if (!auth) return;
    const items = db.inventory.filter((entry) => entry.businessId === auth.user.businessId);
    const categories = db.categories.filter((entry) => entry.businessId === auth.user.businessId);
    const threshold = Number(auth.business.settings.lowStockThreshold || 8);
    const categoryTotals = categories.map((category) => {
      const categoryItems = items.filter((entry) => entry.categoryId === category.id);
      return {
        id: category.id,
        name: category.name,
        quantity: categoryItems.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
        soldQuantity: categoryItems.reduce((sum, entry) => sum + Number(entry.soldQuantity || 0), 0),
        unitPriceTotal: categoryItems.reduce((sum, entry) => sum + Number(entry.sellingPrice || 0), 0),
        stockValue: categoryItems.reduce((sum, entry) => sum + Number(entry.quantity || 0) * Number(entry.costPrice || 0), 0),
        retailValue: categoryItems.reduce((sum, entry) => sum + Number(entry.quantity || 0) * Number(entry.sellingPrice || 0), 0),
      };
    });
    const history = (db.stockHistory || [])
      .filter((entry) => entry.businessId === auth.user.businessId)
      .slice(-40)
      .reverse()
      .map((entry) => ({ ...entry, categoryName: categories.find((category) => category.id === entry.categoryId)?.name || "Unknown category" }));
    return json(res, 200, {
      totalItems: items.length,
      totalStock: items.reduce((sum, entry) => sum + entry.quantity, 0),
      stockValue: items.reduce((sum, entry) => sum + entry.quantity * entry.costPrice, 0),
      lowStock: items.filter((entry) => entry.quantity <= threshold),
      categoryTotals,
      history,
      logs: db.auditLogs.filter((entry) => entry.businessId === auth.user.businessId).slice(-20).reverse(),
    });
  }

  if (method === "GET" && pathname === "/api/notifications") {
    const auth = requireAuth(req, res, db, "notifications:read");
    if (!auth) return;
    const notifications = db.notifications.filter((entry) => entry.businessId === auth.user.businessId && entry.userId === auth.user.id).slice(-50).reverse();
    return json(res, 200, { notifications });
  }

  if (method === "PUT" && pathname === "/api/settings") {
    const auth = requireAuth(req, res, db, "settings:write");
    if (!auth) return;
    auth.business.settings = {
      ...auth.business.settings,
      lowStockThreshold: Number(body.lowStockThreshold ?? auth.business.settings.lowStockThreshold),
      darkMode: Boolean(body.darkMode),
      notifyCeoOnManagerStock: Boolean(body.notifyCeoOnManagerStock),
      emailNotifications: Boolean(body.emailNotifications),
      smsNotifications: Boolean(body.smsNotifications),
      accountingProvider: sanitize(body.accountingProvider || auth.business.settings.accountingProvider || "CSV"),
      accountingEmail: sanitize(body.accountingEmail || ""),
      smsPhone: sanitize(body.smsPhone || ""),
      currency: sanitize(body.currency || auth.business.settings.currency),
    };
    db.auditLogs.push(log(auth.user.businessId, auth.user.id, "Updated system settings"));
    saveDb(db);
    return json(res, 200, { business: auth.business });
  }

  if (method === "GET" && pathname === "/api/users") {
    const auth = requireAuth(req, res, db, "users:read");
    if (!auth) return;
    return json(res, 200, { users: db.users.filter((entry) => entry.businessId === auth.user.businessId).map(publicUser) });
  }

  if (method === "GET" && pathname === "/api/accounting/summary") {
    const auth = requireAuth(req, res, db, "analytics:read");
    if (!auth) return;
    const items = db.inventory.filter((entry) => entry.businessId === auth.user.businessId);
    const categories = db.categories.filter((entry) => entry.businessId === auth.user.businessId);
    const inventoryValue = items.reduce((sum, entry) => sum + entry.quantity * entry.costPrice, 0);
    const retailValue = items.reduce((sum, entry) => sum + entry.quantity * entry.sellingPrice, 0);
    const potentialProfit = retailValue - inventoryValue;
    const categoryRows = categories.map((category) => {
      const categoryItems = items.filter((entry) => entry.categoryId === category.id);
      return {
        category: category.name,
        quantity: categoryItems.reduce((sum, entry) => sum + entry.quantity, 0),
        soldQuantity: categoryItems.reduce((sum, entry) => sum + Number(entry.soldQuantity || 0), 0),
        unitPriceTotal: categoryItems.reduce((sum, entry) => sum + Number(entry.sellingPrice || 0), 0),
        costValue: categoryItems.reduce((sum, entry) => sum + entry.quantity * entry.costPrice, 0),
        retailValue: categoryItems.reduce((sum, entry) => sum + entry.quantity * entry.sellingPrice, 0),
      };
    });
    return json(res, 200, {
      provider: auth.business.settings.accountingProvider || "CSV",
      inventoryValue,
      retailValue,
      potentialProfit,
      categoryRows,
      generatedAt: new Date().toISOString(),
    });
  }

  if (method === "POST" && pathname === "/api/users") {
    const auth = requireAuth(req, res, db, "users:read");
    if (!auth) return;
    const name = sanitize(body.name);
    const email = sanitize(body.email).toLowerCase();
    const role = sanitize(body.role);
    const password = String(body.password || "");
    if (!name || !email || !["CEO", "Admin", "Manager", "Staff"].includes(role) || password.length < 8) {
      return json(res, 422, { error: "Name, email, role, and an 8+ character password are required" });
    }
    if (db.users.some((entry) => entry.email.toLowerCase() === email)) {
      return json(res, 409, { error: "Email already exists" });
    }
    const user = {
      id: crypto.randomUUID(),
      businessId: auth.user.businessId,
      name,
      email,
      role,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    db.auditLogs.push(log(auth.user.businessId, auth.user.id, `Created ${role} user: ${name}`));
    saveDb(db);
    return json(res, 201, { user: publicUser(user) });
  }

  json(res, 404, { error: "Route not found" });
}

async function notifyCeoIfManager(db, auth, message) {
  if (auth.user.role !== "Manager" || !auth.business.settings.notifyCeoOnManagerStock) return;
  db.notificationDeliveries ||= [];
  db.users
    .filter((user) => user.businessId === auth.user.businessId && user.role === "CEO")
    .forEach((ceo) => {
      const notification = {
        id: crypto.randomUUID(),
        businessId: auth.user.businessId,
        userId: ceo.id,
        message,
        read: false,
        createdAt: new Date().toISOString(),
      };
      db.notifications.push(notification);
      queueNotificationDelivery(db, auth.business, notification, "in-app", ceo.email, "delivered");
      if (auth.business.settings.emailNotifications) queueNotificationDelivery(db, auth.business, notification, "email", auth.business.settings.accountingEmail || ceo.email, getEmailStatus());
      if (auth.business.settings.smsNotifications) queueNotificationDelivery(db, auth.business, notification, "sms", auth.business.settings.smsPhone || "not configured", getSmsStatus());
    });
  const deliveries = db.notificationDeliveries.filter((entry) => entry.status === "queued");
  for (const delivery of deliveries) {
    delivery.status = await sendDelivery(delivery, message);
  }
}

function queueNotificationDelivery(db, business, notification, channel, destination, status) {
  db.notificationDeliveries.push({
    id: crypto.randomUUID(),
    businessId: business.id,
    notificationId: notification.id,
    channel,
    destination,
    status,
    createdAt: new Date().toISOString(),
  });
}

function getEmailStatus() {
  return emailProvider === "resend" && resendApiKey ? "queued" : "provider_not_configured";
}

function getSmsStatus() {
  return twilioAccountSid && twilioAuthToken && twilioFrom ? "queued" : "provider_not_configured";
}

async function sendDelivery(delivery, message) {
  try {
    if (delivery.channel === "email") {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to: delivery.destination,
          subject: "Inventory stock update",
          text: message,
        }),
      });
      return response.ok ? "sent" : "failed";
    }
    if (delivery.channel === "sms") {
      const params = new URLSearchParams({ From: twilioFrom, To: delivery.destination, Body: message });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });
      return response.ok ? "sent" : "failed";
    }
    return delivery.status;
  } catch {
    return "failed";
  }
}

function serveStatic(req, res, url) {
  const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, contents) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    });
    res.end(contents);
  });
}

ensureDb();
http.createServer(route).listen(PORT, () => {
  console.log(`Mobile inventory app running at http://localhost:${PORT}`);
});
