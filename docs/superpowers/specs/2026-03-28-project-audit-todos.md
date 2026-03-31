# Caramel Website — Project Audit & TODOs

> Phases 1–3 complete. This document is the living priority queue for all remaining work.
> Pick up the next unchecked item at the top of the lowest-numbered active phase.

---

## Phase 4: Admin API

*Unblocks all admin management. Admin-api currently returns 401 for all `/api/*` routes.*

- [x] **4.1** JWT auth middleware + `POST /api/auth/login`
- [x] **4.2** Admin user seeding script (`scripts/setup-admin-user.ts`)
- [x] **4.3** Products CRUD (`GET/POST /api/products`, `GET/PUT/DELETE /api/products/:id`)
- [ ] **4.4** Collections CRUD (`GET/POST /api/collections`, `GET/PUT/DELETE /api/collections/:id`)
- [ ] **4.5** Orders management (`GET /api/orders`, `PUT /api/orders/:id/status`, `POST /api/orders/:id/refund`)
- [ ] **4.6** Customers view + export (`GET /api/customers`, `GET /api/customers/:id`)
- [ ] **4.7** Content management (`GET/PUT /api/content/:key`, `POST /api/content/:key/publish`)
- [ ] **4.8** Settings endpoint (`GET/PUT /api/settings`)
- [ ] **4.9** Admin API test coverage (currently 1 health test — needs full suite)

**Key files:** `workers/admin-api/src/index.ts`, `packages/db/src/queries/admin-users.ts`, `packages/db/src/queries/products.ts`, `packages/db/src/queries/orders.ts`

---

## Phase 5: Storefront UI

*Customer-facing React+Vite app. Currently an empty shell.*

- [ ] **5.1** API client layer (`src/lib/api.ts` — typed fetch wrappers for all storefront-api endpoints)
- [ ] **5.2** Product listing page (`/products`) with grid layout
- [ ] **5.3** Collection page (`/collections/:slug`) with filtered product grid
- [ ] **5.4** Product detail page (`/products/:slug`) with variant selector + add to cart
- [ ] **5.5** Cart drawer / cart page — live KV-backed cart via session cookie
- [ ] **5.6** Checkout form (multi-step: shipping → payment → review)
- [ ] **5.7** Stripe Elements integration (client-side payment UI)
- [ ] **5.8** Order confirmation page (`/orders/:id`)
- [ ] **5.9** Search + filter UI (client-side filter over product list, no new endpoint needed)
- [ ] **5.10** SEO meta tags + Open Graph (per product/collection)

**Key files:** `apps/storefront/src/App.tsx`, `apps/storefront/src/styles/globals.css`, `brand.config.ts`

---

## Phase 6: Admin UI

*React admin panel. Currently an empty shell.*

- [ ] **6.1** API client layer (`src/lib/api.ts` — typed fetch wrappers for all admin-api endpoints)
- [ ] **6.2** Auth flow — login page, JWT storage, protected route wrapper
- [ ] **6.3** Dashboard home — order count, revenue summary, recent orders
- [ ] **6.4** Products management — list, create, edit, publish/archive, image upload
- [ ] **6.5** Collections management — list, create, edit, reorder
- [ ] **6.6** Orders management — list with status filter, detail view, fulfill + refund actions
- [ ] **6.7** Customers view — list, detail, order history
- [ ] **6.8** Content editor — block-based page editor with draft/publish flow
- [ ] **6.9** Settings page — brand config, payment provider toggle, shipping rules

**Key files:** `apps/admin/src/App.tsx`, `apps/admin/src/styles/globals.css`

---

## Phase 7: Infrastructure

*Cross-cutting gaps that affect correctness and production readiness.*

- [ ] **7.1** R2 image upload endpoint (`POST /api/assets/upload` in admin-api) + wiring to product create/edit
- [ ] **7.2** Product cache invalidation on admin update — admin writes must call `deleteProduct(kv, slug)` (currently no TTL)
- [ ] **7.3** Collection cache — `keys.ts` reserves `collection:{slug}` but no get/set/delete functions exist in `@commerce/cache`
- [ ] **7.4** Inventory decrement on `payment_intent.succeeded` — `variants.inventory_qty` exists in schema, nothing decrements it
- [ ] **7.5** Low stock alert — configurable threshold, log or webhook notification
- [ ] **7.6** Email service integration — transactional email on order confirmation (webhook trigger exists, no sender wired)
- [ ] **7.7** `@commerce/db` + `@commerce/cache` test coverage — currently partial
- [ ] **7.8** Deployment automation — replace placeholder IDs in `wrangler.toml`, validate D1 migrations, `scripts/setup-cloudflare.sh` end-to-end

**Key files:** `workers/admin-api/src/index.ts`, `packages/cache/src/keys.ts`, `workers/storefront-api/src/routes/webhooks.ts`, `packages/db/test/queries.test.ts`, `packages/cache/test/cache.test.ts`, `wrangler.toml`

---

## Phase 8: Long Horizon

*Future capabilities — not blocking production.*

- [ ] **8.1** PayPal adapter — implement `PaymentProvider` interface (factory slot reserved in `packages/payment/src/factory.ts`)
- [ ] **8.2** Customer accounts — storefront login, password auth, address book, order history by email
- [ ] **8.3** Discounts / coupons — type structure reserved in spec, no implementation
- [ ] **8.4** Variant management — storefront filter/select endpoints, admin CRUD, line item variant snapshot
- [ ] **8.5** Digital product delivery — download link generation on order completion for `type: 'digital'`
- [ ] **8.6** Subscription products — recurring billing via Stripe Subscriptions for `type: 'subscription'`
- [ ] **8.7** Admin role-based permissions — enforce `owner` vs `editor` in admin-api middleware (role field exists in `admin_users`)
- [ ] **8.8** Analytics endpoints — order revenue by period, top products, customer LTV (admin-api)
- [ ] **8.9** Multi-currency support — `brand.config.ts` currency field exists, Stripe multi-currency not wired
- [ ] **8.10** Authorize.net adapter — second payment provider for clients who can't use Stripe
