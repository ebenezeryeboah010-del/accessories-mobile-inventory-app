const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Helper to sanitize Decimal fields from Prisma
function parseItem(item) {
  return {
    ...item,
    costPrice: Number(item.costPrice || 0),
    sellingPrice: Number(item.sellingPrice || 0)
  };
}

// FEATURE 1: CATEGORY SUMMARY REPORT
router.get("/category-summary", async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const categories = await prisma.category.findMany({
      where: { businessId },
      include: {
        inventory: {
          where: { businessId }
        }
      }
    });

    const report = categories.map((category) => {
      let itemCount = category.inventory.length;
      let totalQuantity = 0;
      let totalSoldQuantity = 0;
      let inventoryCostValue = 0;
      let soldValue = 0;
      let remainingStockValue = 0;

      category.inventory.forEach((item) => {
        const costPrice = Number(item.costPrice || 0);
        const sellingPrice = Number(item.sellingPrice || 0);

        totalQuantity += item.quantity;
        totalSoldQuantity += item.soldQuantity;
        inventoryCostValue += item.quantity * costPrice;
        soldValue += item.soldQuantity * sellingPrice;
        remainingStockValue += item.quantity * sellingPrice;
      });

      return {
        categoryId: category.id,
        categoryName: category.name,
        categoryGroup: category.group,
        itemCount,
        totalQuantity,
        totalSoldQuantity,
        inventoryCostValue,
        soldValue,
        remainingStockValue
      };
    });

    res.json(report);
  } catch (error) {
    console.error("Error generating category summary report:", error);
    res.status(500).json({ error: "Failed to load category summary report" });
  }
});

// FEATURE 2: STOCK SPLIT REPORT
router.get("/stock-split", async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const items = await prisma.inventoryItem.findMany({
      where: { businessId }
    });

    let currentStockCost = 0;
    let soldStockCost = 0;
    let currentStockRetailValue = 0;
    let soldRetailValue = 0;

    items.forEach((item) => {
      const costPrice = Number(item.costPrice || 0);
      const sellingPrice = Number(item.sellingPrice || 0);

      currentStockCost += item.quantity * costPrice;
      soldStockCost += item.soldQuantity * costPrice;
      currentStockRetailValue += item.quantity * sellingPrice;
      soldRetailValue += item.soldQuantity * sellingPrice;
    });

    res.json({
      currentStockCost,
      soldStockCost,
      totalInventoryCost: currentStockCost + soldStockCost,
      currentStockRetailValue,
      soldRetailValue
    });
  } catch (error) {
    console.error("Error loading stock split report:", error);
    res.status(500).json({ error: "Failed to load stock split report" });
  }
});

// FEATURE 3: INVENTORY OVERVIEW DASHBOARD
router.get("/dashboard-overview", async (req, res) => {
  try {
    const businessId = req.user.businessId;

    // Fetch the business setting for lowStockThreshold
    const setting = await prisma.setting.findUnique({
      where: { businessId }
    });
    const lowStockThreshold = setting ? setting.lowStockThreshold : 8;

    const [totalCategories, items] = await prisma.$transaction([
      prisma.category.count({ where: { businessId } }),
      prisma.inventoryItem.findMany({ where: { businessId } })
    ]);

    let totalUnitsInStock = 0;
    let totalUnitsSold = 0;
    let inventoryCostValue = 0;
    let inventoryRetailValue = 0;
    let lowStockCount = 0;

    items.forEach((item) => {
      const costPrice = Number(item.costPrice || 0);
      const sellingPrice = Number(item.sellingPrice || 0);

      totalUnitsInStock += item.quantity;
      totalUnitsSold += item.soldQuantity;
      inventoryCostValue += item.quantity * costPrice;
      inventoryRetailValue += item.quantity * sellingPrice;

      if (item.quantity <= lowStockThreshold) {
        lowStockCount++;
      }
    });

    res.json({
      totalCategories,
      totalInventoryItems: items.length,
      totalUnitsInStock,
      totalUnitsSold,
      inventoryCostValue,
      inventoryRetailValue,
      lowStockItems: lowStockCount
    });
  } catch (error) {
    console.error("Error loading dashboard overview:", error);
    res.status(500).json({ error: "Failed to load dashboard overview" });
  }
});

