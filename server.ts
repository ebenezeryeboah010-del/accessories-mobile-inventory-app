import express, { Request, Response, NextFunction } from "express";
import path from "path";
import http from "http";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import { createServer as createViteServer } from "vite";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || "mobilehub-super-secret-key-2026";

// Instantiate database clients or fallbacks
let prisma: PrismaClient | null = null;
const isDbConfigured = !!process.env.DATABASE_URL;

if (isDbConfigured) {
  try {
    prisma = new PrismaClient();
    console.log("Prisma Client initialized successfully with DATABASE_URL.");
  } catch (err) {
    console.error("Failed to initialize Prisma Client:", err);
  }
} else {
  console.log("DATABASE_URL is not set. Full-stack app running on resilient Memory DB fallback.");
}

// Memory database mock structure to keep dev previews 100% interactive and working
const mockDb = {
  businesses: [] as any[],
  users: [] as any[],
  categories: [] as any[],
  inventory: [] as any[],
  stockHistory: [] as any[],
  notifications: [] as any[],
  notificationDeliveries: [] as any[],
  passwordResets: [] as any[],
  auditLogs: [] as any[],
  settings: [] as any[],
};

// Seed initial memory DB dummy data
const SEED_BUSINESS_ID = "b1111111-2222-3333-4444-555555555555";
const SEED_CEO_ID = "u1111111-2222-3333-4444-555555555555";
const SEED_MANAGER_ID = "u2222222-3333-3333-4444-555555555555";

function seedMockData() {
  if (mockDb.businesses.length > 0) return;

  mockDb.businesses.push({
    id: SEED_BUSINESS_ID,
    name: "Yeboah Accessories",
    createdAt: new Date(),
  });

  const salt = bcrypt.genSaltSync(10);
  mockDb.users.push({
    id: SEED_CEO_ID,
    businessId: SEED_BUSINESS_ID,
    name: "Amina CEO",
    email: "ceo@mobilehub.test",
    role: "CEO",
    passwordHash: bcrypt.hashSync("password123", salt),
    createdAt: new Date(),
  }, {
    id: SEED_MANAGER_ID,
    businessId: SEED_BUSINESS_ID,
    name: "Musa Manager",
    email: "manager@mobilehub.test",
    role: "Manager",
    passwordHash: bcrypt.hashSync("password123", salt),
    createdAt: new Date(),
  });

  const defaultCats = [
    { id: "c1", name: "Android phones", group: "Phones" },
    { id: "c2", name: "Cell phones", group: "Phones" },
    { id: "c3", name: "Android accessories", group: "Accessories" },
    { id: "c4", name: "Cell phone accessories", group: "Accessories" },
    { id: "c5", name: "Chargers", group: "Power" },
    { id: "c6", name: "Headsets and earphones", group: "Audio" },
    { id: "c7", name: "AirPods", group: "Audio" },
    { id: "c8", name: "Screen protectors", group: "Protection" },
    { id: "c9", name: "Phone batteries", group: "Power" },
    { id: "c10", name: "Other accessories", group: "Accessories" },
  ];

  defaultCats.forEach((c) => {
    mockDb.categories.push({
      id: c.id,
      businessId: SEED_BUSINESS_ID,
      name: c.name,
      group: c.group,
    });
  });

  mockDb.inventory.push({
    id: "i1",
    businessId: SEED_BUSINESS_ID,
    categoryId: "c1",
    name: "Samsung Galaxy A35",
    sku: "SAMSUNG-GALAXY-A35",
    type: "Phones",
    quantity: 18,
    soldQuantity: 4,
    costPrice: 210,
    sellingPrice: 315,
    location: "Shelf A1",
    barcode: "847294719482",
    createdAt: new Date(),
    updatedAt: new Date(),
  }, {
    id: "i2",
    businessId: SEED_BUSINESS_ID,
    categoryId: "c2",
    name: "Nokia 105",
    sku: "NOKIA-105",
    type: "Phones",
    quantity: 32,
    soldQuantity: 12,
    costPrice: 18,
    sellingPrice: 29,
    location: "Shelf A2",
    barcode: "283749174918",
    createdAt: new Date(),
    updatedAt: new Date(),
  }, {
    id: "i3",
    businessId: SEED_BUSINESS_ID,
    categoryId: "c5",
    name: "45W USB-C Fast Charger",
    sku: "FAST-CHARGER-45W",
    type: "Android accessories",
    quantity: 6,
    soldQuantity: 28,
    costPrice: 7,
    sellingPrice: 15,
    location: "Bin C4",
    barcode: "274819481974",
    createdAt: new Date(),
    updatedAt: new Date(),
  }, {
    id: "i4",
    businessId: SEED_BUSINESS_ID,
    categoryId: "c6",
    name: "Braided Type-C Earphones",
    sku: "BRAIDED-C-EARPHONE",
    type: "Cell phone accessories",
    quantity: 24,
    soldQuantity: 5,
    costPrice: 4,
    sellingPrice: 10,
    location: "Bin D2",
    barcode: "729481048104",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  mockDb.settings.push({
    id: "s1",
    businessId: SEED_BUSINESS_ID,
    lowStockThreshold: 8,
    darkMode: false,
    notifyCeoOnManagerStock: true,
    emailNotifications: true,
    smsNotifications: false,
    accountingProvider: "CSV",
    accountingEmail: "ceo@mobilehub.test",
    smsPhone: "+233543210987",
    currency: "USD",
  });

  mockDb.auditLogs.push({
    id: "a1",
    businessId: SEED_BUSINESS_ID,
    userId: SEED_CEO_ID,
    action: "System started on fast memory fallback DB",
    createdAt: new Date(),
  });
}

seedMockData();

// Express configuration
const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Auth middleware helper
const auth = async (req: any, res: Response, next: NextFunction) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.userId = payload.sub;
    req.businessId = payload.businessId;
    req.role = payload.role;

    // Fetch details
    if (prisma) {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        include: { business: { include: { settings: true } } },
      });
      if (!user) return res.status(401).json({ error: "User not found" });
      req.user = user;
      req.business = {
         ...user.business,
         settings: user.business.settings || {
           lowStockThreshold: 8,
           darkMode: false,
           notifyCeoOnManagerStock: true,
           emailNotifications: true,
           smsNotifications: false,
           accountingProvider: "CSV",
           accountingEmail: "",
           smsPhone: "",
           currency: "USD",
         }
      };
    } else {
      const user = mockDb.users.find((u) => u.id === payload.sub);
      const business = mockDb.businesses.find((b) => b.id === payload.businessId);
      const settings = mockDb.settings.find((s) => s.businessId === payload.businessId);

      if (!user || !business) return res.status(401).json({ error: "Authentication expired" });

      req.user = user;
      req.business = {
        ...business,
        settings: settings || {
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
      };
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Check email existence for Real-Time email check
app.post("/api/auth/check-email", async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email check requires target address" });

  const cleanEmail = email.toLowerCase().trim();

  if (prisma) {
    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    return res.json({ available: !user });
  } else {
    const user = mockDb.users.find((u) => u.email.toLowerCase() === cleanEmail);
    return res.json({ available: !user });
  }
});

// LOGIN
app.post("/api/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const cleanEmail = email.toLowerCase().trim();

  if (prisma) {
    try {
      const user = await prisma.user.findUnique({ where: { email: cleanEmail }, include: { business: { include: { settings: true } } } });
      if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const token = jwt.sign({ sub: user.id, businessId: user.businessId, role: user.role }, JWT_SECRET, { expiresIn: "12h" });
      await prisma.auditLog.create({ data: { businessId: user.businessId, userId: user.id, action: "User signed in successfully" } });

      return res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId },
        business: user.business,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const user = mockDb.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const business = mockDb.businesses.find((b) => b.id === user.businessId);
    const settings = mockDb.settings.find((s) => s.businessId === user.businessId);

    const token = jwt.sign({ sub: user.id, businessId: user.businessId, role: user.role }, JWT_SECRET, { expiresIn: "12h" });

    mockDb.auditLogs.push({
      id: "a" + Date.now(),
      businessId: user.businessId,
      userId: user.id,
      action: "User logged in with mock database session",
      createdAt: new Date(),
    });

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, businessId: user.businessId },
      business: { ...business, settings },
    });
  }
});

