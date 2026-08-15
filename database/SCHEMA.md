# THRETHA COUTURE — Database Schema (MongoDB)

**Engine:** MongoDB (works with local MongoDB or MongoDB Atlas).
**IDs:** Every document uses a string UUID `id` field. MongoDB `_id` is never exposed by the API.
**Database name:** taken from `DB_NAME` (default `thretha_couture`).

> There is no ORM/migration framework. The schema is created implicitly on first write, and `scripts/seed.mjs` creates the indexes and seed data.

---

## Collections

### `users` (admin accounts)
| field | type | notes |
|-------|------|-------|
| id | string (uuid) | primary id |
| name | string | |
| email | string | **unique index**, lowercased |
| password_hash | string | bcrypt hash — never returned by API |
| role | string | `admin` |
| created_at | date | |

### `categories`
| field | type | notes |
|-------|------|-------|
| id | string (uuid) | primary id |
| name | string | |
| slug | string | **unique index** |
| description | string | |
| image | string | media URL (`/api/media/file/...`) |
| display_order | number | sort order |
| active | boolean | |
| created_at | date | |

### `products`
| field | type | notes |
|-------|------|-------|
| id | string (uuid) | primary id |
| name | string | |
| slug | string | **unique index** |
| sku | string | product code, e.g. `TC-SR-001` |
| category_id | string (uuid) | **ref → categories.id** |
| category_name | string | denormalised for fast display |
| description | string | |
| price | number | |
| discount_price | number \| null | effective price = discount_price ?? price |
| fabric, colour, material, pattern, care_instructions | string | |
| stock | number | total stock |
| sizes | array | `[{ size, available, stock }]` |
| media | array | `[{ id, type: 'image'\|'video', url, display_order, is_primary }]` |
| featured, new_arrival, best_seller, active | boolean | flags |
| created_at, updated_at | date | |

### `orders`
| field | type | notes |
|-------|------|-------|
| id | string (uuid) | primary id |
| order_number | string | **unique index**, e.g. `TC-2026-0001` |
| customer_id | string (uuid) | **ref → customers.id** |
| customer | object | embedded snapshot: name, whatsapp, phone, house, street, city, district, state, pincode |
| items | array | `[{ product_id, product_name, sku, size, colour, quantity, price }]` |
| total | number | |
| status | string | `NEW`, `WHATSAPP CONTACTED`, `CONFIRMED`, `PACKED`, `SHIPPED`, `DELIVERED`, `CANCELLED` |
| created_at, updated_at | date | |

### `customers`
| field | type | notes |
|-------|------|-------|
| id | string (uuid) | primary id |
| name, phone, whatsapp | string | |
| house, street, city, district, state, pincode | string | delivery address |
| created_at | date | |

### `settings` (single document, `id: 'global'`)
Holds all store/homepage configuration: `brand_name`, `instagram`, `whatsapp`, `phone`, `email`, `address`, `logo_url`, `low_stock_threshold`, `shipping{...}`, `hero{ title, subtitle, annotation, cta, images[] }`, `saree_edit_image`, `brand_story`, `brand_story_image`, `instagram_gallery[]`.

---

## Indexes (created by `scripts/seed.mjs`)
- `users.email` unique
- `products.slug` unique, `products.category_id`
- `categories.slug` unique
- `orders.order_number` unique
- `settings.id` unique

---

## Export / Import existing data

**Export from the current (Emergent) database:**
```bash
mongodump --uri="$MONGO_URL" --db="$DB_NAME" --out=./dump
```

**Import into your own MongoDB / Atlas:**
```bash
mongorestore --uri="<YOUR_ATLAS_URI>" --db="thretha_couture" ./dump/<old_db_name>
```

**Fresh database (no existing data):** just run `node scripts/seed.mjs`.

> Uploaded media lives on the server disk in `MEDIA_DIR`, not in MongoDB. When migrating, copy that folder too (or migrate to external storage — see README).