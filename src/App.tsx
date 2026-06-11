import React, { useState, useEffect } from "react";
import {
  BarChart3,
  Boxes,
  Briefcase,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Moon,
  Sun,
  Settings as SettingsIcon,
  Users as UsersIcon,
  TrendingUp,
  FolderTree,
  DollarSign,
  PieChart,
  Eye,
  EyeOff,
  Check,
  X,
  FileSpreadsheet,
  Plus,
  Trash2,
  Edit3,
  Mail,
  Lock,
  MessageSquare,
  ChevronRight,
  UserCheck,
  LockKeyhole
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types
interface Category {
  id: string;
  name: string;
  group: string;
}

interface InventoryItem {
  id: string;
  categoryId: string;
  name: string;
  sku: string;
  type: string;
  quantity: number;
  soldQuantity: number;
  costPrice: number;
  sellingPrice: number;
  location: string;
  barcode: string;
  createdAt?: string;
  updatedAt?: string;
  category?: Category;
}

interface CategoryReport {
  categoryId: string;
  categoryName: string;
  categoryGroup: string;
  itemCount: number;
  totalQuantity: number;
  totalSoldQuantity: number;
  inventoryCostValue: number;
  soldValue: number;
  remainingStockValue: number;
}

interface StockSplitReport {
  currentStockCost: number;
  soldStockCost: number;
  totalInventoryCost: number;
  currentStockRetailValue: number;
  soldRetailValue: number;
}

interface DashboardOverview {
  totalCategories: number;
  totalInventoryItems: number;
  totalUnitsInStock: number;
  totalUnitsSold: number;
  inventoryCostValue: number;
  inventoryRetailValue: number;
  lowStockItems: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  businessId: string;
}

interface Business {
  id: string;
  name: string;
  settings?: {
    lowStockThreshold: number;
    darkMode: boolean;
    notifyCeoOnManagerStock: boolean;
    emailNotifications: boolean;
    smsNotifications: boolean;
    accountingProvider: string;
    accountingEmail: string;
    smsPhone: string;
    currency: string;
  };
}

export default function App() {
  // Session State
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [me, setMe] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [settings, setSettings] = useState<any>({
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

  // Navigation state
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Application Data States
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Analytics & Specialized Reports States
  const [summaryReport, setSummaryReport] = useState<CategoryReport[]>([]);
  const [stockSplit, setStockSplit] = useState<StockSplitReport | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [lowStockReport, setLowStockReport] = useState<InventoryItem[]>([]);

  // Modal / Form and UI Editing states
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: "",
    categoryId: "",
    type: "",
    quantity: 0,
    soldQuantity: 0,
    costPrice: 0,
    sellingPrice: 0,
    location: "Main store",
    barcode: "",
  });

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Categories Manager Form states
  const [newCatName, setNewCatName] = useState("");
  const [newCatGroup, setNewCatGroup] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // User Manager Form states
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "Staff",
    password: "",
  });

  // Auth Screens state
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Instant registration verifications state
  const [regEmail, setRegEmail] = useState("");
  const [regEmailInUse, setRegEmailInUse] = useState<boolean | null>(null);
  const [regPassword, setRegPassword] = useState("");
  const [passStrength, setPassStrength] = useState({
    score: 0,
    hasMinLength: false,
    hasUpper: false,
    hasLower: false,
    hasNumber: false,
    hasSymbol: false,
  });

  // Password reset flow fields
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetFinished, setResetFinished] = useState(false);

  // Helper Toast
  const toast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Check unique email during registration as user types (Real-Time duplicate checker)
  useEffect(() => {
    if (regEmail.length < 4 || !regEmail.includes("@")) {
      setRegEmailInUse(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/auth/check-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: regEmail })
        });
        const d = await res.json();
        setRegEmailInUse(!d.available);
      } catch (e) {
        setRegEmailInUse(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [regEmail]);

  // Real-Time password strength validations
  useEffect(() => {
    const hasMinLength = regPassword.length >= 8;
    const hasUpper = /[A-Z]/.test(regPassword);
    const hasLower = /[a-z]/.test(regPassword);
    const hasNumber = /[0-9]/.test(regPassword);
    const hasSymbol = /[^A-Za-z0-9]/.test(regPassword);

    let score = 0;
    if (hasMinLength) score += 20;
    if (hasUpper) score += 20;
    if (hasLower) score += 20;
    if (hasNumber) score += 20;
    if (hasSymbol) score += 20;

    setPassStrength({ score, hasMinLength, hasUpper, hasLower, hasNumber, hasSymbol });
  }, [regPassword]);

  // Authenticated Data Pulling
  const fetchAllData = async (tokenStr: string) => {
    try {
      // 1. Me metadata
      const meRes = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${tokenStr}` }
      });
      if (!meRes.ok) throw new Error("Session invalid");
      const meData = await meRes.json();
      setMe(meData.user);
      setBusiness(meData.business);
      if (meData.business?.settings) {
        setSettings(meData.business.settings);
        // Toggle dark theme selector on body
        document.body.classList.toggle("dark", !!meData.business.settings.darkMode);
      }

      // 2. Fetch inventory query
      const invRes = await fetch(`/api/inventory?q=${searchQuery}&category=${categoryFilter}`, {
        headers: { Authorization: `Bearer ${tokenStr}` }
      });
      if (invRes.ok) {
        const invData = await invRes.json();
        setInventory(invData.items);
        setCategories(invData.categories);
      }

      // 3. Fetch notifications
      const notRes = await fetch("/api/notifications", {
        headers: { Authorization: `Bearer ${tokenStr}` }
      });
      if (notRes.ok) {
        const notData = await notRes.json();
        setNotifications(notData.notifications);
      }

      // 4. Fetch reports & dashboard features using reports endpoints
      fetchReports(tokenStr);

      // 5. Audit logs & staffing users
      if (["CEO", "Admin"].includes(meData.user.role)) {
        const usrRes = await fetch("/api/users", {
          headers: { Authorization: `Bearer ${tokenStr}` }
        });
        if (usrRes.ok) {
          const usrData = await usrRes.json();
          setUsersList(usrData.users);
        }
      }

    } catch (err) {
      console.error(err);
      handleLogout();
    }
  };

  const fetchReports = async (tokenStr: string) => {
    try {
      // Feature 1: Category summary report
      const catSumRes = await fetch("/api/reports/category-summary", {
        headers: { Authorization: `Bearer ${tokenStr}` }
      });
      if (catSumRes.ok) {
        const catSum = await catSumRes.json();
        setSummaryReport(catSum);
      }

      // Feature 2: Stock split report
      const splitRes = await fetch("/api/reports/stock-split", {
        headers: { Authorization: `Bearer ${tokenStr}` }
      });
      if (splitRes.ok) {
        const split = await splitRes.json();
        setStockSplit(split);
      }

      // Feature 3: Inventory overview dashboard
      const overRes = await fetch("/api/reports/dashboard-overview", {
        headers: { Authorization: `Bearer ${tokenStr}` }
      });
      if (overRes.ok) {
        const overviewData = await overRes.json();
        setOverview(overviewData);
      }

      // Feature 4: Low stock report
      const lowRes = await fetch("/api/reports/low-stock", {
        headers: { Authorization: `Bearer ${tokenStr}` }
      });
      if (lowRes.ok) {
        const lowData = await lowRes.json();
        setLowStockReport(lowData);
      }
    } catch (e) {
      console.error("Failed loading active reporting data summaries", e);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAllData(token);
    }
  }, [token]);

  // Delayed live query execution
  useEffect(() => {
    if (token) {
      const delayTimer = setTimeout(() => {
        fetch(`/api/inventory?q=${encodeURIComponent(searchQuery)}&category=${categoryFilter}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then((res) => res.json())
          .then((data) => setInventory(data.items));
      }, 350);
      return () => clearTimeout(delayTimer);
    }
  }, [searchQuery, categoryFilter]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login returned invalid code");

      localStorage.setItem("token", data.token);
      setToken(data.token);
      toast("Welcome back! Credentials authenticated successfully.");
    } catch (err: any) {
      toast(err.message);
    }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (regEmailInUse) {
      toast("Cannot register. Email is currently occupied.");
      return;
    }
    if (passStrength.score < 60) {
      toast("Weak password validation failed. Please address requirements.");
      return;
    }

    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration validation error");

      toast("Business account generated successfully! Logging in...");
      setAuthMode("login");
    } catch (err: any) {
      toast(err.message);
    }
  };

  const handleForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();
      if (data.resetToken) {
        // Expose directly in UI for testing/demo completeness
        setResetCode(data.resetToken);
        toast(`Reset security code compiled! Code is: ${data.resetToken}`);
        setAuthMode("reset");
      } else {
        toast(data.message || "Reset request finished successfully.");
      }
    } catch (e) {
      toast("Error forwarding request details.");
    }
  };

  const handleResetSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetCode, password: resetPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      setResetFinished(true);
      toast("Password reset finished successfully! Redirecting...");
      setTimeout(() => {
        setAuthMode("login");
        setResetFinished(false);
        setResetCode("");
        setResetPassword("");
      }, 2000);
    } catch (e: any) {
      toast(e.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setMe(null);
    setBusiness(null);
    setActiveTab("dashboard");
  };

  // INVENTORY OPERATIONS
  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) return;

    const url = editingItem ? `/api/inventory/${editingItem.id}` : "/api/inventory";
    const method = editingItem ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(itemForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed item action validation");

      toast(editingItem ? "Stock item updated successfully" : "Added catalog item successfully");
      setIsAddingItem(false);
      setEditingItem(null);
      setItemForm({
        name: "",
        categoryId: "",
        type: "",
        quantity: 0,
        soldQuantity: 0,
        costPrice: 0,
        sellingPrice: 0,
        location: "Main store",
        barcode: "",
      });
      fetchAllData(token);
    } catch (err: any) {
      toast(err.message);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!token || !window.confirm("Verify deleting this inventory log permanently?")) return;
    try {
      const res = await fetch(`/api/inventory/${itemId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Delete forbidden");
      }
      toast("Inventory catalog metrics extracted successfully.");
      fetchAllData(token);
    } catch (err: any) {
      toast(err.message);
    }
  };

  // CATEGORY OPERATIONS (CRUD)
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newCatName || !newCatGroup) {
      toast("Category metrics incomplete");
      return;
    }

    const url = editingCategory ? `/api/reports/categories/${editingCategory.id}` : "/api/reports/categories";
    const method = editingCategory ? "PUT" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newCatName, group: newCatGroup })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Duplicate name or constraint failure");

      toast(editingCategory ? "Category credentials updated" : "Category registration finalized");
      setNewCatName("");
      setNewCatGroup("");
      setEditingCategory(null);
      fetchAllData(token);
    } catch (e: any) {
      toast(e.message);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    if (!token || !window.confirm("Permanent Category extraction: Items under this category will automatically fallback to 'Uncategorized'. Proceed?")) return;
    try {
      const res = await fetch(`/api/reports/categories/${catId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Deletion category error");
      }
      toast("Category updated gracefully and items reassigned successfully.");
      fetchAllData(token);
    } catch (e: any) {
      toast(e.message);
    }
  };

  // STAFF CREATOR
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newUser)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Credentials compilation conflict");

      toast(`Staff authorization configured for: ${newUser.name}`);
      setNewUser({ name: "", email: "", role: "Staff", password: "" });
      fetchAllData(token);
    } catch (e: any) {
      toast(e.message);
    }
  };

  // SETTINGS SAVE
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Constraint saved denied");

      setBusiness(data.business);
      setSettings(data.business.settings);
      document.body.classList.toggle("dark", !!data.business.settings.darkMode);
      toast("Configuration records synchronized successfully.");
      fetchAllData(token);
    } catch (e: any) {
      toast(e.message);
    }
  };

  // CSV EXPORT HELPER
  const exportCsv = () => {
    const headers = ["Name", "SKU", "Category", "Type", "In Stock", "Sold Units", "Cost Price", "Selling Price", "Total Asset Value", "Location", "Barcode"];
    const lines = inventory.map((i) => {
      const cat = categories.find(c => c.id === i.categoryId)?.name || "General";
      return [
        i.name,
        i.sku,
        cat,
        i.type,
        i.quantity,
        i.soldQuantity,
        i.costPrice,
        i.sellingPrice,
        i.quantity * i.costPrice,
        i.location,
        i.barcode
      ].map(val => `"${String(val ?? "").replace(/"/g, '""')}"`).join(",");
    });

    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `MobileHub_Inventory_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // MONEY FORMATTING
  const fmtMoney = (val: number) => {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: settings.currency || "USD"
    }).format(val || 0);
  };

  // Rendering conditional frames
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row items-stretch transition-colors duration-200">
        {/* Toast Container */}
        {toastMessage && (
          <div className="fixed top-6 right-6 z-50 bg-slate-900 dark:bg-slate-100 text-slate-100 dark:text-slate-900 px-5 py-3 rounded-lg shadow-xl text-sm font-semibold border border-slate-700/50 flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            {toastMessage}
          </div>
        )}

        {/* Story Section */}
        <div className="w-full md:w-1/2 bg-slate-900 border-r border-slate-800 p-8 md:p-12 lg:p-16 flex flex-col justify-between text-slate-200">
          <div>
            <div className="flex items-center gap-3 mb-10">
              <span className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center font-black text-white text-lg tracking-wider">
                MH
              </span>
              <span className="font-extrabold text-xl tracking-tight text-white">MobileHub Inventory</span>
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tighter mb-6 mt-12">
              Precise Stock <br />
              Control for Shops.
            </h1>
            <p className="text-slate-400 text-base md:text-lg max-w-md leading-relaxed">
              Robust multi-tenant tracking constructed to monitor counters, manage catalog categories, generate low stock triggers, export CSV details, and verify credentials.
            </p>
          </div>

          <div className="mt-12">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/45 px-3 py-1.5 rounded-md border border-emerald-900/30 w-fit">
              <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
              Demo Server Operating Mode
            </div>
            <div className="text-xs text-slate-500 mt-2 font-mono">
              Test CEO: ceo@mobilehub.test | password123 <br />
              Test Manager: manager@mobilehub.test | password123
            </div>
          </div>
        </div>

        {/* Auth Forms */}
        <div className="w-full md:w-1/2 p-8 md:p-12 lg:p-16 flex items-center justify-center">
          <div className="w-full max-w-md">
            {/* Header Tabs */}
            <div className="flex gap-2 p-1.5 bg-slate-100 dark:bg-slate-900 rounded-xl mb-8 border border-slate-200/50 dark:border-slate-800/30">
              <button
                onClick={() => setAuthMode("login")}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                  authMode === "login"
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                }`}
              >
                Log In
              </button>
              <button
                onClick={() => setAuthMode("register")}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all ${
                  authMode === "register"
                    ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
                }`}
              >
                Register Shop
              </button>
            </div>

            {/* Login UI */}
            {authMode === "login" && (
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Welcome Back</h2>
                  <p className="text-sm text-slate-500">Input security coordinates to access inventory.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-3 w-5 h-5 text-slate-400" />
                      <input
                        type="email"
                        name="email"
                        required
                        className="pl-11 pr-4 w-full h-[46px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                        placeholder="ceo@mobilehub.test"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-3 w-5 h-5 text-slate-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        required
                        className="pl-11 pr-12 w-full h-[46px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 focus:outline-none h-5"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white h-[46px] rounded-lg font-bold transition-all text-sm shadow-md mt-6">
                  Verify Credentials
                </button>

                <div className="text-center mt-4">
                  <button
                    type="button"
                    onClick={() => setAuthMode("forgot")}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    Forgot Password?
                  </button>
                </div>
              </form>
            )}

            {/* Register shop UI */}
            {authMode === "register" && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Register Shop Entity</h2>
                  <p className="text-sm text-slate-500">Instantly provision isolated Multi-Tenant Business workspace.</p>
                </div>

                <div className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Shop / Business Name</label>
                    <input
                      name="businessName"
                      required
                      className="px-3.5 w-full h-[46px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="e.g. MobileHub Kumasi Branch"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">CEO Executive Name</label>
                    <input
                      name="name"
                      required
                      className="px-3.5 w-full h-[46px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="e.g. Amina CEO"
                    />
                  </div>

                  {/* Email with real-time verify indicators */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center bg-transparent">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 bg-transparent">Email Address</label>
                      {regEmailInUse !== null && (
                        <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${regEmailInUse ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {regEmailInUse ? "Taken / In Use" : "Available"}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="email"
                        name="email"
                        required
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="px-3.5 w-full h-[46px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                        placeholder="e.g. corporate-admin@mobilehub.test"
                      />
                    </div>
                  </div>

                  {/* Password with Strength Indicators */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Security Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        required
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        className="px-3.5 pr-12 w-full h-[46px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm animate-none"
                        placeholder="Must contain 8+ chars"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 h-5"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>

                    {/* Password indicators */}
                    <div className="mt-2 space-y-2.5 bg-slate-100 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-200/50 dark:border-slate-800/40">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-black uppercase text-slate-500">Security Index</span>
                        <span className={`text-xs font-black ${
                          passStrength.score < 40 ? "text-red-500" : passStrength.score < 80 ? "text-amber-500" : "text-emerald-500"
                        }`}>
                          {passStrength.score}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-350 ${
                            passStrength.score < 40 ? "bg-red-500" : passStrength.score < 80 ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                          style={{ width: `${passStrength.score}%` }}
                        ></div>
                      </div>

                      {/* Requirement checklists */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-1 text-[11px] font-semibold text-slate-500">
                        <div className="flex items-center gap-1 bg-transparent">
                          {passStrength.hasMinLength ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                          <span>8+ Characters</span>
                        </div>
                        <div className="flex items-center gap-1 bg-transparent">
                          {passStrength.hasUpper ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                          <span>Uppercase letter</span>
                        </div>
                        <div className="flex items-center gap-1 bg-transparent">
                          {passStrength.hasLower ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                          <span>Lowercase letter</span>
                        </div>
                        <div className="flex items-center gap-1 bg-transparent">
                          {passStrength.hasNumber ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                          <span>Numeric digits</span>
                        </div>
                        <div className="flex items-center gap-1 bg-transparent col-span-2">
                          {passStrength.hasSymbol ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <X className="w-3.5 h-3.5 text-slate-400" />}
                          <span>Special symbols (!@#$%^&*)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white h-[46px] rounded-lg font-bold transition-all text-sm mt-4 shadow-md">
                  Establish Enterprise Shop
                </button>
              </form>
            )}

            {/* Forgot password */}
            {authMode === "forgot" && (
              <form onSubmit={handleForgot} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Forgot Coordinates</h2>
                  <p className="text-sm text-slate-500">Retrieve unique code links for security updates.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Account Email Address</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="px-3.5 w-full h-[46px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    placeholder="e.g. ceo@mobilehub.test"
                  />
                </div>

                <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white h-[46px] rounded-lg font-bold transition-all text-sm shadow">
                  Generate Verification Code
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    Go back to Log In
                  </button>
                </div>
              </form>
            )}

            {/* Reset saving code */}
            {authMode === "reset" && (
              <form onSubmit={handleResetSave} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Configure New Coordinates</h2>
                  <p className="text-sm text-slate-500">Submit security token to establish access passwords.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">6-Digit / Token Hash</label>
                    <input
                      required
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      className="px-3.5 w-full h-[46px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono text-center tracking-widest text-lg h-12"
                      placeholder="e.g. 102948"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">New Password String</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        className="px-3.5 pr-12 w-full h-[46px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                        placeholder="Minimum 8 characters"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-3 text-slate-400 h-5"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={resetFinished} className="w-full bg-slate-900 hover:bg-slate-800 text-white h-[46px] rounded-lg font-bold transition-all text-sm shadow">
                  {resetFinished ? "Coordinates Synced!" : "Synchronize System Passwords"}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className="text-xs font-bold text-emerald-600 hover:underline"
                  >
                    Go back to Log In
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // authenticated shell layout
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex transition-colors duration-200">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-slate-950 dark:bg-slate-50 text-white dark:text-slate-950 px-5 py-3 rounded-lg shadow-2xl text-sm font-semibold border border-slate-700/50 flex items-center gap-3">
          <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping"></span>
          {toastMessage}
        </div>
      )}

      {/* Sidebar navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800/80 flex flex-col justify-between shrink-0 text-slate-300">
        <div>
          {/* Brand header */}
          <div className="p-6 border-b border-slate-800/65 flex items-center gap-3">
            <span className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center font-black text-white text-sm tracking-widest leading-none">
              MH
            </span>
            <div>
              <h3 className="font-extrabold text-sm tracking-tight text-white leading-none capitalize truncate max-w-[130px]" title={business?.name}>
                {business?.name}
              </h3>
              <span className="text-[10px] font-mono text-slate-500/90 tracking-wide mt-1.5 block">
                Mtenant catalog console
              </span>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-bold transition-all ${
                activeTab === "dashboard"
                  ? "bg-slate-800 text-white font-extrabold shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/40"
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              Overview
            </button>

            <button
              onClick={() => setActiveTab("inventory")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-bold transition-all ${
                activeTab === "inventory"
                  ? "bg-slate-800 text-white font-extrabold shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/40"
              }`}
            >
              <Boxes className="w-5 h-5" />
              Stock Asset Grid
            </button>

            <button
              onClick={() => setActiveTab("reports")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-bold transition-all ${
                activeTab === "reports"
                  ? "bg-slate-800 text-white font-extrabold shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/40"
              }`}
            >
              <PieChart className="w-5 h-5 text-emerald-400" />
              Advanced Reports
            </button>

            <button
              onClick={() => setActiveTab("categories")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-bold transition-all ${
                activeTab === "categories"
                  ? "bg-slate-800 text-white font-extrabold shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/40"
              }`}
            >
              <FolderTree className="w-5 h-5" />
              Category Manager
            </button>

            {["CEO", "Admin"].includes(me?.role || "") && (
              <button
                onClick={() => setActiveTab("staff")}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-bold transition-all ${
                  activeTab === "staff"
                    ? "bg-slate-800 text-white font-extrabold shadow-sm"
                    : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                }`}
              >
                <UsersIcon className="w-5 h-5" />
                Staff Credentials
              </button>
            )}

            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-bold transition-all ${
                activeTab === "settings"
                  ? "bg-slate-800 text-white font-extrabold shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/40"
              }`}
            >
              <SettingsIcon className="w-5 h-5" />
              Shop Settings
            </button>
          </nav>
        </div>

        {/* Footer profile log */}
        <div className="p-4 border-t border-slate-800/75 bg-slate-900/40">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-slate-800 border border-slate-700 rounded-full flex items-center justify-center font-bold text-white uppercase sm:text-sm">
              {me?.name.slice(0, 2)}
            </div>
            <div className="truncate max-w-[140px]">
              <h4 className="text-xs font-black text-white leading-none">{me?.name}</h4>
              <span className="text-[10px] uppercase font-bold text-slate-500 block mt-1.5">{me?.role}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-slate-850 hover:bg-red-950/20 hover:text-red-400 border border-slate-800 py-2.5 rounded-lg text-xs font-bold transition-all uppercase tracking-wider"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main viewport */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Topbar navigation panel */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-850 px-8 flex items-center justify-between shadow-sm">
          <div>
            <h2 className="font-extrabold text-lg text-slate-900 dark:text-white capitalize flex items-center gap-2">
              {activeTab} Workspace
            </h2>
          </div>

          <div className="flex items-center gap-4 bg-transparent">
            {/* Quick sync controls */}
            <button
              onClick={() => token && fetchAllData(token)}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-all h-9 flex items-center"
              title="Synchronize records"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Dark Mode toggle checkbox */}
            <button
              onClick={async () => {
                if (!token) return;
                const bodyJson = { ...settings, darkMode: !settings.darkMode };
                try {
                  const res = await fetch("/api/settings", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify(bodyJson)
                  });
                  const d = await res.json();
                  setSettings(d.business.settings);
                  document.body.classList.toggle("dark", !!d.business.settings.darkMode);
                  toast("Theme updated successfully.");
                } catch (e) {
                  toast("Failed updating theme preference.");
                }
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-all h-9 flex items-center"
            >
              {settings.darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Workspace body and page conditions */}
        <div className="p-8 flex-1 overflow-y-auto max-w-[1300px] w-full mx-auto">
          {/* Active alerts warning banner for remaining item assets */}
          {lowStockReport.length > 0 && activeTab === "dashboard" && (
            <div className="mb-6 p-4 bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/35 rounded-xl flex items-center justify-between text-amber-800 dark:text-amber-400">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span className="text-sm font-bold">
                  Attention CEO! {lowStockReport.length} essential items have fallen below configured low stock criteria thresholds.
                </span>
              </div>
              <button
                onClick={() => setActiveTab("reports")}
                className="text-xs font-black uppercase text-amber-600 dark:text-amber-400 hover:underline border border-amber-500/30 px-3 py-1.5 rounded-lg whitespace-nowrap"
              >
                Inspect Low Stock Report
              </button>
            </div>
          )}

          {activeTab === "dashboard" && (
            <div className="space-y-8">
              {/* Feature 3 Dashboard Overview Indicators */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-black uppercase text-slate-500">Categories</span>
                      <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1.5">
                        {overview?.totalCategories || 0}
                      </h3>
                    </div>
                    <span className="p-2 bg-slate-50 dark:bg-slate-850 rounded-lg text-emerald-500">
                      <FolderTree className="w-5 h-5" />
                    </span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-black uppercase text-slate-500">Tracked SKUs</span>
                      <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1.5">
                        {overview?.totalInventoryItems || 0}
                      </h3>
                    </div>
                    <span className="p-2 bg-slate-50 dark:bg-slate-850 rounded-lg text-emerald-500">
                      <Boxes className="w-5 h-5" />
                    </span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-black uppercase text-slate-500">Remaining Units</span>
                      <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1.5">
                        {overview?.totalUnitsInStock || 0}
                      </h3>
                    </div>
                    <span className="p-2 bg-slate-50 dark:bg-slate-850 rounded-lg text-emerald-500">
                      <TrendingUp className="w-5 h-5" />
                    </span>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-black uppercase text-slate-500">Total Asset Value</span>
                      <h3 className="text-3xl font-black text-slate-900 dark:text-white mt-1.5">
                        {fmtMoney(overview?.inventoryCostValue || 0)}
                      </h3>
                    </div>
                    <span className="p-2 bg-slate-50 dark:bg-slate-850 rounded-lg text-emerald-500">
                      <DollarSign className="w-5 h-5" />
                    </span>
                  </div>
                </div>
              </div>

              {/* Grid with visualizers reports */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-transparent">
                {/* Category volume chart */}
                <div className="lg:col-span-8 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-5">
                    Category Stock Allocation
                  </h3>
                  <div className="space-y-4">
                    {summaryReport.slice(0, 7).map((c) => {
                      const maxVal = Math.max(...summaryReport.map(r => r.totalQuantity), 1);
                      const computedPct = Math.max(8, (c.totalQuantity / maxVal) * 100);
                      return (
                        <div key={c.categoryId} className="flex items-center gap-4 bg-transparent text-sm">
                          <span className="w-36 font-semibold truncate text-slate-600 dark:text-slate-300">
                            {c.categoryName}
                          </span>
                          <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                              style={{ width: `${computedPct}%` }}
                            ></div>
                          </div>
                          <span className="w-12 text-right font-mono font-bold text-slate-800 dark:text-slate-100">
                            {c.totalQuantity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Left quick notification lists */}
                <div className="lg:col-span-4 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-5 flex items-center justify-between">
                      System Broadcast Logs
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    </h3>
                    <div className="space-y-3">
                      {notifications.length === 0 ? (
                        <div className="border border-dashed border-slate-200 dark:border-slate-800/80 p-6 rounded-lg text-center text-xs text-slate-400 font-bold">
                          No recent messages.
                        </div>
                      ) : (
                        notifications.slice(0, 4).map((n) => (
                          <div key={n.id} className="p-3 bg-slate-50 dark:bg-slate-850 rounded-lg text-xs leading-relaxed border border-slate-200/30 dark:border-slate-800/20">
                            <p className="font-bold text-slate-800 dark:text-slate-200">{n.message}</p>
                            <span className="text-[10px] text-slate-500/80 font-mono mt-1.5 block">
                              {new Date(n.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setNotifications([]);
                      toast("Broadcasting logs cleared.");
                    }}
                    className="w-full mt-6 py-2 bg-slate-50 border border-slate-200 dark:bg-slate-850 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all uppercase"
                  >
                    Clear Notifications
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "inventory" && (
            <div className="space-y-6">
              {/* Quick totals calculations metrics bar */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm flex flex-col md:flex-row gap-6 md:divide-x md:divide-slate-200/70 dark:md:divide-slate-800/80">
                <div className="flex-1 flex gap-4 items-center sm:px-3 bg-transparent">
                  <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-500 shrink-0">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block leading-none">Overall Assets Cost</span>
                    <h4 className="text-xl font-black text-slate-900 dark:text-white leading-none mt-2">
                      {fmtMoney(inventory.reduce((sum, item) => sum + item.quantity * item.costPrice, 0))}
                    </h4>
                  </div>
                </div>

                <div className="flex-1 flex gap-4 items-center px-4 bg-transparent">
                  <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-500 shrink-0">
                    <PieChart className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block leading-none">Potential Revenue</span>
                    <h4 className="text-xl font-black text-slate-900 dark:text-white leading-none mt-2 font-black text-emerald-500">
                      {fmtMoney(inventory.reduce((sum, item) => sum + item.quantity * item.sellingPrice, 0))}
                    </h4>
                  </div>
                </div>

                <div className="flex-1 flex gap-4 items-center px-4 bg-transparent">
                  <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-500 shrink-0">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block leading-none">Expected Profit Range</span>
                    <h4 className="text-xl font-black text-slate-900 dark:text-white leading-none mt-2 font-black text-teal-500">
                      {fmtMoney(inventory.reduce((sum, item) => sum + (item.quantity * item.sellingPrice - item.quantity * item.costPrice), 0))}
                    </h4>
                  </div>
                </div>
              </div>

              {/* Utility action toolbar */}
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="flex gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder="Search stock by name, SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3.5 w-[240px] h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                  />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-3 w-[180px] h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                  >
                    <option value="">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 w-full sm:w-auto justify-end bg-transparent">
                  {me?.role !== "Staff" && (
                    <button
                      onClick={() => {
                        setEditingItem(null);
                        setItemForm({
                          name: "",
                          categoryId: categories[0]?.id || "",
                          type: "",
                          quantity: 0,
                          soldQuantity: 0,
                          costPrice: 0,
                          sellingPrice: 0,
                          location: "Main store",
                          barcode: "",
                        });
                        setIsAddingItem(true);
                      }}
                      className="bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white h-[44px] px-5 rounded-lg font-bold text-sm shadow flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Stock Asset
                    </button>
                  )}

                  <button
                    onClick={exportCsv}
                    className="border border-slate-350 dark:border-slate-800 dark:text-slate-300 text-slate-700 h-[44px] px-5 rounded-lg font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-900 transition-all flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Grid content and items Table */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-850/50 text-slate-500 uppercase font-bold text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-850">
                        <th className="p-4 pl-6">Catalog Product</th>
                        <th className="p-4">SKU / Barcode</th>
                        <th className="p-4">Category</th>
                        <th className="p-4 text-center">In Stock</th>
                        <th className="p-4 text-center">Unit Cost</th>
                        <th className="p-4 text-center">Unit Price</th>
                        <th className="p-4 text-center">Gross Asset Cost</th>
                        <th className="p-4 text-center">Location</th>
                        {me?.role !== "Staff" && <th className="p-4 pr-6 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850 text-sm">
                      {inventory.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-12 text-center text-slate-400 font-bold">
                            No catalog items found in database queries.
                          </td>
                        </tr>
                      ) : (
                        inventory.map((item) => {
                          const catName = categories.find(c => c.id === item.categoryId)?.name || "Uncategorized";
                          const isLowStock = item.quantity <= (settings.lowStockThreshold || 8);
                          return (
                            <tr key={item.id} className={`transition-all ${
                              isLowStock
                                ? "low-stock-row bg-red-100/10 dark:bg-red-950/20 hover:bg-red-150/20"
                                : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20"
                            }`}>
                              <td className="p-4 pl-6">
                                <span className="font-extrabold text-slate-900 dark:text-white truncate max-w-[200px] block">
                                  {item.name}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-400 mt-1 block">
                                  Type: {item.type || "Accessory"}
                                </span>
                              </td>
                              <td className="p-4 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                <div>Sku: {item.sku}</div>
                                <div className="mt-0.5">Barcode: {item.barcode}</div>
                              </td>
                              <td className="p-4">
                                <span className="px-2.5 py-1 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded font-bold uppercase tracking-wider">
                                  {catName}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-black uppercase font-mono ${
                                  isLowStock ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                                }`}>
                                  {item.quantity} units {isLowStock ? "(LOW)" : ""}
                                </span>
                              </td>
                              <td className="p-4 text-center font-mono font-medium text-slate-600 dark:text-slate-300">
                                {fmtMoney(item.costPrice)}
                              </td>
                              <td className="p-4 text-center font-mono font-bold text-slate-900 dark:text-white">
                                {fmtMoney(item.sellingPrice)}
                              </td>
                              <td className="p-4 text-center font-mono font-extrabold text-slate-900 dark:text-white">
                                {fmtMoney(item.quantity * item.costPrice)}
                              </td>
                              <td className="p-4 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
                                {item.location || "Main counter"}
                              </td>
                              {me?.role !== "Staff" && (
                                <td className="p-4 pr-6 text-right">
                                  <div className="relative inline-flex gap-1 justify-end bg-transparent">
                                    <button
                                      onClick={() => {
                                        setEditingItem(item);
                                        setItemForm({
                                          name: item.name,
                                          categoryId: item.categoryId,
                                          type: item.type,
                                          quantity: item.quantity,
                                          soldQuantity: item.soldQuantity,
                                          costPrice: item.costPrice,
                                          sellingPrice: item.sellingPrice,
                                          location: item.location,
                                          barcode: item.barcode,
                                        });
                                        setIsAddingItem(true);
                                      }}
                                      className="p-1.5 text-slate-500 hover:text-emerald-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg shrink-0"
                                      title="Edit attributes"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(item.id)}
                                      className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg shrink-0"
                                      title="Delete permanent"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === "reports" && (
            <div className="space-y-8 bg-transparent">
              {/* Feature 2: Stock Split values card summaries */}
              {stockSplit && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                    <span className="text-xs font-black uppercase text-slate-400">Total Asset Initial Cost</span>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1.5">
                      {fmtMoney(stockSplit.totalInventoryCost)}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Aggregate cost value of all stocked items (both remaining and sold): <br />
                      Remaining Cost: {fmtMoney(stockSplit.currentStockCost)} + <br />
                      Sold Cost Basis: {fmtMoney(stockSplit.soldStockCost)}
                    </p>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                    <span className="text-xs font-black uppercase text-slate-400">Remaining Retail Selling Value</span>
                    <h3 className="text-2xl font-black text-emerald-500 mt-1.5">
                      {fmtMoney(stockSplit.currentStockRetailValue)}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Retail worth or potential proceeds for active stock currently present back in shelving.
                    </p>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                    <span className="text-xs font-black uppercase text-slate-400">Archived Sales Genuines</span>
                    <h3 className="text-2xl font-black text-teal-500 mt-1.5">
                      {fmtMoney(stockSplit.soldRetailValue)}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Total retail volume revenue retrieved from sold stock units.
                    </p>
                  </div>
                </div>
              )}

              {/* Feature 1 Category Summary Reports Table */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest mb-4">
                  Category Financial Summary (FEATURE 1)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px] text-sm md:text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-850/50 font-bold uppercase tracking-wider text-[11px] text-slate-500 border-b border-rose border-slate-200 dark:border-slate-850">
                        <th className="p-3 pl-4">Category Name</th>
                        <th className="p-3 text-center">Type Group</th>
                        <th className="p-3 text-center">Distinct SKUs</th>
                        <th className="p-3 text-center">In Stock Units</th>
                        <th className="p-3 text-center">Units Sold</th>
                        <th className="p-3 text-center">Stock Asset Cost</th>
                        <th className="p-3 text-center">Sales Proceeds</th>
                        <th className="p-3 text-center">Remaining Retail Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                      {summaryReport.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                            No reporting categories metrics calculated yet.
                          </td>
                        </tr>
                      ) : (
                        summaryReport.map((rep) => (
                          <tr key={rep.categoryId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                            <td className="p-3 pl-4 font-extrabold text-slate-900 dark:text-white">
                              {rep.categoryName}
                            </td>
                            <td className="p-3 text-center">
                              <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded">
                                {rep.categoryGroup || "General"}
                              </span>
                            </td>
                            <td className="p-3 text-center font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {rep.itemCount}
                            </td>
                            <td className="p-3 text-center font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {rep.totalQuantity}
                            </td>
                            <td className="p-3 text-center font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {rep.totalSoldQuantity}
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-slate-600 dark:text-slate-300">
                              {fmtMoney(rep.inventoryCostValue)}
                            </td>
                            <td className="p-3 text-center font-mono font-extrabold text-emerald-600 dark:text-brand-accent">
                              {fmtMoney(rep.soldValue)}
                            </td>
                            <td className="p-3 text-center font-mono font-bold text-slate-800 dark:text-slate-100">
                              {fmtMoney(rep.remainingStockValue)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Feature 4 Low Stock Alerts Reports */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest mb-4 text-amber-500">
                  Low Stock Exceptions Audit (FEATURE 4)
                </h3>
                {lowStockReport.length === 0 ? (
                  <div className="p-12 text-center border border-dashed border-slate-200 dark:border-slate-850 rounded-lg text-slate-400 font-bold text-sm">
                    No items in business records have breached current stock threshold criteria. System is stable.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-850/50 uppercase tracking-wider text-[11px] font-bold text-slate-500 border-b border-slate-205 dark:border-slate-850">
                          <th className="p-3 pl-4">Product Name</th>
                          <th className="p-3">SKU Code</th>
                          <th className="p-3 text-center">Category Group</th>
                          <th className="p-3 text-center">Low Quantity Units</th>
                          <th className="p-3 text-center font-medium">Safe Reorder Standard</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-850">
                        {lowStockReport.map((i) => (
                          <tr key={i.id} className="hover:bg-slate-50/50">
                            <td className="p-3 pl-4 font-extrabold text-slate-900 dark:text-white">
                              {i.name}
                            </td>
                            <td className="p-3 text-slate-500 text-xs font-mono">{i.sku}</td>
                            <td className="p-3 text-center">
                              <span className="px-2.5 py-0.5 text-xs bg-amber-50 text-amber-600 rounded">
                                {categories.find(c => c.id === i.categoryId)?.name || "Accessories"}
                              </span>
                            </td>
                            <td className="p-3 text-center font-black text-red-600 dark:text-red-400">
                              {i.quantity} units left
                            </td>
                            <td className="p-3 text-center font-semibold text-slate-400">
                              Low Stock threshold configured: {settings.lowStockThreshold || 8}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "categories" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-transparent">
              {/* Category CRUD List */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest mb-5">
                  Category Catalogue
                </h3>
                <div className="space-y-3">
                  {categories.map((cat) => (
                    <div key={cat.id} className="p-4 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-250/30 dark:border-slate-800/20 flex justify-between items-center text-sm md:text-sm">
                      <div>
                        <h4 className="font-extrabold text-slate-900 dark:text-white">{cat.name}</h4>
                        <span className="text-[11px] font-bold uppercase text-slate-400 mt-1 block">
                          Group: {cat.group || "General"}
                        </span>
                      </div>
                      <div className="flex gap-1 justify-end bg-transparent shrink-0">
                        <button
                          onClick={() => {
                            setEditingCategory(cat);
                            setNewCatName(cat.name);
                            setNewCatGroup(cat.group);
                          }}
                          className="p-1.5 text-slate-500 hover:text-emerald-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg shrink-0"
                          title="Modify attributes"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-lg shrink-0"
                          title="Delete category"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Create/Update Form */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm h-fit">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest mb-5 border-b pb-3 border-slate-100 dark:border-slate-800">
                  {editingCategory ? "Update Category" : "Configure Category"}
                </h3>
                <form onSubmit={handleSaveCategory} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Category Name</label>
                    <input
                      type="text"
                      required
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="e.g. Type-C Adapter Converters"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Section Group Parent</label>
                    <input
                      type="text"
                      required
                      value={newCatGroup}
                      onChange={(e) => setNewCatGroup(e.target.value)}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="e.g. Accessories / Power"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white h-[44px] rounded-lg font-bold text-sm shadow">
                      {editingCategory ? "Synchronize" : "Finalize Category"}
                    </button>
                    {editingCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(null);
                          setNewCatName("");
                          setNewCatGroup("");
                        }}
                        className="px-4 border border-slate-250 dark:border-slate-800 rounded-lg text-sm text-slate-500 h-[44px]"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeTab === "staff" && ["CEO", "Admin"].includes(me?.role || "") && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-transparent">
              {/* Existing staff panel */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest mb-5">
                  Business Operational Users
                </h3>
                <div className="space-y-3">
                  {usersList.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 font-bold">No active users logged.</div>
                  ) : (
                    usersList.map((usr) => (
                      <div key={usr.id} className="p-4 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200/50 dark:border-slate-800/35 flex justify-between items-center text-sm">
                        <div className="truncate max-w-[240px]">
                          <h4 className="font-extrabold text-slate-900 dark:text-white-80">{usr.name}</h4>
                          <span className="text-[11px] font-semibold text-slate-400 mt-1 block tracking-tight">
                            {usr.email}
                          </span>
                        </div>
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 font-extrabold text-xs uppercase tracking-wider rounded-lg shrink-0">
                          {usr.role}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add staff panel inputs */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm h-fit">
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest mb-5 border-b pb-3 border-slate-105 dark:border-slate-800">
                  Configure Operational Credentials
                </h3>
                <form onSubmit={handleCreateStaff} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Employee Name</label>
                    <input
                      type="text"
                      required
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="e.g. Musa Manager"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Secure Active Email</label>
                    <input
                      type="email"
                      required
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="e.g. manager@mobilehub.test"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Authorization Clearance Role</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className="px-3 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    >
                      <option value="Staff">Staff (Read Access Only)</option>
                      <option value="Manager">Manager (Edit Privileges & Alerts)</option>
                      <option value="Admin">Admin (Executive Credentials)</option>
                      <option value="CEO">CEO (Primary Business Owner)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Temporary Password</label>
                    <input
                      type="password"
                      required
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="Must contain 8+ characters"
                    />
                  </div>

                  <button type="submit" className="w-full bg-slate-950 dark:bg-slate-50 dark:text-slate-950 text-white h-[44px] rounded-lg font-bold text-sm shadow">
                    Authorize Clearance Credentials
                  </button>
                </form>
              </div>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200/50 dark:border-slate-850 shadow-sm max-w-2xl">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest mb-6 border-b pb-3 border-slate-105 dark:border-slate-800">
                Tenant Control Configuration
              </h3>
              <form onSubmit={handleSaveSettings} className="space-y-6 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-transparent">
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500 block">Low Stock Alert Criteria</label>
                    <input
                      type="number"
                      required
                      value={settings.lowStockThreshold}
                      onChange={(e) => setSettings({ ...settings, lowStockThreshold: Number(e.target.value) })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="e.g. 5"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-450 block">International Currency Mode</label>
                    <select
                      value={settings.currency}
                      onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                      className="px-3 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="GHS">GHS (₵)</option>
                      <option value="NGN">NGN (₦)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="ZAR">ZAR (R)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-4 border-t pt-5 border-slate-105 dark:border-slate-800 bg-transparent">
                  <div className="flex items-center justify-between bg-transparent">
                    <div>
                      <h4 className="font-extrabold text-slate-900 dark:text-white">CEO Notifications</h4>
                      <p className="text-xs text-slate-500">Enable stock modification reports forwarded directly to executive.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.notifyCeoOnManagerStock}
                      onChange={(e) => setSettings({ ...settings, notifyCeoOnManagerStock: e.target.checked })}
                      className="w-5 h-5 accent-emerald-500 shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between bg-transparent">
                    <div>
                      <h4 className="font-extrabold text-slate-900 dark:text-white">Forward Email Recurrence</h4>
                      <p className="text-xs text-slate-500">Dispatch alerts through email queues.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.emailNotifications}
                      onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })}
                      className="w-5 h-5 accent-emerald-500 shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between bg-transparent">
                    <div>
                      <h4 className="font-extrabold text-slate-900 dark:text-white">Night Vision Color Scheme</h4>
                      <p className="text-xs text-slate-500">Operate darker interface presets safety indexing.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.darkMode}
                      onChange={(e) => {
                        setSettings({ ...settings, darkMode: e.target.checked });
                        document.body.classList.toggle("dark", e.target.checked);
                      }}
                      className="w-5 h-5 accent-emerald-500 shrink-0"
                    />
                  </div>
                </div>

                <div className="space-y-4 border-t pt-5 border-slate-100 dark:border-slate-800 bg-transparent">
                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500">Destination Billing Email Address</label>
                    <input
                      type="email"
                      value={settings.accountingEmail}
                      onChange={(e) => setSettings({ ...settings, accountingEmail: e.target.value })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="finance@owner.test"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500">SMS Security Contacts Carrier Number</label>
                    <input
                      type="text"
                      value={settings.smsPhone}
                      onChange={(e) => setSettings({ ...settings, smsPhone: e.target.value })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="+2335432..."
                    />
                  </div>
                </div>

                <button type="submit" className="w-[180px] bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white h-[44px] rounded-lg font-bold text-sm shadow">
                  Commit Records
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Adding / Editing Modal dialog frame */}
      <AnimatePresence>
        {isAddingItem && (
          <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800/85 p-6 md:p-8 shadow-2xl relative"
            >
              <h3 className="text-base font-black uppercase tracking-widest text-slate-900 dark:text-white mb-6 border-b pb-3 border-slate-100 dark:border-slate-800">
                {editingItem ? "Update Stock Asset Metrics" : "Register New Stock Asset"}
              </h3>

              <form onSubmit={handleSaveItem} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-transparent text-sm">
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Product Line Name</label>
                    <input
                      type="text"
                      required
                      value={itemForm.name}
                      onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="e.g. Samsung fast battery model"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Section Category</label>
                    <select
                      value={itemForm.categoryId}
                      onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
                      className="px-3 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Subtype / Brand</label>
                    <input
                      type="text"
                      value={itemForm.type}
                      onChange={(e) => setItemForm({ ...itemForm, type: e.target.value })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="e.g. Replacement battery"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Quantity Units In Stock</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={itemForm.quantity}
                      onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value) })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Pre-sold Quantity Units</label>
                    <input
                      type="number"
                      min="0"
                      value={itemForm.soldQuantity}
                      onChange={(e) => setItemForm({ ...itemForm, soldQuantity: Number(e.target.value) })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Unit Cost Price</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={itemForm.costPrice}
                      onChange={(e) => setItemForm({ ...itemForm, costPrice: Number(e.target.value) })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Unit Retail Selling Price</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={itemForm.sellingPrice}
                      onChange={(e) => setItemForm({ ...itemForm, sellingPrice: Number(e.target.value) })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Shelving Storage Location</label>
                    <input
                      type="text"
                      value={itemForm.location}
                      onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="e.g. Glass Shelf B2 / Warehouse"
                    />
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-400">Asset Barcode Identifiers</label>
                    <input
                      type="text"
                      value={itemForm.barcode}
                      onChange={(e) => setItemForm({ ...itemForm, barcode: e.target.value })}
                      className="px-3.5 w-full h-[44px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                      placeholder="Leave blank to dynamically autogenerate"
                    />
                  </div>
                </div>

                <div className="flex gap-3 justify-end mt-6 border-t pt-4 border-slate-100 dark:border-slate-800 bg-transparent">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingItem(false);
                      setEditingItem(null);
                    }}
                    className="px-5 border border-slate-250 dark:border-slate-800 rounded-lg text-sm text-slate-500 h-[44px]"
                  >
                    Discard Changes
                  </button>
                  <button type="submit" className="px-6 bg-slate-905 bg-slate-900 dark:bg-slate-100 dark:text-slate-900 text-white rounded-lg font-bold text-sm shadow h-[44px]">
                    Commit Records
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