// REGISTER
app.post("/api/auth/register", async (req: Request, res: Response) => {
  const { businessName, name, email, password } = req.body;
  if (!businessName || !name || !email || !password) {
    return res.status(400).json({ error: "All register fields must be fully populated" });
  }

  const cleanEmail = email.toLowerCase().trim();
  const passwordHash = bcrypt.hashSync(password, 10);

  if (prisma) {
    try {
      const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (existing) return res.status(409).json({ error: "Email addresses already exists in records" });

      const business = await prisma.business.create({
        data: {
          name: businessName,
          settings: { create: { currency: "USD" } },
        },
      });

      const user = await prisma.user.create({
        data: {
          businessId: business.id,
          name,
          email: cleanEmail,
          role: Role.CEO,
          passwordHash,
        },
      });

      const defaultCats = [
        "Android phones", "Cell phones", "Android accessories", "Cell phone accessories",
        "Chargers", "Headsets and earphones", "AirPods", "Screen protectors", "Phone batteries"
      ];

      await Promise.all(defaultCats.map(cat => prisma!.category.create({
        data: { businessId: business.id, name: cat, group: cat.includes("phone") ? "Phones" : "Accessories" }
      })));

      await prisma.auditLog.create({
        data: { businessId: business.id, userId: user.id, action: "Registered Business Account with default setup cataloug" }
      });

      return res.status(201).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const existing = mockDb.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) return res.status(409).json({ error: "Email represents already registered users" });

    const businessId = "b" + Date.now();
    const userId = "u" + Date.now();

    mockDb.businesses.push({ id: businessId, name: businessName, createdAt: new Date() });
    mockDb.users.push({ id: userId, businessId, name, email: cleanEmail, role: "CEO", passwordHash, createdAt: new Date() });

    const defaultCats = [
      "Android phones", "Cell phones", "Android accessories", "Cell phone accessories",
      "Chargers", "Headsets and earphones", "AirPods", "Screen protectors", "Phone batteries"
    ];

    defaultCats.forEach((cat, index) => {
      mockDb.categories.push({
        id: "c_" + index + "_" + Date.now(),
        businessId,
        name: cat,
        group: cat.includes("phone") ? "Phones" : "Accessories"
      });
    });

    mockDb.settings.push({
      id: "s" + Date.now(),
      businessId,
      lowStockThreshold: 8,
      darkMode: false,
      notifyCeoOnManagerStock: true,
      emailNotifications: true,
      smsNotifications: false,
      accountingProvider: "CSV",
      accountingEmail: "",
      smsPhone: "",
      currency: "USD",
    });

    mockDb.auditLogs.push({
      id: "a" + Date.now(),
      businessId,
      userId,
      action: "Registered user credentials on fallback Mock database",
      createdAt: new Date(),
    });

    return res.status(201).json({ ok: true });
  }
});

// FORGOT PASSWORD
app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required to request reset tokens" });

  const cleanEmail = email.toLowerCase().trim();
  const resetToken = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit code for easy preview testing
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 mins

  if (prisma) {
    try {
      const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (!user) {
        return res.json({ message: "If the email is valid, a secure resetting code has been queued." });
      }

      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      await prisma.passwordResetToken.create({
        data: {
          businessId: user.businessId,
          userId: user.id,
          tokenHash: bcrypt.hashSync(resetToken, 10),
          expiresAt,
        }
      });

      return res.json({
        message: "Reset code has been compiled.",
        resetToken: resetToken // Injected for easy preview accessibility as described in instructions
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const user = mockDb.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      return res.json({ message: "If the email is valid, a secure resetting code has been queued." });
    }

    mockDb.passwordResets = mockDb.passwordResets.filter((p) => p.userId !== user.id);
    mockDb.passwordResets.push({
      id: "pr" + Date.now(),
      businessId: user.businessId,
      userId: user.id,
      resetCode: resetToken,
      expiresAt,
      usedAt: null,
    });

    return res.json({
      message: "Reset code compiled on fallback database.",
      resetToken: resetToken
    });
  }
});

