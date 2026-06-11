const path = require("path");
const http = require("http");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { Server } = require("socket.io");
const { PrismaClient, Role } = require("@prisma/client");

require("./scripts/load-env");

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CORS_ORIGIN || "http://localhost:4173" },
});

const PORT = process.env.PORT || 4173;
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-change-me";
const PUBLIC_DIR = path.join(__dirname, "public");
const emailProvider = process.env.EMAIL_PROVIDER || "";
const resendApiKey = process.env.RESEND_API_KEY || "";
const emailFrom = process.env.EMAIL_FROM || "no-reply@mobilehub.local";
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "";
const twilioFrom = process.env.TWILIO_FROM || "";

const permissionsByRole = {
  CEO: ["inventory:read", "inventory:write", "users:read", "notifications:read", "settings:write", "analytics:read"],
  Admin: ["inventory:read", "inventory:write", "users:read", "notifications:read", "settings:write", "analytics:read"],
  Manager: ["inventory:read", "inventory:write", "notifications:read", "analytics:read", "settings:write"],
  Staff: ["inventory:read", "notifications:read"],
};

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.use(express.static(PUBLIC_DIR));

io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.join(`user:${payload.sub}`);
    socket.join(`business:${payload.businessId}`);
  } catch {
    socket.disconnect(true);
  }
});

function signToken(user) {
  return jwt.sign(
    { sub: user.id, businessId: user.businessId, role: user.role },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { business: { include: { settings: true } } } });
    if (!user) return res.status(401).json({ error: "Authentication required" });
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
      },
    };
    req.permissions = permissionsByRole[user.role] || [];
    next();
  } catch {
    res.status(401).json({ error: "Authentication required" });
  }
}

