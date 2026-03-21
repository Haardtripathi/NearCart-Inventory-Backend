# NearCart Inventory Backend

Production-oriented TypeScript backend for a multi-tenant, multi-branch inventory platform with Prisma, PostgreSQL, JWT auth, RBAC, audit logs, stock ledgering, purchases, sales orders, stock transfers, multilingual-ready catalog data, and a platform-level master catalog.

## Stack

- Node.js
- TypeScript
- Express
- Prisma
- PostgreSQL
- Zod
- JWT

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env values and update secrets/database URL:

```bash
cp .env.example .env
```

3. Run Prisma migrate and generate the client:

```bash
npm run prisma:migrate
```

4. Seed system units, translated industries, and master catalog data:

```bash
npm run prisma:seed
```

5. Start the API in development:

```bash
npm run dev
```

## Environment

Required values:

```env
DATABASE_URL=
PORT=5000
NODE_ENV=development
JWT_SECRET=
JWT_EXPIRES_IN=7d
ADMIN_BOOTSTRAP_SECRET=
CORS_ORIGIN=http://localhost:5173
REDIS_URL=redis://localhost:6379
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
REDIS_KEY_PREFIX=nearcart
LIBRETRANSLATE_ENDPOINT=https://libretranslate.com
LIBRETRANSLATE_API_KEY=
AUTO_TRANSLATE_ON_WRITE=false
AUTO_TRANSLATE_FAIL_OPEN=true
TRANSLATION_CACHE_TTL_SECONDS=2592000
```

Notes:

- `AUTO_TRANSLATE_ON_WRITE=true` will auto-generate missing translations for newly created entities and persist them.
- Redis is optional but recommended for rate-limit consistency and translation cache.
- Redis connection priority is `REDIS_URL` first, then Upstash REST (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`).
- For self-hosted Redis in the future, set `REDIS_URL` and leave Upstash REST values empty.

## Bootstrap Super Admin

Create the first `SUPER_ADMIN` user once after migrations and seed:

```bash
curl -X POST http://localhost:5000/api/auth/bootstrap-super-admin \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "your-admin-bootstrap-secret",
    "fullName": "Platform Admin",
    "email": "admin@example.com",
    "password": "StrongPassword123"
  }'
```

## Local Test Order

Recommended first API call order:

1. `POST /api/auth/bootstrap-super-admin`
2. `POST /api/auth/login`
3. `GET /api/auth/me`
4. `GET /api/meta/languages`
5. `GET /api/platform/industries?lang=gu`
6. `GET /api/master-catalog/items?industryId=<industryId>&lang=hi&q=milk`
7. `POST /api/master-catalog/items/:id/import`
8. `GET /api/products?lang=gu`
9. `GET /api/platform/industries`
10. `POST /api/organizations`
11. Login again with the new organization selected if needed, or send `x-organization-id`
12. Create categories, brands, units, tax rates, suppliers, customers, and products
13. Create a purchase receipt and `POST /api/purchases/:id/post`
14. Create a sales order and confirm it
15. Create and approve a stock transfer

## Localization

Supported languages:

- `EN`
- `HI`
- `GU`

Localized endpoints accept either:

- `?lang=en|hi|gu`
- `Accept-Language: en|hi|gu`

Language resolution order:

1. Query param `lang`
2. `Accept-Language` header
3. Authenticated user `preferredLanguage`
4. Active organization `defaultLanguage`
5. `EN`

Localized responses keep canonical fields and add display fields, for example:

```json
{
  "name": "Milk",
  "displayName": "दूध",
  "description": "Fresh pouch milk for daily retail sales.",
  "displayDescription": "Fresh pouch milk for daily retail sales.",
  "resolvedLanguage": "HI"
}
```

## Master Catalog

The backend now includes a platform-level master catalog inside the same repo.

- `SUPER_ADMIN` can manage translated master categories and master items.
- Authenticated tenant users can browse the catalog.
- `ORG_ADMIN` and `MANAGER` can import a master item into their own product catalog.
- Imported products are created as normal tenant products with `sourceType=MASTER_TEMPLATE`, copied translations, copied variants, and editable org-owned records.

Import behavior highlights:

- Duplicate imports return the existing linked product unless `allowDuplicate=true`.
- Industry mismatches fail by default and can be overridden with `forceImport=true`.
- Missing category mappings can be auto-created from master category data.
- Unit, brand, and tax references are reused where possible.
- Import actions and master catalog admin writes generate audit logs.

## Seed Data

The seed now creates:

- translated platform industries for Grocery, Pharmacy, Fashion, Electronics, Hardware, and Restaurant
- 4 to 6 translated master categories per industry
- 8 to 12 translated master items per industry
- aliases for search, variant templates where relevant, and normalized `searchText` values for catalog search

This gives the frontend enough realistic demo data to test localized browsing and master-item imports right away.

## API Overview

Base path: `/api`

- `GET /api/health`
- `POST /api/auth/bootstrap-super-admin`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/meta/languages`
- `GET /api/meta/localization-context`
- `GET|POST|PATCH /api/platform/industries`
- `POST /api/organizations`
- `GET /api/organizations/my`
- `GET /api/organizations/:id`
- `GET|POST|PATCH|DELETE /api/branches`
- `GET /api/categories/tree`
- `GET|POST|PATCH|DELETE /api/categories`
- `GET|POST|PATCH|DELETE /api/brands`
- `GET|POST /api/units`
- `GET|POST|PATCH /api/tax-rates`
- `GET|POST|PATCH|DELETE /api/suppliers`
- `GET|POST|PATCH|DELETE /api/customers`
- `GET|POST|PATCH|DELETE /api/products`
- `GET|POST|PATCH|DELETE /api/products/:id/variants`
- `GET /api/master-catalog/categories`
- `GET /api/master-catalog/categories/tree`
- `POST|PATCH /api/master-catalog/categories`
- `GET /api/master-catalog/items`
- `GET /api/master-catalog/items/:id`
- `POST|PATCH /api/master-catalog/items`
- `POST /api/master-catalog/items/:id/import`
- `POST /api/master-catalog/items/import-many`
- `GET /api/master-catalog/industries/:industryId/featured-items`
- `GET /api/inventory/balances`
- `GET /api/inventory/ledger`
- `POST /api/inventory/adjustments`
- `GET|POST|PATCH /api/purchases`
- `POST /api/purchases/:id/post`
- `GET|POST|PATCH /api/sales-orders`
- `POST /api/sales-orders/:id/confirm`
- `POST /api/sales-orders/:id/reject`
- `POST /api/sales-orders/:id/cancel`
- `POST /api/sales-orders/:id/deliver`
- `GET|POST|PATCH /api/stock-transfers`
- `POST /api/stock-transfers/:id/approve`
- `POST /api/stock-transfers/:id/cancel`
- `GET /api/audit-logs`

## Notes

- All org-scoped routes use the authenticated `activeOrganizationId`, with optional override through `x-organization-id`.
- Localized read endpoints add `displayName`, `displayDescription`, `resolvedLanguage`, and translation arrays without removing canonical fields.
- Master catalog search uses denormalized `searchText` built from canonical names, localized names, aliases, code, and slug.
- Stock mutations are posted through a shared inventory transaction service and always write immutable ledger rows.
- Purchase posting, sales confirmation, stock adjustments, and transfer approval run inside Prisma transactions.
- Soft delete is used for branches, categories, brands, suppliers, customers, and products.
