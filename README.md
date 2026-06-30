# Community Hero

A hyperlocal civic issue-reporting platform. Citizens snap a photo, drop a
pin, and submit a report in under 30 seconds; a (simulated) AI engine
classifies the issue, scores severity, flags emergencies, checks for
duplicates, and routes it to the right department. Officers triage
everything from a dedicated dashboard.

This is a **fully static, frontend-only prototype** — plain HTML/CSS/JS,
no build step, no backend, no database. All data lives in the browser's
`localStorage`.

## Running it

No install or build step required.

```
vibe_2_ship/
├── index.html
├── css/
│   └── design.css
└── js/
    ├── state.js
    ├── ai.js
    ├── map.js
    ├── ui.js
    └── app.js
```

Just open `index.html` in a browser, or serve the folder with any static
file server (e.g. `python3 -m http.server`, the VS Code "Live Server"
extension, etc.) if you want geolocation to work reliably — some browsers
restrict `navigator.geolocation` on the `file://` protocol.

No API keys, environment variables, or external services are required.
The only external resources are the Leaflet.js map library and Google
Fonts, loaded from public CDNs.

## What it does

**Report** — Citizens describe an issue, optionally attach a photo, and
either type a location, tap "Use my location" (GPS), or drop/drag a pin
directly on an in-form map to pin the exact spot. A simulated AI panel
classifies the issue (category, severity, confidence, routing department)
with progressive loading states; low-confidence results prompt the citizen
to confirm or correct the category. Reports can optionally be filed
anonymously.

**Map & Feed** — A live Leaflet map plus a scrollable feed of all reports,
with status-colored markers (pulsing red for emergencies). Filterable by
status, category, time range, and distance from the citizen's current
location.

**My Reports** — A citizen's own submission history with status, an
estimated resolution time, and a civic points/badges summary.

**Officer Dashboard** — A department-scoped view with an emergency lane
(audible alert on new critical reports), a moderation queue for
AI-flagged submissions, active work orders, and simple department-load /
resolution-rate charts.

## How the "AI" works

`js/ai.js` is a **mock** classification engine — it uses keyword matching
over the title/description/filename text to simulate what a real
computer-vision + NLP pipeline would return (category, confidence,
severity, emergency detection, duplicate check, basic spam/toxicity
moderation), with an artificial delay so the UI feels responsive. There is
no real model running anywhere in this build.

## Data & persistence

Everything — reports, votes, comments, filter state — is stored in the
browser's `localStorage` under the key `ch_reports_v1`. There is no
server, no real user accounts, and no data sharing between browsers or
devices. Use the **"Reset all data"** link in the footer to wipe local
data and restore the seeded sample reports.

## File overview

| File | Responsibility |
|---|---|
| `index.html` | Page structure for all four views + the report detail modal |
| `css/design.css` | All styling — design tokens, layout, components |
| `js/state.js` | Central data store, `localStorage` persistence, derived stats, seed data |
| `js/ai.js` | Mock AI classification/moderation engine |
| `js/map.js` | Leaflet map rendering for the Map & Feed view, plus the report-form pin-drop map |
| `js/ui.js` | All DOM rendering for every view, modal, and toast |
| `js/app.js` | Event wiring, view routing, form submission flow |

## Known limitations

This is a demo/prototype, not a production system:

- No real computer vision — classification is keyword-based and can be
  inaccurate or randomly guessed when no keywords match.
- No authentication — there's a single hardcoded "demo user"; anyone using
  the app locally sees only their own browser's data.
- No real backend, so no Row-Level Security, rate limiting, EXIF
  stripping, or server-side validation actually run — they're not needed
  for an app with no server, but also nothing prevents abuse if this were
  exposed publicly as-is.
- Data does not sync across devices or persist if browser storage is
  cleared.

A reference SQL schema and server-function design for a real Supabase/AI
backend (if this is ever upgraded beyond a static prototype) can be
provided separately on request — they are not part of this build.