// FEATURE 4: LOW STOCK REPORT
router.get("/low-stock", async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const setting = await prisma.setting.findUnique({
      where: { businessId }
    });
    const lowStockThreshold = setting ? setting.lowStockThreshold : 8;

    const items = await prisma.inventoryItem.findMany({
      where: {
        businessId,
        quantity: { lte: lowStockThreshold }
      },
      include: {
        category: true
      },
      orderBy: {
        quantity: "asc"
      }
    });

    res.json(items.map(parseItem));
  } catch (error) {
    console.error("Error loading low stock report:", error);
    res.status(500).json({ error: "Failed to load low stock report" });
  }
});

// FEATURE 5: CATEGORY CRUD

// POST /api/reports/categories - Create Category
router.post("/categories", async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { name, group } = req.body;

    if (!name || !group) {
      return res.status(400).json({ error: "Name and Group are required fields" });
    }

    const trimmedName = name.trim();
    const trimmedGroup = group.trim();

    // Prevent duplicate category names inside same business
    const existing = await prisma.category.findFirst({
      where: {
        businessId,
        name: { equals: trimmedName, mode: "insensitive" }
      }
    });

    if (existing) {
      return res.status(409).json({ error: "Category with this name already exists in your business" });
    }

    const newCategory = await prisma.category.create({
      data: {
        businessId,
        name: trimmedName,
        group: trimmedGroup
      }
    });

    res.status(201).json(newCategory);
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
});

// GET /api/reports/categories - List Categories
router.get("/categories", async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const categories = await prisma.category.findMany({
      where: { businessId },
      orderBy: { name: "asc" }
    });

    res.json(categories);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// PUT /api/reports/categories/:id - Update Category
router.put("/categories/:id", async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;
    const { name, group } = req.body;

    if (!name || !group) {
      return res.status(400).json({ error: "Name and Group are required fields" });
    }

    const trimmedName = name.trim();
    const trimmedGroup = group.trim();

    // Verify category belongs to business first
    const category = await prisma.category.findFirst({
      where: { id, businessId }
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found in your business" });
    }

    // Prevent duplicate names in the business
    const duplicate = await prisma.category.findFirst({
      where: {
        businessId,
        name: { equals: trimmedName, mode: "insensitive" },
        id: { not: id }
      }
    });

    if (duplicate) {
      return res.status(409).json({ error: "Another category with this name already exists" });
    }

    const updatedCategory = await prisma.category.update({
      where: { id },
      data: {
        name: trimmedName,
        group: trimmedGroup
      }
    });

    res.json(updatedCategory);
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Failed to update category" });
  }
});

// DELETE /api/reports/categories/:id - Delete Category
router.delete("/categories/:id", async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;

    // Verify category belongs to business
    const category = await prisma.category.findFirst({
      where: { id, businessId }
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Execute safe reassignment inside Prisma transaction to prevent orphan inventory records
    await prisma.$transaction(async (tx) => {
      // Find if there are inventory items in this category
      const itemCount = await tx.inventoryItem.count({
        where: { categoryId: id }
      });

      if (itemCount > 0) {
        // Fallback to "Uncategorized" category in the business
        let uncategorized = await tx.category.findFirst({
          where: { businessId, name: "Uncategorized" }
        });

        if (!uncategorized) {
          uncategorized = await tx.category.create({
            data: {
              businessId,
              name: "Uncategorized",
              group: "General"
            }
          });
        }

        // Reassign items to Uncategorized instead of cascading or deleting catalog assets
        await tx.inventoryItem.updateMany({
          where: { categoryId: id },
          data: { categoryId: uncategorized.id }
        });
      }

      // Delete the category safely
      await tx.category.delete({
        where: { id }
      });
    });

    res.json({ message: "Category deleted successfully", ok: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

module.exports = router;
