# NearCart Inventory Backend

Production-oriented TypeScript backend for a multi-tenant, multi-branch inventory platform with Prisma, PostgreSQL, JWT auth, RBAC, audit logs, stock ledgering, purchases, sales orders, and stock transfers.

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

4. Seed system units and master industries:

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
```

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
4. `GET /api/platform/industries`
5. `POST /api/organizations`
6. Login again with the new organization selected if needed, or send `x-organization-id`
7. Create categories, brands, units, tax rates, suppliers, customers, and products
8. Create a purchase receipt and `POST /api/purchases/:id/post`
9. Create a sales order and confirm it
10. Create and approve a stock transfer

## API Overview

Base path: `/api`

- `GET /api/health`
- `POST /api/auth/bootstrap-super-admin`
- `POST /api/auth/login`
- `GET /api/auth/me`
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
- Stock mutations are posted through a shared inventory transaction service and always write immutable ledger rows.
- Purchase posting, sales confirmation, stock adjustments, and transfer approval run inside Prisma transactions.
- Soft delete is used for branches, categories, brands, suppliers, customers, and products.
