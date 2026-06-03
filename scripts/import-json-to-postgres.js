const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

require("./load-env");

const prisma = new PrismaClient();
const dbPath = path.join(__dirname, "..", "data", "db.json");

function convertPasswordHash(oldHash) {
  if (!oldHash || !oldHash.includes(":")) return oldHash;
  return bcrypt.hashSync("password123", 12);
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Cannot find ${dbPath}`);
  }

  const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));

  for (const business of data.businesses || []) {
    await prisma.business.upsert({
      where: { id: business.id },
      update: { name: business.name, createdAt: new Date(business.createdAt) },
      create: { id: business.id, name: business.name, createdAt: new Date(business.createdAt) },
    });

    await prisma.setting.upsert({
      where: { businessId: business.id },
      update: business.settings,
      create: { businessId: business.id, ...business.settings },
    });
  }

  for (const user of data.users || []) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        businessId: user.businessId,
        name: user.name,
        email: user.email.toLowerCase(),
        role: user.role,
        passwordHash: convertPasswordHash(user.passwordHash),
        createdAt: new Date(user.createdAt),
      },
      create: {
        id: user.id,
        businessId: user.businessId,
        name: user.name,
        email: user.email.toLowerCase(),
        role: user.role,
        passwordHash: convertPasswordHash(user.passwordHash),
        createdAt: new Date(user.createdAt),
      },
    });
  }

  for (const category of data.categories || []) {
    await prisma.category.upsert({
      where: { id: category.id },
      update: { businessId: category.businessId, name: category.name, group: category.group },
      create: category,
    });
  }

  for (const item of data.inventory || []) {
    await prisma.inventoryItem.upsert({
      where: { id: item.id },
      update: {
        businessId: item.businessId,
        categoryId: item.categoryId,
        name: item.name,
        sku: item.sku,
        type: item.type,
        quantity: item.quantity,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        location: item.location,
        barcode: item.barcode,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      },
      create: {
        id: item.id,
        businessId: item.businessId,
        categoryId: item.categoryId,
        name: item.name,
        sku: item.sku,
        type: item.type,
        quantity: item.quantity,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        location: item.location,
        barcode: item.barcode,
        createdAt: new Date(item.createdAt),
        updatedAt: new Date(item.updatedAt),
      },
    });
  }

  for (const note of data.notifications || []) {
    await prisma.notification.upsert({
      where: { id: note.id },
      update: { ...note, createdAt: new Date(note.createdAt) },
      create: { ...note, createdAt: new Date(note.createdAt) },
    });
  }

  for (const log of data.auditLogs || []) {
    await prisma.auditLog.upsert({
      where: { id: log.id },
      update: { ...log, createdAt: new Date(log.createdAt) },
      create: { ...log, createdAt: new Date(log.createdAt) },
    });
  }

  console.log("Imported data/db.json into PostgreSQL.");
  console.log("Note: existing JSON demo passwords are reset to password123 during import.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
