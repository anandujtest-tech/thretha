# THRETHA COUTURE

A mobile-first, editorial fashion-commerce website + admin panel for a Kerala women's fashion brand. Customers browse the catalogue and place orders via **WhatsApp** — there is **no online payment gateway** and **no customer account/login** (by design). Built as a single full-stack **Next.js** application backed by **MongoDB**.

> This project is fully self-hostable and has **no dependency on Emergent** to run. It uses only MongoDB + standard Node packages.

---

## 1. What's inside (architecture)

This is a **single Next.js 15 (App Router) application** that contains the storefront, the admin panel, and the backend API together. This keeps deployment simple (one app, one deploy) while remaining clean and production-ready.

```
/
├── app/
│   ├── api/[[...path]]/route.js   # ← ALL backend API endpoints (catch-all)
│   ├── page.js                    # SPA router → storefront or /admin
│   ├── layout.js                  # fonts, metadata
│   └── globals.css                # design tokens / paper texture
├── components/
│   ├── tc/store.jsx               # storefront UI (home, shop, product, wishlist, order flow)
│   ├── tc/admin.jsx               # admin panel UI (login, dashboard, products, categories, orders, settings)
│   └── ui/                        # shadcn/ui components
├── lib/
│   ├── tc.js                      # frontend API client + wishlist helpers
│   └── utils.js
├── database/
│   └── SCHEMA.md                  # full MongoDB schema + import/export
├── scripts/
│   └── seed.mjs                   # standalone DB seeder (idempotent, --force to reset)
├── seed-media/                    # 12 bundled demo images (committed)
├── .env.example                   # documented environment template
├── next.config.js
├── package.json
└── README.md
```

**Why not separate `/frontend` and `/backend` folders?** In Next.js the frontend and backend live in one app on purpose — the API routes under `app/api/**` *are* the backend. Splitting them would be a rewrite and would break the current working app. Deploy this one app and you have everything.

### Features that exist (preserve exactly)
- **Storefront:** editorial homepage (hero carousel, latest drop, categories, saree edit, Instagram gallery, brand story), `/shop`, `/category/[slug]`, `/new-arrivals`, `/product/[slug]`, search, filters, sorting, sold-out/low-stock states, local-storage **wishlist**, floating WhatsApp button, mobile bottom nav.
- **Ordering:** size + quantity → order form → order saved to DB (`TC-YYYY-NNNN`) → opens a pre-filled **WhatsApp** message to the store number. No payment, no cart, no checkout page — intentional.
- **Admin panel** (`/admin`, hidden from public nav): login (JWT), dashboard stats, product CRUD + duplicate + **media upload**, category CRUD, orders + status workflow, settings (WhatsApp/Instagram/contact, **logo upload**, hero images, brand story, Instagram gallery, shipping policies, low-stock threshold).

> **Note:** There is intentionally **no customer registration/login, no shopping cart, no payment provider, and no email service** in this project. Do not expect those files — the business model is browse → WhatsApp order.

---

## 2. Requirements

- **Node.js 18+** (Node 20 recommended)
- **Yarn** (or npm)
- A **MongoDB** database — local, or hosted (MongoDB Atlas free tier works great)

---

## 3. Local development

```bash
# 1. Install dependencies
yarn install            # or: npm install

# 2. Configure environment
cp .env.example .env
#   → set MONGO_URL, DB_NAME, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, MEDIA_DIR

# 3. Seed the database (creates admin, 2 categories, 10 products, settings + demo images)
node scripts/seed.mjs

# 4. Run the app (frontend + backend + admin, all on one port)
yarn dev                # → http://localhost:3000
```

- Storefront: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin` (log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`)

Production build locally:
```bash
yarn build && yarn start
```

---

## 4. Environment variables