// RESET PASSWORD
app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
  const { token, password } = req.body;
  if (!token || !password || password.length < 8) {
    return res.status(400).json({ error: "Reset token and a minimum 8 character password is required" });
  }

  if (prisma) {
    try {
      const activeResets = await prisma.passwordResetToken.findMany({
        where: { usedAt: null, expiresAt: { gt: new Date() } },
        include: { user: true }
      });

      const match = activeResets.find(entry => bcrypt.compareSync(token, entry.tokenHash));
      if (!match) return res.status(400).json({ error: "Invalid or expired reset token" });

      const newPasswordHash = bcrypt.hashSync(password, 10);
      await prisma.$transaction([
        prisma.user.update({ where: { id: match.userId }, data: { passwordHash: newPasswordHash } }),
        prisma.passwordResetToken.update({ where: { id: match.id }, data: { usedAt: new Date() } }),
        prisma.auditLog.create({ data: { businessId: match.businessId, userId: match.userId, action: "User reset password and invalidated reset session" } })
      ]);

      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const match = mockDb.passwordResets.find((p) => p.resetCode === token && !p.usedAt && p.expiresAt > new Date());
    if (!match) return res.status(400).json({ error: "Invalid or expired reset token" });

    const user = mockDb.users.find((u) => u.id === match.userId);
    if (!user) return res.status(400).json({ error: "User record not found" });

    user.passwordHash = bcrypt.hashSync(password, 10);
    match.usedAt = new Date();

    mockDb.auditLogs.push({
      id: "a" + Date.now(),
      businessId: user.businessId,
      userId: user.id,
      action: "Reset password successfully using mock database token flow",
      createdAt: new Date(),
    });

    return res.json({ ok: true });
  }
});

// ME
app.get("/api/me", auth, (req: any, res: Response) => {
  res.json({
    user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, businessId: req.user.businessId },
    business: req.business,
    permissions: req.permissions,
  });
});

// USERS MANAGEMENT (LIST / CREATE)
app.get("/api/users", auth, (req: any, res: Response) => {
  if (!["CEO", "Admin"].includes(req.role)) {
    return res.status(403).json({ error: "Insufficient permission levels to audit staffing users" });
  }

  if (prisma) {
    prisma.user.findMany({ where: { businessId: req.businessId }, orderBy: { createdAt: "asc" } })
      .then((users) => res.json({ users: users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })) }))
      .catch((err) => res.status(500).json({ error: err.message }));
  } else {
    const users = mockDb.users.filter((u) => u.businessId === req.businessId);
    res.json({ users: users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })) });
  }
});

