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
  /**
   * Required modules can never be hidden — the settings UI renders them
   * without a checkbox, and `updateEnabledPages` forces them back to `true`
   * even if a client sends `false` for one. Reserve this for modules a shop
   * can't operate Phase-1 without (see `PHASE1_REQUIREMENTS.md`): org
   * context, the catalog to sell from, the branch orders are scoped to,
   * the sales-order lifecycle itself, staff/driver management, and stock
   * visibility.
   */
  required: boolean;
}

export const SIDEBAR_MODULE_CATALOG: SidebarModuleDefinition[] = [
  {
    key: "organizations",
    label: "Organizations",
    description: "Switch between or create organizations you belong to.",
    defaultEnabled: true,
    required: true,
  },
  {
    key: "products",
    label: "Products",
    description: "Manage product records, variants, and pricing for the active organization.",
    defaultEnabled: true,
    required: true,
  },
  {
    key: "categories",
    label: "Categories",
    description: "Maintain the product category tree used for browsing and organization.",
    defaultEnabled: true,
    required: false,
  },
  {
    key: "brands",
    label: "Brands",
    description: "Manage brand records attached to products.",
    defaultEnabled: true,
    required: false,
  },
  {
    key: "units",
    label: "Units",
    description: "Manage measurement units (piece, kg, litre, etc.) used by product variants.",
    defaultEnabled: true,
    required: false,
  },
  {
    key: "suppliers",
    label: "Suppliers",
    description: "Manage supplier/vendor records used on purchase receipts.",
    defaultEnabled: true,
    required: false,
  },
  {
    key: "customers",
    label: "Customers",
    description: "Manage customer records used on sales orders.",
    defaultEnabled: true,
    required: false,
  },
  {
    key: "inventory",
    label: "Inventory",
    description:
      "Stock balances, movement ledger, and manual stock adjustments. Covers both Inventory Balances and Inventory Ledger sidebar links.",
    defaultEnabled: true,
    required: true,
  },
  {
    key: "purchases",
    label: "Purchases",
    description: "Create and post purchase receipts that bring stock into a branch.",
    defaultEnabled: true,
    required: false,
  },
  {
    key: "salesOrders",
    label: "Sales Orders",
    description: "Manage walk-in/phone/whatsapp/app orders through confirm, reject, cancel, and deliver.",
    defaultEnabled: true,
    required: true,
  },
  {
    key: "stockTransfers",
    label: "Stock Transfers",
    description: "Move stock between branches with a draft/approve workflow.",
    defaultEnabled: true,
    required: false,
  },
  {
    key: "branches",
    label: "Branches",
    description: "Manage store, warehouse, and dark-store branch locations.",
    defaultEnabled: true,
    required: true,
  },
  {
    key: "masterCatalog",
    label: "Master Catalog",
    description: "Platform-wide catalog templates and import tools (super admin only).",
    defaultEnabled: true,
    required: false,
  },
  {
    key: "auditLogs",
    label: "Audit Logs",
    description: "Review organization-level audit trail of who changed what (super admin only).",
    defaultEnabled: true,
    required: false,
  },
  {
    key: "users",
    label: "Users",
    description: "Invite and manage organization users and their roles.",
    defaultEnabled: true,
    required: true,
  },
  {
    key: "taxRates",
    label: "Tax Rates",
    description:
      "Manage tax rate records. Backend API exists but there is currently no frontend page for this module, so enabling it here has no visible effect yet.",
    defaultEnabled: false,
    required: false,
  },
];

export const REQUIRED_MODULE_KEYS = SIDEBAR_MODULE_CATALOG.filter((module) => module.required).map(
  (module) => module.key,
);

export const DEFAULT_ENABLED_PAGES: Record<string, boolean> = Object.fromEntries(
  SIDEBAR_MODULE_CATALOG.map((module) => [module.key, module.defaultEnabled]),
);

export const SIDEBAR_MODULE_KEYS = SIDEBAR_MODULE_CATALOG.map((module) => module.key);
