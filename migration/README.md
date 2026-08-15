# THRETHA COUTURE — Migration package (Atlas + Cloudinary)

This folder contains everything needed to finish moving your store to the free tier.

## Status

| Item | Status |
|------|--------|
| **Images → Cloudinary** | ✅ DONE — all 18 images uploaded to your Cloudinary (`awyzthu3`, folder `thretha/migrated`) and verified publicly reachable. |
| **Database URLs rewritten** | ✅ DONE — every image URL in the database now points at Cloudinary. |
| **Database → Atlas** | ⏳ ONE STEP LEFT — run the restore below from your own machine. |

> Why one manual step? The Emergent build container blocks outbound MongoDB (port 27017) TLS, so the copy into Atlas must be run from your computer (or any machine with normal internet). It takes ~10 seconds.

## What's in the archive

`thretha_couture.archive.gz` (gzip mongodump) contains all collections with Cloudinary image URLs already baked in:
- `products` (11), `categories` (2), `settings` (1), `users` (1 admin), `orders` (3), `customers` (3)

> The `products`/`orders` include a few automated-test entries (a product named “Test” and sample orders). Delete them later from **/admin** if you don’t want them.

## How to restore into Atlas (one command)

1. Install **MongoDB Database Tools** (gives you `mongorestore`): https://www.mongodb.com/try/download/database-tools
2. Make sure your Atlas **Network Access** allows your current IP (or `0.0.0.0/0`).
3. Run (password `@` → `%40`):

```bash
chmod +x restore-to-atlas.sh
./restore-to-atlas.sh "mongodb+srv://Admin:9037624696%40Aj@threthacouture.fnfc3qo.mongodb.net/?retryWrites=true&w=majority"
```

Or directly with mongorestore:

```bash
mongorestore \
  --uri="mongodb+srv://Admin:9037624696%40Aj@threthacouture.fnfc3qo.mongodb.net/?retryWrites=true&w=majority" \
  --gzip --archive=thretha_couture.archive.gz \
  --nsFrom='your_database_name.*' --nsTo='thretha_couture.*' --drop
```

## Verify

After restore, in Atlas (or `mongosh`) the `thretha_couture` database should show the 6 collections above. Then deploy on Render with:
- `MONGO_URL` = your Atlas connection string
- `DB_NAME` = `thretha_couture`
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET`

Your storefront will load images straight from Cloudinary and data from Atlas — fully independent, zero-cost.

## Admin login (unchanged)
- Email: `admin@threthacouture.com`
- Password: `thretha@2026`
(Change it later, or set `ADMIN_EMAIL`/`ADMIN_PASSWORD` before seeding a fresh DB.)