app.post("/api/users", auth, async (req: any, res: Response) => {
  if (!["CEO", "Admin"].includes(req.role)) {
    return res.status(403).json({ error: "Only Business Executives or Admin can construct user credentials" });
  }

  const { name, email, role, password } = req.body;
  if (!name || !email || !role || !password) return res.status(400).json({ error: "All account parameters must be declared" });

  const cleanEmail = email.toLowerCase().trim();
  const passwordHash = bcrypt.hashSync(password, 10);

  if (prisma) {
    try {
      const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
      if (existing) return res.status(409).json({ error: "Staffing email already assigned" });

      const newUser = await prisma.user.create({
        data: {
          businessId: req.businessId,
          name,
          email: cleanEmail,
          role: role as any,
          passwordHash,
        }
      });

      await prisma.auditLog.create({
        data: { businessId: req.businessId, userId: req.userId, action: `Created secondary access credentials support for ${newUser.name} with role ${role}` }
      });

      return res.status(201).json({ user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const existing = mockDb.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) return res.status(409).json({ error: "Staffing account email is already registered" });

    const newUserId = "u" + Date.now();
    const newUser = {
      id: newUserId,
      businessId: req.businessId,
      name,
      email: cleanEmail,
      role,
      passwordHash,
      createdAt: new Date(),
    };

    mockDb.users.push(newUser);
    mockDb.auditLogs.push({
      id: "a" + Date.now(),
      businessId: req.businessId,
      userId: req.userId,
      action: `Created user ${name} (${role}) on fallback database`,
      createdAt: new Date(),
    });

    return res.status(201).json({ user: { id: newUserId, name, email: cleanEmail, role } });
  }
});

// SETTINGS (PUT)
app.put("/api/settings", auth, async (req: any, res: Response) => {
  if (!["CEO", "Admin", "Manager"].includes(req.role)) {
    return res.status(403).json({ error: "Insufficient settings access privileges" });
  }

  const { lowStockThreshold, darkMode, currency, accountingProvider, accountingEmail, smsPhone, notifyCeoOnManagerStock, emailNotifications, smsNotifications } = req.body;

  if (prisma) {
    try {
      const settings = await prisma.setting.upsert({
        where: { businessId: req.businessId },
        update: {
          lowStockThreshold: Number(lowStockThreshold ?? 8),
          darkMode: Boolean(darkMode),
          currency: String(currency || "USD"),
          accountingProvider: String(accountingProvider || "CSV"),
          accountingEmail: String(accountingEmail || ""),
          smsPhone: String(smsPhone || ""),
          notifyCeoOnManagerStock: Boolean(notifyCeoOnManagerStock),
          emailNotifications: Boolean(emailNotifications),
          smsNotifications: Boolean(smsNotifications),
        },
        create: {
          businessId: req.businessId,
          lowStockThreshold: Number(lowStockThreshold ?? 8),
          darkMode: Boolean(darkMode),
          currency: String(currency || "USD"),
          accountingProvider: String(accountingProvider || "CSV"),
          accountingEmail: String(accountingEmail || ""),
          smsPhone: String(smsPhone || ""),
          notifyCeoOnManagerStock: Boolean(notifyCeoOnManagerStock),
          emailNotifications: Boolean(emailNotifications),
          smsNotifications: Boolean(smsNotifications),
        }
      });

      return res.json({ business: { ...req.business, settings } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    let settings = mockDb.settings.find((s) => s.businessId === req.businessId);
    if (!settings) {
      settings = { id: "s" + Date.now(), businessId: req.businessId };
      mockDb.settings.push(settings);
    }

    Object.assign(settings, {
      lowStockThreshold: Number(lowStockThreshold ?? 8),
      darkMode: Boolean(darkMode),
      currency: String(currency || "USD"),
      accountingProvider: String(accountingProvider || "CSV"),
      accountingEmail: String(accountingEmail || ""),
      smsPhone: String(smsPhone || ""),
      notifyCeoOnManagerStock: Boolean(notifyCeoOnManagerStock),
      emailNotifications: Boolean(emailNotifications),
      smsNotifications: Boolean(smsNotifications),
    });

    return res.json({ business: { ...req.business, settings } });
  }
});

// INVENTORY GET/POST/PUT/DELETE
app.get("/api/inventory", auth, async (req: any, res: Response) => {
  const query = String(req.query.q || "").toLowerCase();
  const catFilter = String(req.query.category || "");

  if (prisma) {
    try {
      const items = await prisma.inventoryItem.findMany({
        where: {
          businessId: req.businessId,
          ...(catFilter ? { categoryId: catFilter } : {}),
          ...(query ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { sku: { contains: query, mode: "insensitive" } },
              { type: { contains: query, mode: "insensitive" } },
            ]
          } : {})
        },
        orderBy: { name: "asc" }
      });

      const categories = await prisma.category.findMany({ where: { businessId: req.businessId }, orderBy: { name: "asc" } });
      const decimalItems = items.map(item => ({ ...item, costPrice: Number(item.costPrice), sellingPrice: Number(item.sellingPrice) }));

      return res.json({ items: decimalItems, categories });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const categories = mockDb.categories.filter((c) => c.businessId === req.businessId);
    let items = mockDb.inventory
      .filter((i) => i.businessId === req.businessId)
      .filter((i) => !catFilter || i.categoryId === catFilter)
      .filter((i) => !query || `${i.name} ${i.sku} ${i.type}`.toLowerCase().includes(query));

    return res.json({ items, categories });
  }
});

app.post("/api/inventory", auth, async (req: any, res: Response) => {
  if (req.role === "Staff") return res.status(403).json({ error: "Auditing accounts cannot perform record updates" });

  const { categoryId, name, quantity, soldQuantity, costPrice, sellingPrice, location, barcode, type } = req.body;
  if (!categoryId || !name) return res.status(400).json({ error: "Category and product name elements are necessary" });

  const sku = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 24);

  if (prisma) {
    try {
      const item = await prisma.inventoryItem.create({
        data: {
          businessId: req.businessId,
          categoryId,
          name,
          sku,
          type: type || "Accessory",
          quantity: Number(quantity ?? 0),
          soldQuantity: Number(soldQuantity ?? 0),
          costPrice: Number(costPrice ?? 0),
          sellingPrice: Number(sellingPrice ?? 0),
          location: location || "Main store",
          barcode: barcode || Math.floor(100000000000 + Math.random() * 899999999999).toString(),
        }
      });

      await prisma.stockHistory.create({
        data: {
          businessId: req.businessId,
          userId: req.userId,
          categoryId: item.categoryId,
          itemId: item.id,
          action: "created",
          oldQuantity: 0,
          newQuantity: item.quantity,
          soldQuantity: item.soldQuantity,
        }
      });

      // Notify executive if modified by manager
      if (req.role === "Manager" && req.business.settings.notifyCeoOnManagerStock) {
        const ceos = await prisma.user.findMany({ where: { businessId: req.businessId, role: "CEO" } });
        for (const ceo of ceos) {
          await prisma.notification.create({
            data: { businessId: req.businessId, userId: ceo.id, message: `Manager ${req.user.name} added stock: ${item.name}` }
          });
        }
      }

      await prisma.auditLog.create({ data: { businessId: req.businessId, userId: req.userId, action: `Stock added: ${item.name}` } });

      return res.status(201).json({ item: { ...item, costPrice: Number(item.costPrice), sellingPrice: Number(item.sellingPrice) } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const newItemId = "i" + Date.now();
    const item = {
      id: newItemId,
      businessId: req.businessId,
      categoryId,
      name,
      sku,
      type: type || "Accessory",
      quantity: Number(quantity ?? 0),
      soldQuantity: Number(soldQuantity ?? 0),
      costPrice: Number(costPrice ?? 0),
      sellingPrice: Number(sellingPrice ?? 0),
      location: location || "Main store",
      barcode: barcode || Math.floor(100000000000 + Math.random() * 899999999999).toString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockDb.inventory.push(item);

    mockDb.stockHistory.push({
      id: "sh" + Date.now(),
      businessId: req.businessId,
      userId: req.userId,
      categoryId,
      itemId: newItemId,
      action: "created",
      oldQuantity: 0,
      newQuantity: item.quantity,
      soldQuantity: item.soldQuantity,
      createdAt: new Date(),
    });

    if (req.role === "Manager" && req.business.settings.notifyCeoOnManagerStock) {
      const ceos = mockDb.users.filter((u) => u.businessId === req.businessId && u.role === "CEO");
      ceos.forEach((ceo) => {
        mockDb.notifications.push({
          id: "n" + Date.now(),
          businessId: req.businessId,
          userId: ceo.id,
          message: `Manager ${req.user.name} added stock: ${item.name}`,
          read: false,
          createdAt: new Date(),
        });
      });
    }

    mockDb.auditLogs.push({
      id: "a" + Date.now(),
      businessId: req.businessId,
      userId: req.userId,
      action: `Stock added to fallback database: ${item.name}`,
      createdAt: new Date(),
    });

    return res.status(201).json({ item });
  }
});

app.put("/api/inventory/:id", auth, async (req: any, res: Response) => {
  if (req.role === "Staff") return res.status(403).json({ error: "Insufficient catalog write permissions" });

  const { id } = req.params;
  const { categoryId, name, quantity, soldQuantity, costPrice, sellingPrice, location, barcode, type } = req.body;

  if (prisma) {
    try {
      const current = await prisma.inventoryItem.findFirst({ where: { id, businessId: req.businessId } });
      if (!current) return res.status(404).json({ error: "Item metadata not found" });

      const item = await prisma.inventoryItem.update({
        where: { id },
        data: {
          categoryId,
          name,
          sku: name ? name.toUpperCase().replace(/[^A-Z0-9]+/g, "-") : current.sku,
          type: type || current.type,
          quantity: Number(quantity ?? current.quantity),
          soldQuantity: Number(soldQuantity ?? current.soldQuantity),
          costPrice: Number(costPrice ?? current.costPrice),
          sellingPrice: Number(sellingPrice ?? current.sellingPrice),
          location: location || current.location,
          barcode: barcode || current.barcode,
        }
      });

      // History log
      await prisma.stockHistory.create({
        data: {
          businessId: req.businessId,
          userId: req.userId,
          categoryId: item.categoryId,
          itemId: item.id,
          action: "updated",
          oldQuantity: current.quantity,
          newQuantity: item.quantity,
          soldQuantity: item.soldQuantity,
        }
      });

      if (req.role === "Manager" && req.business.settings.notifyCeoOnManagerStock) {
        const ceos = await prisma.user.findMany({ where: { businessId: req.businessId, role: "CEO" } });
        for (const ceo of ceos) {
          await prisma.notification.create({
            data: { businessId: req.businessId, userId: ceo.id, message: `Manager ${req.user.name} updated stock: ${item.name}` }
          });
        }
      }

      await prisma.auditLog.create({ data: { businessId: req.businessId, userId: req.userId, action: `Stock item updated: ${item.name}` } });

      return res.json({ item: { ...item, costPrice: Number(item.costPrice), sellingPrice: Number(item.sellingPrice) } });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const item = mockDb.inventory.find((i) => i.id === id && i.businessId === req.businessId);
    if (!item) return res.status(404).json({ error: "Product metadata represented by identifier not found" });

    const oldQty = item.quantity;
    Object.assign(item, {
      categoryId: categoryId || item.categoryId,
      name: name || item.name,
      sku: name ? name.toUpperCase().replace(/[^A-Z0-9]+/g, "-") : item.sku,
      type: type || item.type,
      quantity: Number(quantity ?? item.quantity),
      soldQuantity: Number(soldQuantity ?? item.soldQuantity),
      costPrice: Number(costPrice ?? item.costPrice),
      sellingPrice: Number(sellingPrice ?? item.sellingPrice),
      location: location || item.location,
      barcode: barcode || item.barcode,
      updatedAt: new Date(),
    });

    mockDb.stockHistory.push({
      id: "sh" + Date.now(),
      businessId: req.businessId,
      userId: req.userId,
      categoryId: item.categoryId,
      itemId: id,
      action: "updated",
      oldQuantity: oldQty,
      newQuantity: item.quantity,
      soldQuantity: item.soldQuantity,
      createdAt: new Date(),
    });

    if (req.role === "Manager" && req.business.settings.notifyCeoOnManagerStock) {
      const ceos = mockDb.users.filter((u) => u.businessId === req.businessId && u.role === "CEO");
      ceos.forEach((ceo) => {
        mockDb.notifications.push({
          id: "n" + Date.now(),
          businessId: req.businessId,
          userId: ceo.id,
          message: `Manager ${req.user.name} updated stock: ${item.name}`,
          read: false,
          createdAt: new Date(),
        });
      });
    }

    mockDb.auditLogs.push({
      id: "a" + Date.now(),
      businessId: req.businessId,
      userId: req.userId,
      action: `Stock updated on fallback database: ${item.name}`,
      createdAt: new Date(),
    });

    return res.json({ item });
  }
});

app.delete("/api/inventory/:id", auth, async (req: any, res: Response) => {
  if (req.role === "Staff") return res.status(403).json({ error: "Insufficient credentials for deleting records" });
  const { id } = req.params;

  if (prisma) {
    try {
      const current = await prisma.inventoryItem.findFirst({ where: { id, businessId: req.businessId } });
      if (!current) return res.status(404).json({ error: "Item not found" });

      await prisma.inventoryItem.delete({  where: { id } });
      await prisma.auditLog.create({ data: { businessId: req.businessId, userId: req.userId, action: `Stock item deleted: ${current.name}` } });

      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const index = mockDb.inventory.findIndex((i) => i.id === id && i.businessId === req.businessId);
    if (index === -1) return res.status(404).json({ error: "Inventory identifier target does not exist" });

    const [deleted] = mockDb.inventory.splice(index, 1);
    mockDb.auditLogs.push({
      id: "a" + Date.now(),
      businessId: req.businessId,
      userId: req.userId,
      action: `Deleted stock from memory fallback DB: ${deleted.name}`,
      createdAt: new Date(),
    });

    return res.json({ ok: true });
  }
});

// ANALYTICS & AUDIT LOGS
app.get("/api/analytics", auth, async (req: any, res: Response) => {
  if (prisma) {
    try {
      const threshold = req.business.settings.lowStockThreshold || 8;
      const [items, categories, logs, history] = await Promise.all([
        prisma.inventoryItem.findMany({ where: { businessId: req.businessId } }),
        prisma.category.findMany({ where: { businessId: req.businessId } }),
        prisma.auditLog.findMany({ where: { businessId: req.businessId }, orderBy: { createdAt: "desc" }, take: 15 }),
        prisma.stockHistory.findMany({ where: { businessId: req.businessId }, orderBy: { createdAt: "desc" }, take: 20 }),
      ]);

      const lowStock = items.filter(i => i.quantity <= threshold).map(i => ({ ...i, costPrice: Number(i.costPrice), sellingPrice: Number(i.sellingPrice) }));
      const stockValue = items.reduce((sum, i) => sum + (i.quantity * Number(i.costPrice)), 0);

      const categoryTotals = categories.map((cat) => {
        const catItems = items.filter(i => i.categoryId === cat.id);
        const qty = catItems.reduce((sum, i) => sum + i.quantity, 0);
        return { name: cat.name, quantity: qty };
      });

      const processedHistory = history.map((h) => {
        const cat = categories.find(c => c.id === h.categoryId);
        return { ...h, categoryName: cat ? cat.name : "Uncategorized" };
      });

      return res.json({
        totalItems: items.length,
        totalStock: items.reduce((sum, i) => sum + i.quantity, 0),
        stockValue,
        lowStock,
        categoryTotals,
        history: processedHistory,
        logs,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const threshold = req.business.settings.lowStockThreshold || 8;
    const items = mockDb.inventory.filter((i) => i.businessId === req.businessId);
    const categories = mockDb.categories.filter((c) => c.businessId === req.businessId);

    const stockValue = items.reduce((sum, i) => sum + (i.quantity * i.costPrice), 0);
    const lowStock = items.filter((i) => i.quantity <= threshold);

    const categoryTotals = categories.map((cat) => {
      const catItems = items.filter((i) => i.categoryId === cat.id);
      return { name: cat.name, quantity: catItems.reduce((sum, i) => sum + i.quantity, 0) };
    });

    const logs = mockDb.auditLogs.filter((l) => l.businessId === req.businessId).slice(-15).reverse();
    const history = mockDb.stockHistory.filter((h) => h.businessId === req.businessId).map((h) => {
      const cat = categories.find((c) => c.id === h.categoryId);
      return { ...h, categoryName: cat ? cat.name : "Uncategorized" };
    }).slice(-20).reverse();

    return res.json({
      totalItems: items.length,
      totalStock: items.reduce((sum, i) => sum + i.quantity, 0),
      stockValue,
      lowStock,
      categoryTotals,
      history,
      logs,
    });
  }
});

// NOTIFICATIONS
app.get("/api/notifications", auth, (req: any, res: Response) => {
  if (prisma) {
    prisma.notification.findMany({ where: { businessId: req.businessId, userId: req.userId }, orderBy: { createdAt: "desc" }, take: 30 })
      .then((notifications) => res.json({ notifications }))
      .catch((err) => res.status(500).json({ error: err.message }));
  } else {
    const notifications = mockDb.notifications.filter((n) => n.businessId === req.businessId && n.userId === req.userId).slice(-30).reverse();
    res.json({ notifications });
  }
});

// ACCOUNTING EXPORT WORKFLOW
app.get("/api/accounting/summary", auth, async (req: any, res: Response) => {
  if (prisma) {
    try {
      const [items, categories] = await Promise.all([
        prisma.inventoryItem.findMany({ where: { businessId: req.businessId } }),
        prisma.category.findMany({ where: { businessId: req.businessId } }),
      ]);

      const inventoryValue = items.reduce((sum, item) => sum + item.quantity * Number(item.costPrice), 0);
      const retailValue = items.reduce((sum, item) => sum + item.quantity * Number(item.sellingPrice), 0);
      const potentialProfit = retailValue - inventoryValue;

      const categoryRows = categories.map((category) => {
        const categoryItems = items.filter((item) => item.categoryId === category.id);
        return {
          category: category.name,
          quantity: categoryItems.reduce((sum, item) => sum + item.quantity, 0),
          soldQuantity: categoryItems.reduce((sum, item) => sum + item.soldQuantity, 0),
          unitPriceTotal: categoryItems.reduce((sum, item) => sum + Number(item.sellingPrice), 0),
          costValue: categoryItems.reduce((sum, item) => sum + item.quantity * Number(item.costPrice), 0),
          retailValue: categoryItems.reduce((sum, item) => sum + item.quantity * Number(item.sellingPrice), 0),
        };
      });

      return res.json({
        provider: req.business.settings.accountingProvider || "CSV",
        inventoryValue,
        retailValue,
        potentialProfit,
        categoryRows,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const items = mockDb.inventory.filter((i) => i.businessId === req.businessId);
    const categories = mockDb.categories.filter((c) => c.businessId === req.businessId);

    const inventoryValue = items.reduce((sum, i) => sum + (i.quantity * i.costPrice), 0);
    const retailValue = items.reduce((sum, i) => sum + (i.quantity * i.sellingPrice), 0);
    const potentialProfit = retailValue - inventoryValue;

    const categoryRows = categories.map((cat) => {
      const catItems = items.filter((i) => i.categoryId === cat.id);
      return {
        category: cat.name,
        quantity: catItems.reduce((sum, i) => sum + i.quantity, 0),
        soldQuantity: catItems.reduce((sum, i) => sum + i.soldQuantity, 0),
        unitPriceTotal: catItems.reduce((sum, i) => sum + i.sellingPrice, 0),
        costValue: catItems.reduce((sum, i) => sum + (i.quantity * i.costPrice), 0),
        retailValue: catItems.reduce((sum, i) => sum + (i.quantity * i.sellingPrice), 0),
      };
    });

    return res.json({
      provider: req.business.settings.accountingProvider || "CSV",
      inventoryValue,
      retailValue,
      potentialProfit,
      categoryRows,
      generatedAt: new Date().toISOString(),
    });
  }
});


// MOUNT ADVANCED REPORTING ENDPOINTS
// FEATURE 1, 2, 3, 4, 5 ARE FULLY RESOLVED BELOW TO BE SCALABLE FOR PRISMA & MEMORY DB

// Category Summary Report API Endpoint
app.get("/api/reports/category-summary", auth, async (req: any, res: Response) => {
  if (prisma) {
    try {
      const categories = await prisma.category.findMany({
        where: { businessId: req.businessId },
        include: { inventory: { where: { businessId: req.businessId } } }
      });

      const report = categories.map((category) => {
        let totalQuantity = 0;
        let totalSoldQuantity = 0;
        let inventoryCostValue = 0;
        let soldValue = 0;
        let remainingStockValue = 0;
        let totalSoldCostValue = 0;

        category.inventory.forEach((item) => {
          const cost = Number(item.costPrice);
          const sell = Number(item.sellingPrice);
          totalQuantity += item.quantity;
          totalSoldQuantity += item.soldQuantity;
          inventoryCostValue += item.quantity * cost;
          soldValue += item.soldQuantity * sell;
          remainingStockValue += item.quantity * sell;
          totalSoldCostValue += item.soldQuantity * cost;
        });

        return {
          categoryId: category.id,
          categoryName: category.name,
          categoryGroup: category.group,
          itemCount: category.inventory.length,
          totalQuantity,
          totalSoldQuantity,
          inventoryCostValue,
          soldValue,
          remainingStockValue,
          totalSoldCostValue
        };
      });

      return res.json(report);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const categories = mockDb.categories.filter((c) => c.businessId === req.businessId);
    const items = mockDb.inventory.filter((i) => i.businessId === req.businessId);

    const report = categories.map((cat) => {
      const catItems = items.filter((i) => i.categoryId === cat.id);
      let totalQuantity = 0;
      let totalSoldQuantity = 0;
      let inventoryCostValue = 0;
      let soldValue = 0;
      let remainingStockValue = 0;
      let totalSoldCostValue = 0;

      catItems.forEach((item) => {
        totalQuantity += item.quantity;
        totalSoldQuantity += item.soldQuantity;
        inventoryCostValue += item.quantity * item.costPrice;
        soldValue += item.soldQuantity * item.sellingPrice;
        remainingStockValue += item.quantity * item.sellingPrice;
        totalSoldCostValue += item.soldQuantity * item.costPrice;
      });

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        categoryGroup: cat.group,
        itemCount: catItems.length,
        totalQuantity,
        totalSoldQuantity,
        inventoryCostValue,
        soldValue,
        remainingStockValue,
        totalSoldCostValue
      };
    });

    return res.json(report);
  }
});

// Stock Split Report API Endpoint
app.get("/api/reports/stock-split", auth, async (req: any, res: Response) => {
  if (prisma) {
    try {
      const items = await prisma.inventoryItem.findMany({ where: { businessId: req.businessId } });
      let currentStockCost = 0;
      let soldStockCost = 0;
      let currentStockRetailValue = 0;
      let soldRetailValue = 0;

      items.forEach((item) => {
        const cost = Number(item.costPrice);
        const sell = Number(item.sellingPrice);
        currentStockCost += item.quantity * cost;
        soldStockCost += item.soldQuantity * cost;
        currentStockRetailValue += item.quantity * sell;
        soldRetailValue += item.soldQuantity * sell;
      });

      return res.json({
        currentStockCost,
        soldStockCost,
        totalInventoryCost: currentStockCost + soldStockCost,
        currentStockRetailValue,
        soldRetailValue
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const items = mockDb.inventory.filter((i) => i.businessId === req.businessId);
    let currentStockCost = 0;
    let soldStockCost = 0;
    let currentStockRetailValue = 0;
    let soldRetailValue = 0;

    items.forEach((item) => {
      currentStockCost += item.quantity * item.costPrice;
      soldStockCost += item.soldQuantity * item.costPrice;
      currentStockRetailValue += item.quantity * item.sellingPrice;
      soldRetailValue += item.soldQuantity * item.sellingPrice;
    });

    return res.json({
      currentStockCost,
      soldStockCost,
      totalInventoryCost: currentStockCost + soldStockCost,
      currentStockRetailValue,
      soldRetailValue
    });
  }
});

// Inventory Overview Dashboard API Endpoint
app.get("/api/reports/dashboard-overview", auth, async (req: any, res: Response) => {
  const threshold = req.business.settings.lowStockThreshold || 8;

  if (prisma) {
    try {
      const [totalCats, items] = await Promise.all([
        prisma.category.count({ where: { businessId: req.businessId } }),
        prisma.inventoryItem.findMany({ where: { businessId: req.businessId } })
      ]);

      let totalUnitsInStock = 0;
      let totalUnitsSold = 0;
      let inventoryCostValue = 0;
      let inventoryRetailValue = 0;
      let lowItems = 0;

      items.forEach((item) => {
        totalUnitsInStock += item.quantity;
        totalUnitsSold += item.soldQuantity;
        inventoryCostValue += item.quantity * Number(item.costPrice);
        inventoryRetailValue += item.quantity * Number(item.sellingPrice);
        if (item.quantity <= threshold) lowItems++;
      });

      return res.json({
        totalCategories: totalCats,
        totalInventoryItems: items.length,
        totalUnitsInStock,
        totalUnitsSold,
        inventoryCostValue,
        inventoryRetailValue,
        lowStockItems: lowItems
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const categoriesCount = mockDb.categories.filter((c) => c.businessId === req.businessId).length;
    const items = mockDb.inventory.filter((i) => i.businessId === req.businessId);

    let totalUnitsInStock = 0;
    let totalUnitsSold = 0;
    let inventoryCostValue = 0;
    let inventoryRetailValue = 0;
    let lowItems = 0;

    items.forEach((item) => {
      totalUnitsInStock += item.quantity;
      totalUnitsSold += item.soldQuantity;
      inventoryCostValue += item.quantity * item.costPrice;
      inventoryRetailValue += item.quantity * item.sellingPrice;
      if (item.quantity <= threshold) lowItems++;
    });

    return res.json({
      totalCategories: categoriesCount,
      totalInventoryItems: items.length,
      totalUnitsInStock,
      totalUnitsSold,
      inventoryCostValue,
      inventoryRetailValue,
      lowStockItems: lowItems
    });
  }
});

// Low Stock Report API Endpoint
app.get("/api/reports/low-stock", auth, async (req: any, res: Response) => {
  const threshold = req.business.settings.lowStockThreshold || 8;

  if (prisma) {
    try {
      const items = await prisma.inventoryItem.findMany({
        where: { businessId: req.businessId, quantity: { lte: threshold } },
        include: { category: true },
        orderBy: { quantity: "asc" }
      });
      return res.json(items.map(item => ({ ...item, costPrice: Number(item.costPrice), sellingPrice: Number(item.sellingPrice) })));
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const items = mockDb.inventory.filter((i) => i.businessId === req.businessId && i.quantity <= threshold);
    return res.json(items);
  }
});

// Category CRUDS (Mounting requested Endpoint paths on same service)
app.get("/api/reports/categories", auth, async (req: any, res: Response) => {
  if (prisma) {
    try {
      const categories = await prisma.category.findMany({ where: { businessId: req.businessId }, orderBy: { name: "asc" } });
      return res.json(categories);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const categories = mockDb.categories.filter((c) => c.businessId === req.businessId);
    return res.json(categories);
  }
});

app.post("/api/reports/categories", auth, async (req: any, res: Response) => {
  const { name, group } = req.body;
  if (!name || !group) return res.status(400).json({ error: "Name and group are required elements" });

  const trimmedName = name.trim();
  const trimmedGroup = group.trim();

  if (prisma) {
    try {
      const existing = await prisma.category.findFirst({
        where: { businessId: req.businessId, name: { equals: trimmedName, mode: "insensitive" } }
      });
      if (existing) return res.status(409).json({ error: "Category names already registered" });

      const cat = await prisma.category.create({ data: { businessId: req.businessId, name: trimmedName, group: trimmedGroup } });
      return res.status(201).json(cat);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const exists = mockDb.categories.find((c) => c.businessId === req.businessId && c.name.toLowerCase() === trimmedName.toLowerCase());
    if (exists) return res.status(409).json({ error: "Category name already exists in mock data" });

    const newCat = { id: "c" + Date.now(), businessId: req.businessId, name: trimmedName, group: trimmedGroup };
    mockDb.categories.push(newCat);
    return res.status(201).json(newCat);
  }
});

app.put("/api/reports/categories/:id", auth, async (req: any, res: Response) => {
  const { id } = req.params;
  const { name, group } = req.body;
  if (!name || !group) return res.status(400).json({ error: "Name and group are required elements" });

  const trimmedName = name.trim();
  const trimmedGroup = group.trim();

  if (prisma) {
    try {
      const current = await prisma.category.findFirst({ where: { id, businessId: req.businessId } });
      if (!current) return res.status(404).json({ error: "Category targeted not found" });

      const duplicate = await prisma.category.findFirst({
        where: { businessId: req.businessId, name: { equals: trimmedName, mode: "insensitive" }, id: { not: id } }
      });
      if (duplicate) return res.status(409).json({ error: "Another category with this name exists" });

      const cat = await prisma.category.update({ where: { id }, data: { name: trimmedName, group: trimmedGroup } });
      return res.json(cat);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const cat = mockDb.categories.find((c) => c.id === id && c.businessId === req.businessId);
    if (!cat) return res.status(404).json({ error: "Category target not found" });

    const duplicate = mockDb.categories.find((c) => c.businessId === req.businessId && c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== id);
    if (duplicate) return res.status(409).json({ error: "Category name duplicates another active record" });

    Object.assign(cat, { name: trimmedName, group: trimmedGroup });
    return res.json(cat);
  }
});

app.delete("/api/reports/categories/:id", auth, async (req: any, res: Response) => {
  const { id } = req.params;

  if (prisma) {
    try {
      const current = await prisma.category.findFirst({ where: { id, businessId: req.businessId } });
      if (!current) return res.status(404).json({ error: "Category metadata target not resolved" });

      await prisma.$transaction(async (tx) => {
        const itemCount = await tx.inventoryItem.count({ where: { categoryId: id } });
        if (itemCount > 0) {
          let uncategorized = await tx.category.findFirst({ where: { businessId: req.businessId, name: "Uncategorized" } });
          if (!uncategorized) {
            uncategorized = await tx.category.create({ data: { businessId: req.businessId, name: "Uncategorized", group: "General" } });
          }
          await tx.inventoryItem.updateMany({ where: { categoryId: id }, data: { categoryId: uncategorized.id } });
        }
        await tx.category.delete({ where: { id } });
      });

      return res.json({ message: "Category deleted successully", ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  } else {
    const index = mockDb.categories.findIndex((c) => c.id === id && c.businessId === req.businessId);
    if (index === -1) return res.status(404).json({ error: "Category target identity missing" });

    const itemsToUpdate = mockDb.inventory.filter((i) => i.categoryId === id);
    if (itemsToUpdate.length > 0) {
      let uncategorized = mockDb.categories.find((c) => c.businessId === req.businessId && c.name === "Uncategorized");
      if (!uncategorized) {
        uncategorized = { id: "c_uncat_" + Date.now(), businessId: req.businessId, name: "Uncategorized", group: "General" };
        mockDb.categories.push(uncategorized);
      }
      itemsToUpdate.forEach(item => { item.categoryId = uncategorized.id; });
    }

    mockDb.categories.splice(index, 1);
    return res.json({ message: "Successfully deleted", ok: true });
  }
});


// Configure routing / static assets pipeline
const startServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const serverInstance = http.createServer(app);
  serverInstance.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("Critical failure during bootstrap:", err);
});
