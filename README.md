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

## 5. File storage / product images

Uploaded images/videos are stored on the **server's disk** in `MEDIA_DIR` and served at `/api/media/file/<name>`. This is provider-independent and requires no external account.

**Important for deployment:** platforms with an *ephemeral* filesystem (e.g. Vercel serverless, Heroku) will **lose uploads on redeploy**. Two supported options:

- **(Recommended, zero extra config) Host on a platform with a persistent disk** — e.g. **Render** (attach a Disk mounted at your `MEDIA_DIR`), **Railway** (volume), **Fly.io** (volume), or any **VPS**. This preserves the current behaviour exactly.
- **(Optional) External object storage** — Cloudflare R2 / AWS S3 / Cloudinary. The upload logic is isolated in one place (`saveUpload()` and `serveMedia()` in `app/api/[[...path]]/route.js`). If you want this, provide your storage keys and it can be wired behind the same `/api/admin/media` endpoint without any UI change.

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

## 9. Deployment

### Option A — Render (recommended, keeps disk-based media working)
1. Create a **MongoDB Atlas** cluster (see §10) and copy its connection string.
2. Push this repo to GitHub.
3. On **Render → New → Web Service**, connect the repo.
   - **Build command:** `yarn install && yarn build`
   - **Start command:** `yarn start`
   - **Environment:** add all vars from `.env.example` (set `MEDIA_DIR=/data/media`).
4. **Render → Disks:** add a Disk mounted at `/data` so uploads/seed images persist.
5. Deploy. Then run the seeder once (Render **Shell**): `node scripts/seed.mjs`.

### Option B — Vercel (needs external storage for uploads)
1. Import the repo on **Vercel** (it auto-detects Next.js).
2. Add all env vars in Project Settings.
3. Because Vercel's filesystem is ephemeral, configure external object storage for media (see §5) before relying on uploads; browsing/ordering work regardless.
4. Deploy, then seed against your Atlas DB from your machine: `MONGO_URL=... DB_NAME=... node scripts/seed.mjs`.

### Option C — VPS / Docker
Run `yarn install && yarn build && yarn start` behind Nginx; point `MEDIA_DIR` at a real folder; use a process manager (pm2/systemd). MongoDB can be local or Atlas.

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
