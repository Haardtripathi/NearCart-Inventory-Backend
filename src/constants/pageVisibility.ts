/**
 * Catalog of sidebar modules that can be toggled on/off per organization via
 * Settings > Sidebar pages. Keys correspond to the `id` of a navigation
 * section item in the frontend's `AppShell.tsx` (`navigationSections`), NOT
 * to backend module directory names — a couple of backend modules don't map
 * 1:1 to a sidebar entry (see `notes` on a few entries below).
 *
 * `defaultEnabled` reflects the Solid/Partial/Stub audit performed 2026-07-23
 * (see agent report): everything classified Solid defaults to visible,
 * anything Partial/Stub defaults to hidden until it's fixed. Dashboard and
 * Settings are intentionally NOT included here — they are always visible
 * (Settings is where this toggle lives; hiding it would lock an org out of
 * re-enabling anything, and Dashboard is the landing page after login).
 */
export interface SidebarModuleDefinition {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export const SIDEBAR_MODULE_CATALOG: SidebarModuleDefinition[] = [
  {
    key: "organizations",
    label: "Organizations",
    description: "Switch between or create organizations you belong to.",
    defaultEnabled: true,
  },
  {
    key: "products",
    label: "Products",
    description: "Manage product records, variants, and pricing for the active organization.",
    defaultEnabled: true,
  },
  {
    key: "categories",
    label: "Categories",
    description: "Maintain the product category tree used for browsing and organization.",
    defaultEnabled: true,
  },
  {
    key: "brands",
    label: "Brands",
    description: "Manage brand records attached to products.",
    defaultEnabled: true,
  },
  {
    key: "units",
    label: "Units",
    description: "Manage measurement units (piece, kg, litre, etc.) used by product variants.",
    defaultEnabled: true,
  },
  {
    key: "suppliers",
    label: "Suppliers",
    description: "Manage supplier/vendor records used on purchase receipts.",
    defaultEnabled: true,
  },
  {
    key: "customers",
    label: "Customers",
    description: "Manage customer records used on sales orders.",
    defaultEnabled: true,
  },
  {
    key: "inventory",
    label: "Inventory",
    description:
      "Stock balances, movement ledger, and manual stock adjustments. Covers both Inventory Balances and Inventory Ledger sidebar links.",
    defaultEnabled: true,
  },
  {
    key: "purchases",
    label: "Purchases",
    description: "Create and post purchase receipts that bring stock into a branch.",
    defaultEnabled: true,
  },
  {
    key: "salesOrders",
    label: "Sales Orders",
    description: "Manage walk-in/phone/whatsapp/app orders through confirm, reject, cancel, and deliver.",
    defaultEnabled: true,
  },
  {
    key: "stockTransfers",
    label: "Stock Transfers",
    description: "Move stock between branches with a draft/approve workflow.",
    defaultEnabled: true,
  },
  {
    key: "branches",
    label: "Branches",
    description: "Manage store, warehouse, and dark-store branch locations.",
    defaultEnabled: true,
  },
  {
    key: "masterCatalog",
    label: "Master Catalog",
    description: "Platform-wide catalog templates and import tools (super admin only).",
    defaultEnabled: true,
  },
  {
    key: "auditLogs",
    label: "Audit Logs",
    description: "Review organization-level audit trail of who changed what (super admin only).",
    defaultEnabled: true,
  },
  {
    key: "users",
    label: "Users",
    description: "Invite and manage organization users and their roles.",
    defaultEnabled: true,
  },
  {
    key: "taxRates",
    label: "Tax Rates",
    description:
      "Manage tax rate records. Backend API exists but there is currently no frontend page for this module, so enabling it here has no visible effect yet.",
    defaultEnabled: false,
  },
];

export const DEFAULT_ENABLED_PAGES: Record<string, boolean> = Object.fromEntries(
  SIDEBAR_MODULE_CATALOG.map((module) => [module.key, module.defaultEnabled]),
);

export const SIDEBAR_MODULE_KEYS = SIDEBAR_MODULE_CATALOG.map((module) => module.key);
