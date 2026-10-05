# Verde — Landscaping, organised

A web app that connects **land owners** with **gardeners**, so change requests travel as photos and pinned locations instead of texts and guesswork.

Two ways to run it: as a **static client** (no server, data in the browser) or against the **included API server** (real accounts, shared data).

---

## The idea

Landscaping jobs go wrong in a predictable way: the owner describes what they want in words, the worker pictures something different, and the disagreement surfaces after the work is done.

Verde fixes that by making the *request* itself visual and located:

- The owner photographs the exact thing they want changed and writes what they want instead
- The photo is pinned to a spot on the map
- The worker sees a job list with the photo, the instruction, and the exact place to stand

---

## Features

### Accounts
- **Land owner** — add properties, post change requests, attach photos, pin locations, manage crews
- **Gardener / worker** — see every property assigned to them (directly or through a crew), work a task list, upload completion photos as proof
- **Password reset** — every account gets a one-time **recovery code** (`VERDE-XXXX-XXXX-XXXX`) shown once at signup. It is the only way back in without email, and it is re-issued automatically on every reset. Change your password from Settings, or generate a fresh recovery code any time.

### Crews (sub-groups)
Workers are organised into **named crews** you define — "Garden Crew", "Build Crew", whatever fits.

- Add and remove workers from a crew
- Assign a **whole crew to a property** in one action, instead of adding people one at a time
- A worker sees a property if they are on its crew **or** assigned directly
- Crews are per-owner: you only ever see and manage your own

### Photo change requests
Every task can carry a "before" photo and an "after" photo. Photos are downscaled and JPEG-compressed in the browser to ~8 KB, so a whole job history fits in local storage.

### Live map
Leaflet + OpenStreetMap (free, no API key), styled dark to match the app.

- Properties render as **house-shaped pins**
- Tasks render as **circles coloured by priority** — red high, gold normal, green low, grey done
- Photos render as cyan dots you can tap to view
- Tap anywhere to drop a pin for a new task, or use device GPS
- A legend explains every marker

### Automatic translation
Every account picks a primary language at signup — 17 to choose from. The whole interface switches, and **user-written content is translated automatically** through the free MyMemory API. An English-speaking owner and a Spanish-speaking gardener each write in their own language and read the other in theirs. Translated text is tinted cyan. Translations are cached, so repeat views cost no requests.

### Task workflow
`Open → In progress → Done`, with priority levels, due dates, overdue highlighting, per-task comments, and completion photos.

### Everything else
- Search, filter by status, sort by priority/due date/title
- Pagination on long lists so the DOM stays small
- Activity log of who did what
- Data export/import as JSON
- Offline indicator; writes are queued and flushed on page hide
- Storage meter that warns before the browser quota is hit
- Keyboard: `/` jumps to search, `Esc` closes modals
- Responsive, dark theme, reduced-motion aware, RTL-aware

---

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell — auth, navigation, views, modals |
| `css/style.css` | Dark green theme, responsive, mobile-first |
| `js/store.js` | Data layer — accounts, crews, properties, tasks, photos, indexes |
| `js/i18n.js` | UI strings (en/es) + automatic content translation |
| `js/ui.js` | DOM helpers, modals, toasts, pagination, image compression |
| `js/app.js` | Views, map, photo capture, event wiring |
| `server/main.py` | FastAPI backend for multi-user deployment |

---

## Running the static client

It's a static site, but it uses ES modules, so it needs to be served over HTTP:

```bash
python -m http.server 8000
# open http://localhost:8000
```

Click **Try the demo** to load a seeded account — 3 properties, 5 tasks, 3 workers and 2 crews, no signup needed. Demo logins (password `demo1234` for all):

| Account | Email | Language |
|---|---|---|
| Owner | `owner@demo.com` | English |
| Worker — Garden Crew | `worker@demo.com` | Español |
| Worker — Garden Crew | `ana@demo.com` | Português |
| Worker — Build Crew | `kenji@demo.com` | 日本語 |

Log in as the owner to see all three properties and both crews. Log in as `ana@demo.com` and she sees only the two Garden Crew properties. Log in as `kenji@demo.com` and he sees only the Build Crew property. That's the crew isolation working.

---

## Running the real backend

The static client stores everything in one browser. For more than one person, use the server:

```bash
cd server
pip install fastapi uvicorn "sqlalchemy>=2" "passlib[argon2]" python-jose \
            python-multipart pydantic-settings aiofiles email-validator
export VERDE_SECRET="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')"
uvicorn main:app --reload
```

API docs at `http://localhost:8000/api/docs`.

### What the server does differently

| Concern | Static client | API server |
|---|---|---|
| Accounts | SHA-256 in localStorage | **Argon2id** in the database |
| Sessions | A user id in localStorage | Short-lived **JWT** + rotating refresh tokens |
| Password reset | Recovery code | Recovery code, and reset revokes every session |
| Photos | base64 in localStorage (~8 KB each) | Files on disk, served by a static route |
| Data sharing | One browser only | Real multi-user, tenant-isolated |
| Listing | Everything in memory | SQL with pagination, filters and indexes |

Tenant isolation lives in one function — `visible_property_ids()` — and every read of a property, task or photo goes through it. Owners see their own; workers see what they're assigned to directly or through a crew. There is no endpoint that returns another owner's data.

### Pointing the client at it

Add this before the module script in `index.html`:

```html
<script>window.VERDE_API = "http://localhost:8000";</script>
```

### Deploying for real traffic

The server is written to run behind a process manager, but a single box will not serve 10,000 daily users comfortably. The changes that matter, in order:

1. **Postgres instead of SQLite** — set `VERDE_DB=postgresql+psycopg://...`. SQLite serialises writes; this is the first bottleneck.
2. **Object storage for photos** — swap the local write in `upload_photo` for S3/R2, and serve via a CDN. Photo bytes dominate traffic.
3. **A CDN in front of the static client** — it is already fully static, so this is free on Cloudflare Pages or Netlify.
4. **Run several API workers** — `uvicorn --workers 4` behind nginx or Caddy.
5. **A shared rate limiter** — Redis-backed, applied to `/api/auth/*` first, since that's what gets abused.
6. **Move translation server-side and cache it** — the free MyMemory API is rate-limited and not suitable for production volume. Cache translations in the database keyed by hash of the source text.

None of that is speculative work — it's what this design already isolates to one place each.

---

## Data and privacy

In static mode everything lives in the browser's `localStorage`. No server, no account, no tracking — nothing leaves the device except the text sent to the translation API.

In server mode, data lives in your database and photos on your disk. Nothing goes anywhere else.

---

## Known limits

- Static mode is single-browser by design. Clearing site data loses it — export a backup first.
- The translation API is free and rate-limited; heavy use needs a paid provider or server-side caching.
- Worker accounts are created by signing up as a worker, then being added to a crew. There is no email invitation flow yet.
- Photo upload is limited to 8 MB per file on the server.
