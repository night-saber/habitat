# Verde — Landscaping, organised

A web app that connects **land owners** with **gardeners**, so change requests travel as photos and pinned locations instead of texts and guesswork.

Built as a single-page app with no build step, no backend, and no dependencies beyond Leaflet.

## The idea

Landscaping jobs go wrong in a predictable way: the owner describes what they want in words, the worker pictures something different, and the disagreement surfaces after the work is done.

Verde fixes that by making the *request* itself visual and located:

- The owner photographs the exact thing they want changed and writes what they want instead
- The photo is pinned to a spot on the map
- The worker sees a job list with the photo, the instruction, and the exact place to stand

## Features

**Two account types**
- **Land owner** — add properties, post change requests, attach photos, pin locations, assign workers
- **Gardener / worker** — see every property assigned to them, work a task list, upload completion photos as proof

**Photo change requests**
Every task can carry a "before" photo and a "after" photo. Photos are downscaled and JPEG-compressed in the browser to ~8 KB so a whole job history fits in local storage.

**Live map**
Leaflet + OpenStreetMap (free, no API key). Properties show as pins, tasks as colour-coded circles by priority, and photos as markers you can tap to view. Tap anywhere on the map to drop a pin for a new task.

**Automatic translation**
Every account picks a primary language at signup — 17 to choose from. The whole interface switches, and **user-written content is translated automatically** through the MyMemory API (free, no key). So an English-speaking owner and a Spanish-speaking gardener can write in their own language and each reads the other in theirs. Translated text is tinted cyan so it's clear it was machine-translated.

**Task workflow**
`Open → In progress → Done`, with priority levels, per-task comments, and completion photos.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell — auth screen, navigation, views, modals |
| `css/style.css` | Dark green theme, responsive, mobile-first |
| `js/store.js` | Data layer — accounts, properties, tasks, photos |
| `js/i18n.js` | UI strings + automatic content translation |
| `js/app.js` | Views, map, photo capture, event wiring |

## Running it

It's a static site, but it uses ES modules, so it needs to be served over HTTP:

```bash
python -m http.server 8000
# open http://localhost:8000
```

Click **Try the demo** to load a seeded account with two properties, four tasks and a worker — no signup needed. Demo logins:

- Owner — `owner@demo.com` / `demo123`
- Worker — `worker@demo.com` / `demo123`

## Data and privacy

Everything lives in the browser's `localStorage`. No server, no account, no tracking, nothing leaves the device except the text sent to the translation API.

Passwords are hashed with SHA-256 before storage — but this is a client-side demo, not a hardened auth system. A real deployment would move accounts and photos to a backend with proper session auth and object storage.

## Where this would go next

- A real backend (FastAPI + Postgres, object storage for photos) so accounts work across devices
- Photo upload straight to S3-compatible storage instead of local storage
- Push notifications when a new change request lands
- Offline mode — workers are often somewhere with no signal
- Invoicing and time tracking per property