See **`.env.example`** for the full documented list. Summary:

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` | ✅ | MongoDB connection string (local or Atlas) |
| `DB_NAME` | ✅ | Database name (e.g. `thretha_couture`) |
| `JWT_SECRET` | ✅ | Signs admin login tokens — use a long random string |
| `ADMIN_EMAIL` | seed | Default admin email created by the seeder |
| `ADMIN_PASSWORD` | seed | Default admin password created by the seeder |
| `MEDIA_DIR` | ✅ | Folder for uploaded/seed media (use a **persistent** disk path in prod) |
| `DEFAULT_WHATSAPP` | seed | Store WhatsApp number for the first run (editable in Admin) |
| `CORS_ORIGINS` | ✅ | Allowed origin(s) for the API. Set to your site URL in prod (avoid `*`) |
| `NEXT_PUBLIC_BASE_URL` | optional | Only if hosting frontend/backend on different domains |

**Never commit `.env`.** It is git-ignored. Only `.env.example` (no secrets) is committed.

---

## 5. File storage / product images (Cloudinary — free)

Media is stored in **Cloudinary** when the three `CLOUDINARY_*` env vars are set (recommended for production — the Render free web service has an **ephemeral disk**, so images must live off-box). If those vars are empty (local dev), uploads fall back to the local `MEDIA_DIR` folder and are served at `/api/media/file/<name>`.

The storage logic is isolated in `lib/storage.js` (`saveUpload`, `serveMedia`); the admin UI and API don't change between modes.

- Cloudinary free plan: 25 monthly credits, ≤10 MB/image, ≤100 MB/video — plenty for a boutique catalogue.
- Get keys: cloudinary.com → **Console → Settings → API Keys** → copy Cloud Name, API Key, API Secret.

---

## 6. Authentication & security

- **Admin auth** uses email + **bcrypt-hashed** password and a **JWT** (`JWT_SECRET`), sent as `Authorization: Bearer <token>`. All `/api/admin/*` routes (except login) require a valid token.
- Passwords are never stored in plaintext and never returned by the API.
- No admin secrets are present in frontend code — the frontend only stores the returned JWT in `localStorage`.
- **CORS:** set `CORS_ORIGINS` to your exact site origin in production instead of `*`.
- There is no customer authentication (customers never log in).

---

## 7. Payment

Not applicable — this store deliberately has **no payment gateway**. Orders are confirmed manually over WhatsApp. Nothing to configure.

---

## 8. GitHub — what to commit

**Commit:** all source (`app/`, `components/`, `lib/`, `database/`, `scripts/`, `seed-media/`), `package.json`, `yarn.lock`, `next.config.js`, `tailwind.config.js`, `postcss.config.js`, `jsconfig.json`, `.env.example`, `.gitignore`, `README.md`.

**Do NOT commit:** `.env`, `node_modules/`, `.next/`, `/.media/` (runtime uploads). These are already in `.gitignore`.

> Getting the code to GitHub: use Emergent's **“Save to GitHub”** button in the top bar to push this repo to your own GitHub account, or download the source and `git push` it yourself. After that, everything below runs entirely off Emergent.

---

## 9. Zero-cost deployment (Render free + Atlas free + Cloudinary free)

**Cost: ₹0.** No persistent disk, no paid services. Uses `Dockerfile` + `render.yaml` included in the repo.

### Step 1 — MongoDB Atlas (free M0)
1. Create a free cluster at <https://www.mongodb.com/atlas>.
2. **Database Access** → add a user + password.
3. **Network Access** → allow `0.0.0.0/0` (so Render can connect).
4. **Connect → Drivers** → copy the connection string → this is your `MONGO_URL`. Use `DB_NAME=thretha_couture`.

### Step 2 — Cloudinary (free)
Sign up at <https://cloudinary.com> → **Console → Settings → API Keys** → copy `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

### Step 3 — Migrate your existing data + images (one-off)
Run this **once** (locally or in the current workspace) with your new keys in `.env`:
```bash
# .env must contain the SOURCE MONGO_URL/DB_NAME (current data),
# the CLOUDINARY_* keys, and TARGET_MONGO_URL/TARGET_DB_NAME (your Atlas).
node scripts/migrate-media.mjs
```
This uploads all current images to Cloudinary, rewrites every image URL in the database, and copies all collections (products, categories, settings, orders, customers, admin user) into your Atlas cluster.

> For a brand-new store with no existing data, skip migration and just run `node scripts/seed.mjs` against Atlas + Cloudinary instead.

### Step 4 — Deploy to Render (free)
1. Push the repo to GitHub (see §8).
2. Render Dashboard → **New → Blueprint** → connect the repo. Render reads `render.yaml`.
3. Fill the `sync:false` secrets in the dashboard: `MONGO_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CORS_ORIGINS` (set to your Render URL, e.g. `https://thretha-couture.onrender.com`). `JWT_SECRET` is auto-generated.
4. Deploy. Health check is `/api/health`.
5. Visit `https://<your-service>.onrender.com` and log in to `/admin`.

> **Free-tier note:** Render free web services sleep after ~15 min idle and take a few seconds to wake on the next request. This is normal and fine for a boutique launched via Instagram bio.

### Alternative — Vercel (also free)
Import the repo on Vercel, add the same env vars (Cloudinary handles images, Atlas handles data — no disk needed). Vercel doesn't use the Dockerfile; it builds Next.js natively.

---

## 10. External database (MongoDB Atlas)

1. Create a free cluster at <https://www.mongodb.com/atlas>.
2. **Database Access:** create a user + password.
3. **Network Access:** allow your host's IP (or `0.0.0.0/0` for testing).
4. Copy the connection string and set it as `MONGO_URL`, set `DB_NAME=thretha_couture`.
5. Run `node scripts/seed.mjs` once to create indexes + seed data.

Import existing data or export current data: see **`database/SCHEMA.md`** (`mongodump` / `mongorestore`).

---

## 11. Custom domain

- **Render:** Service → Settings → Custom Domains → add your domain → create the shown CNAME/A record at your DNS provider. TLS is automatic.
- **Vercel:** Project → Domains → add domain → follow the DNS instructions.
- After the domain is live, set `CORS_ORIGINS` (and `NEXT_PUBLIC_BASE_URL` if used) to `https://yourdomain.com` and redeploy.

---

## 12. API reference (all under `/api`)

**Public:** `GET /health`, `GET /settings`, `GET /categories`, `GET /products` (filters: `category, new, featured, search, colour, minPrice, maxPrice, size, availability, sort`), `GET /products/:slug`, `POST /orders`, `GET /media/file/:name`.

**Admin (Bearer token):** `POST /admin/login`, `GET /admin/me`, `GET /admin/stats`, `GET/POST /admin/products`, `PUT/DELETE /admin/products/:id`, `POST /admin/products/:id/duplicate`, `GET/POST /admin/categories`, `PUT/DELETE /admin/categories/:id`, `GET /admin/orders`, `PUT /admin/orders/:id`, `GET/PUT /admin/settings`, `POST /admin/media`.

---

## 13. Everything I Need to Host This Outside Emergent

**Accounts / services**
- [ ] **GitHub** account + repository (to store the code)
- [ ] **MongoDB Atlas** account (free tier) — external database
- [ ] A **host** for the app: **Render** (recommended, has persistent disk) *or* Vercel/Railway/Fly.io/VPS
- [ ] *(Optional)* **Object storage** (Cloudflare R2 / AWS S3 / Cloudinary) — only if your host has an ephemeral disk and you need durable uploads
- [ ] *(Optional)* A **domain name** + DNS access

**Credentials / values to prepare**
- [ ] `MONGO_URL` (Atlas connection string) and `DB_NAME`
- [ ] `JWT_SECRET` (generate a long random string)
- [ ] `ADMIN_EMAIL` + `ADMIN_PASSWORD` (your admin login)
- [ ] `MEDIA_DIR` (a persistent path on your host, e.g. `/data/media`)
- [ ] `DEFAULT_WHATSAPP` (your store WhatsApp number, digits only, with country code)
- [ ] `CORS_ORIGINS` (your final site URL)
- [ ] *(Optional)* storage keys if using R2/S3/Cloudinary

**Steps**
1. Push repo to GitHub → 2. Create Atlas DB → 3. Deploy app to Render/Vercel with env vars → 4. Attach persistent disk (Render) or configure external storage (Vercel) → 5. Run `node scripts/seed.mjs` once → 6. Log in at `/admin`, update Settings → 7. (Optional) connect your domain.

> **Not required (this app has none of these):** payment gateway keys, email/SMS provider, customer-auth provider, or any Emergent-specific service.