function can(permission) {
  return (req, res, next) => {
    if (!req.permissions.includes(permission)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

function userDto(user) {
  return {
    id: user.id,
    businessId: user.businessId,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

async function audit(businessId, userId, action) {
  await prisma.auditLog.create({ data: { businessId, userId, action } });
}

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({ token: z.string().min(20), password: z.string().min(8) });
const registerSchema = z.object({
  businessName: z.string().min(2),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});
const inventorySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(2),
  sku: z.string().optional(),
  type: z.string().optional(),
  quantity: z.coerce.number().int().min(0),
  soldQuantity: z.coerce.number().int().min(0).default(0),
  costPrice: z.coerce.number().min(0).default(0),
  sellingPrice: z.coerce.number().min(0).default(0),
  location: z.string().optional(),
  barcode: z.string().optional(),
});
const settingsSchema = z.object({
  lowStockThreshold: z.coerce.number().int().min(1),
  darkMode: z.boolean(),
  notifyCeoOnManagerStock: z.boolean(),
  emailNotifications: z.boolean(),
  smsNotifications: z.boolean(),
  accountingProvider: z.string().min(2).max(30),
  accountingEmail: z.string().max(120).optional().default(""),
  smsPhone: z.string().max(40).optional().default(""),
  currency: z.string().min(3).max(3),
});
const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["CEO", "Admin", "Manager", "Staff"]),
  password: z.string().min(8),
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() }, include: { business: { include: { settings: true } } } });
    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });
    await audit(user.businessId, user.id, "Signed in");
    res.json({ token: signToken(user), user: userDto(user), business: { ...user.business, settings: user.business.settings } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: "Email already exists" });

    await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name: body.businessName,
          settings: { create: { currency: "USD" } },
          categories: {
            create: defaultCategories().map((category) => ({ name: category.name, group: category.group })),
          },
        },
      });
      const user = await tx.user.create({
        data: {
          businessId: business.id,
          name: body.name,
          email: body.email.toLowerCase(),
          role: Role.CEO,
          passwordHash: await bcrypt.hash(body.password, 12),
        },
      });
      await tx.auditLog.create({ data: { businessId: business.id, userId: user.id, action: "Registered business account" } });
    });

    res.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/forgot-password", async (req, res, next) => {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!user) {
      return res.json({ message: "If the email exists, reset instructions have been created." });
    }

    const token = require("crypto").randomBytes(20).toString("hex");
    const tokenHash = await bcrypt.hash(token, 12);

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.passwordResetToken.create({
      data: {
        businessId: user.businessId,
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    });
    await audit(user.businessId, user.id, "Requested password reset");

    res.json({
      message: "Reset code created. In production this code should be emailed to the user.",
      resetToken: token,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/reset-password", async (req, res, next) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const activeTokens = await prisma.passwordResetToken.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    });
    const match = activeTokens.find((entry) => bcrypt.compareSync(body.token, entry.tokenHash));
    if (!match) return res.status(400).json({ error: "Reset code is invalid or expired" });

    await prisma.$transaction([
      prisma.user.update({
        where: { id: match.userId },
        data: { passwordHash: await bcrypt.hash(body.password, 12) },
      }),
      prisma.passwordResetToken.update({
        where: { id: match.id },
        data: { usedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: { businessId: match.businessId, userId: match.userId, action: "Reset password" },
      }),
    ]);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", auth, (req, res) => {
  res.json({ user: userDto(req.user), business: req.business, permissions: req.permissions });
});

app.get("/api/inventory", auth, can("inventory:read"), async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();
    const items = await prisma.inventoryItem.findMany({
      where: {
        businessId: req.user.businessId,
        ...(category ? { categoryId: category } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { type: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { name: "asc" },
    });
    const categories = await prisma.category.findMany({ where: { businessId: req.user.businessId }, orderBy: { name: "asc" } });
    res.json({ items: items.map(decimalItem), categories });
  } catch (error) {
    next(error);
  }
});

app.post("/api/inventory", auth, can("inventory:write"), async (req, res, next) => {
  try {
    const body = inventorySchema.parse(req.body);
    const item = await prisma.inventoryItem.create({
      data: {
        businessId: req.user.businessId,
        categoryId: body.categoryId,
        name: body.name,
        sku: sanitizeSku(body.sku || body.name),
        type: body.type || "Accessory",
        quantity: body.quantity,
        soldQuantity: body.soldQuantity,
        costPrice: body.costPrice,
        sellingPrice: body.sellingPrice,
        location: body.location || "Main store",
        barcode: body.barcode || String(Math.floor(100000000000 + Math.random() * 899999999999)),
      },
    });
    await prisma.stockHistory.create({
      data: {
        businessId: req.user.businessId,
        userId: req.user.id,
        categoryId: item.categoryId,
        itemId: item.id,
        action: "created",
        oldQuantity: 0,
        newQuantity: item.quantity,
        soldQuantity: item.soldQuantity,
      },
    });
    await audit(req.user.businessId, req.user.id, `Added stock item: ${item.name}`);
    await notifyCeoIfManager(req, `Manager added stock: ${item.name}`);
    res.status(201).json({ item: decimalItem(item) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/inventory/:id", auth, can("inventory:write"), async (req, res, next) => {
  try {
    const body = inventorySchema.parse(req.body);
    const current = await prisma.inventoryItem.findFirst({ where: { id: req.params.id, businessId: req.user.businessId } });
    if (!current) return res.status(404).json({ error: "Inventory item not found" });
    const item = await prisma.inventoryItem.update({
      where: { id: current.id },
      data: {
        categoryId: body.categoryId,
        name: body.name,
        sku: sanitizeSku(body.sku || body.name),
        type: body.type || "Accessory",
        quantity: body.quantity,
        soldQuantity: body.soldQuantity,
        costPrice: body.costPrice,
        sellingPrice: body.sellingPrice,
        location: body.location || "Main store",
        barcode: body.barcode || current.barcode,
      },
    });
    await prisma.stockHistory.createMany({
      data: [
        {
          businessId: req.user.businessId,
          userId: req.user.id,
          categoryId: current.categoryId,
          itemId: current.id,
          action: "before_edit",
          oldQuantity: current.quantity,
          newQuantity: current.quantity,
          soldQuantity: current.soldQuantity,
        },
        {
          businessId: req.user.businessId,
          userId: req.user.id,
          categoryId: item.categoryId,
          itemId: item.id,
          action: "after_edit",
          oldQuantity: current.quantity,
          newQuantity: item.quantity,
          soldQuantity: item.soldQuantity,
        },
      ],
    });
    await audit(req.user.businessId, req.user.id, `Updated stock item: ${item.name}`);
    await notifyCeoIfManager(req, `Manager updated stock: ${item.name}`);
    res.json({ item: decimalItem(item) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/inventory/:id", auth, can("inventory:write"), async (req, res, next) => {
  try {
    const current = await prisma.inventoryItem.findFirst({ where: { id: req.params.id, businessId: req.user.businessId } });
    if (!current) return res.status(404).json({ error: "Inventory item not found" });
    await prisma.inventoryItem.delete({ where: { id: current.id } });
    await audit(req.user.businessId, req.user.id, `Deleted stock item: ${current.name}`);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics", auth, can("analytics:read"), async (req, res, next) => {
  try {
    const [items, categories, logs, historyRows] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { businessId: req.user.businessId } }),
      prisma.category.findMany({ where: { businessId: req.user.businessId } }),
      prisma.auditLog.findMany({ where: { businessId: req.user.businessId }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.stockHistory.findMany({ where: { businessId: req.user.businessId }, orderBy: { createdAt: "desc" }, take: 40 }),
    ]);
    const threshold = req.business.settings.lowStockThreshold || 8;
    const categoryTotals = categories.map((category) => {
      const categoryItems = items.filter((item) => item.categoryId === category.id);
      return {
        id: category.id,
        name: category.name,
        quantity: categoryItems.reduce((sum, item) => sum + item.quantity, 0),
        soldQuantity: categoryItems.reduce((sum, item) => sum + item.soldQuantity, 0),
        unitPriceTotal: categoryItems.reduce((sum, item) => sum + Number(item.sellingPrice), 0),
        stockValue: categoryItems.reduce((sum, item) => sum + item.quantity * Number(item.costPrice), 0),
        retailValue: categoryItems.reduce((sum, item) => sum + item.quantity * Number(item.sellingPrice), 0),
      };
    });
    res.json({
      totalItems: items.length,
      totalStock: items.reduce((sum, item) => sum + item.quantity, 0),
      stockValue: items.reduce((sum, item) => sum + item.quantity * Number(item.costPrice), 0),
      lowStock: items.filter((item) => item.quantity <= threshold).map(decimalItem),
      categoryTotals,
      history: historyRows.map((entry) => ({ ...entry, categoryName: categories.find((category) => category.id === entry.categoryId)?.name || "Unknown category" })),
      logs,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/notifications", auth, can("notifications:read"), async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { businessId: req.user.businessId, userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ notifications });
  } catch (error) {
    next(error);
  }
});

app.get("/api/accounting/summary", auth, can("analytics:read"), async (req, res, next) => {
  try {
    const [items, categories] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { businessId: req.user.businessId } }),
      prisma.category.findMany({ where: { businessId: req.user.businessId } }),
    ]);
    const inventoryValue = items.reduce((sum, item) => sum + item.quantity * Number(item.costPrice), 0);
    const retailValue = items.reduce((sum, item) => sum + item.quantity * Number(item.sellingPrice), 0);
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
    res.json({
      provider: req.business.settings.accountingProvider || "CSV",
      inventoryValue,
      retailValue,
      potentialProfit: retailValue - inventoryValue,
      categoryRows,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings", auth, can("settings:write"), async (req, res, next) => {
  try {
    const body = settingsSchema.parse(req.body);
    const settings = await prisma.setting.upsert({
      where: { businessId: req.user.businessId },
      update: body,
      create: { businessId: req.user.businessId, ...body },
    });
    await audit(req.user.businessId, req.user.id, "Updated system settings");
    res.json({ business: { ...req.business, settings } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/users", auth, can("users:read"), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({ where: { businessId: req.user.businessId }, orderBy: { createdAt: "asc" } });
    res.json({ users: users.map(userDto) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/users", auth, can("users:read"), async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: "Email already exists" });
    const user = await prisma.user.create({
      data: {
        businessId: req.user.businessId,
        name: body.name,
        email: body.email.toLowerCase(),
        role: body.role,
        passwordHash: await bcrypt.hash(body.password, 12),
      },
    });
    await audit(req.user.businessId, req.user.id, `Created ${body.role} user: ${body.name}`);
    res.status(201).json({ user: userDto(user) });
  } catch (error) {
    next(error);
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((error, req, res, next) => {
  if (error instanceof z.ZodError) return res.status(422).json({ error: error.errors[0]?.message || "Invalid input" });
  console.error(error);
  res.status(500).json({ error: "Server error" });
});

function decimalItem(item) {
  return { ...item, costPrice: Number(item.costPrice), sellingPrice: Number(item.sellingPrice) };
}

function sanitizeSku(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

async function notifyCeoIfManager(req, message) {
  if (req.user.role !== "Manager" || !req.business.settings.notifyCeoOnManagerStock) return;
  const ceos = await prisma.user.findMany({ where: { businessId: req.user.businessId, role: Role.CEO } });
  await Promise.all(
    ceos.map(async (ceo) => {
      const notification = await prisma.notification.create({
        data: { businessId: req.user.businessId, userId: ceo.id, message },
      });
      await queueNotificationDelivery(req.business, notification, "in-app", ceo.email, message);
      if (req.business.settings.emailNotifications) await queueNotificationDelivery(req.business, notification, "email", req.business.settings.accountingEmail || ceo.email, message);
      if (req.business.settings.smsNotifications) await queueNotificationDelivery(req.business, notification, "sms", req.business.settings.smsPhone || "not configured", message);
      io.to(`user:${ceo.id}`).emit("notification", notification);
    })
  );
}

async function queueNotificationDelivery(business, notification, channel, destination, message) {
  const status = await deliverNotification(channel, destination, message);
  await prisma.notificationDelivery.create({
    data: {
      businessId: business.id,
      notificationId: notification.id,
      channel,
      destination,
      status,
    },
  });
}

async function deliverNotification(channel, destination, message) {
  if (channel === "in-app") return "delivered";
  if (channel === "email" && (!emailProvider || !resendApiKey)) return "provider_not_configured";
  if (channel === "sms" && (!twilioAccountSid || !twilioAuthToken || !twilioFrom)) return "provider_not_configured";
  try {
    if (channel === "email") {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to: destination,
          subject: "Inventory stock update",
          text: message,
        }),
      });
      return response.ok ? "sent" : "failed";
    }
    if (channel === "sms") {
      const params = new URLSearchParams({ From: twilioFrom, To: destination, Body: message });
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
    return "skipped";
  } catch {
    return "failed";
  }
}

function defaultCategories() {
  return [
    { name: "Android phones", group: "Phones" },
    { name: "Cell phones", group: "Phones" },
    { name: "Android accessories", group: "Accessories" },
    { name: "Cell phone accessories", group: "Accessories" },
    { name: "Chargers", group: "Power" },
    { name: "Headsets and earphones", group: "Audio" },
    { name: "AirPods", group: "Audio" },
    { name: "Screen protectors", group: "Protection" },
    { name: "Phone batteries", group: "Power" },
    { name: "Other accessories", group: "Accessories" },
  ];
}

server.listen(PORT, () => {
  console.log(`PostgreSQL inventory app running at http://localhost:${PORT}`);
});
