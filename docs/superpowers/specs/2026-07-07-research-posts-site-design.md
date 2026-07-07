# Design — Research posts on monashaialignment.org

Date: 2026-07-07 · Repo: `Monash-AI-Alignment/website` (public, Cloudflare Workers static assets) · Author: Sean Murphy

## Goal

Grow the Monash AI Alignment site from a single placeholder page into a home for **Distill-style
research posts**. Three deliverables:

1. A reusable **post template** anyone in the group can copy to write a new Distill-style writeup — no build step.
2. A **research index page** (`/research`) listing all posts, newest first.
3. The existing **collaborative-decoding watermark-removal writeup** migrated in as the first post at
   `/research/collaborative-decoding`, with its **live dashboard** reading data from the public
   `Monash-AI-Alignment/collaborative-decoding` repo.

## Non-goals (YAGNI)

- **No static-site generator / build step.** The repo stays zero-build (raw static assets). Distill's native
  format is HTML, so the "template" is a skeleton file you copy — not a compiler.
- **No Markdown authoring pipeline.** Considered and rejected: it adds a toolchain + CI for a small group site.
  (Revisit only if non-technical authors become a real need.)
- **No CMS, no comments, no auth.** Posts are static HTML committed to git.
- **No redesign of the collab-decoding dashboard or its findings feed** — migrate them as-is; only the data-fetch
  URLs change.

## Architecture

### Repo layout (website repo, after this work)

```
index.html                         # home (existing) — add a link to /research
styles.css                         # existing Monash theme (shared)
assets/                            # existing logos/favicons + vendored Distill core
  distill.template.v2.js           #   NEW: vendored copy of distill.pub/template.v2.js (robustness/pinning)
research/
  index.html                       # NEW: the listing page (Monash-styled cards; plain, no Distill)
  index.json                       # NEW: post manifest (drives the listing)
  _template.html                   # NEW: Distill post skeleton with EDIT markers
  collaborative-decoding.html      # NEW: migrated writeup (Distill + live dashboard)
  collaborative-decoding-findings.html   # NEW: migrated explore.html research-feed (linked from the post)
.assetsignore                      # NEW: keep docs/ + internal files out of the public deploy
docs/superpowers/specs/…           # this spec (never served — see .assetsignore)
wrangler.jsonc                     # existing (directory: ./)
```

### Data flow (the live dashboard)

```
autonomous loop (HPC)  ──commit+push docs/data.json──▶  Monash-AI-Alignment/collaborative-decoding @ main
                                                                    │
                                              jsDelivr CDN (CORS *) ─┘   + purge-on-push
                                                                    │
   /research/collaborative-decoding.html  ──fetch(cache:'no-store')─┘
```

- **Source of truth:** `Monash-AI-Alignment/collaborative-decoding` (public). Already contains
  `docs/data.json` + `docs/watermarks.json`.
- **Delivery:** jsDelivr (purpose-built for hotlinking, global multi-CDN, CORS `*`):
  - `https://cdn.jsdelivr.net/gh/Monash-AI-Alignment/collaborative-decoding@main/docs/data.json`
  - `…/docs/watermarks.json`
- **Freshness:** jsDelivr caches branch refs up to ~12 h edge / 7 d browser. Solved by (a) the dashboard
  fetching with `cache:'no-store'` (bypasses browser cache — already how the writeup fetches), and (b) a
  **purge-on-push** step wired into the loop (see "Data update pipeline" below). The site works from day one on
  the last-committed snapshot; the purge makes it near-real-time.
- Why not `raw.githubusercontent.com`: GitHub throttles it and discourages production hotlinking; fine at low
  traffic but a liability under a traffic spike. jsDelivr removes that concern, and we can keep it fresh cheaply.

### Routing (no custom Worker needed)

Cloudflare Workers static assets with `html_handling: "auto-trailing-slash"` (the default) serve clean URLs:
`/research` → `research/index.html`, `/research/collaborative-decoding` → `research/collaborative-decoding.html`.
No routing code required.

## Components

### 1. Post manifest — `research/index.json`

```json
{
  "posts": [
    {
      "slug": "collaborative-decoding",
      "title": "<existing writeup title>",
      "authors": ["Sean Murphy"],
      "date": "2026-07-06",
      "summary": "One–two sentence blurb shown on the index card.",
      "tags": ["watermarking", "security", "autonomous-research"],
      "status": "live"
    }
  ]
}
```

Single source of truth for the listing. Adding a post = append one entry. `date` (ISO) drives sort order
(newest first). `status` (`live`/`draft`) lets the index optionally hide drafts.

### 2. Research index page — `research/index.html`

- Monash-themed (reuses `styles.css` — the existing `--accent` blue, Inter, 760 px column). **Not** a Distill
  page — it's a simple cards list.
- Fetches `research/index.json` (same-origin, relative), sorts by `date` desc, renders a card per post:
  title (links to `/research/<slug>`), authors, date, summary, tag chips.
- Graceful empty/error states.
- Header links back to `/` and the home links forward to `/research`.

### 3. Post template — `research/_template.html`

- A minimal, **commented** Distill skeleton (leading `_` signals "not a real post"; excluded from the manifest).
- Loads the **vendored** Distill core: `<script src="/assets/distill.template.v2.js"></script>`.
- Contains, with `<!-- EDIT: … -->` markers: `<d-front-matter>` JSON (title/authors/KaTeX config),
  `<d-title>`, `<d-byline>`, `<d-article>` with example section + a KaTeX example + a `d-cite` example, and a
  `<script type="text/bibtex">` block (NOTE the exact type — see Gotchas).
- A short **"How to add a post"** comment header enumerating the steps below.

### 4. Migrated writeup — `research/collaborative-decoding.html`

Copy of the current `docs/index.html` from the collab-decoding repo, with these changes only:
- Distill script `src` → `/assets/distill.template.v2.js` (vendored).
- The two data fetches repointed from `./data.json` / `./watermarks.json` to the absolute **jsDelivr** URLs
  (keep `{cache:'no-store'}`).
- A slim Monash header bar above the Distill chrome linking back to `/research` (so the post feels part of the
  site). Distill's own `<d-title>`/byline/footer stay.
- Everything else — SVG chart-building JS, KPIs, frontier/SOTA charts, leaderboard, watermark p-value chart,
  bibliography — carries over unchanged.

### 5. Migrated findings feed — `research/collaborative-decoding-findings.html`

Copy of the current `docs/explore.html` (master-detail research feed), data fetch repointed to the jsDelivr
`data.json` URL. Linked from the post. Migrated as-is (no redesign).

### 6. Home page — `index.html`

Minimal change: add a **Research** entry point (a nav link and/or a CTA in the hero row) pointing to `/research`.
Optionally surface the latest post title. No broader nav redesign.

### 7. Vendored Distill core — `assets/distill.template.v2.js`

One-time copy of `https://distill.pub/template.v2.js` into the repo, so posts don't depend on distill.pub being
up and the version is pinned. Template + migrated post reference the local copy.

### 8. Deploy hygiene — `.assetsignore`

Root `.assetsignore` (Cloudflare Workers Assets honors it) excludes internal files from the public deploy:
`docs/` (specs/planning), `.wrangler/`, `README.md` (optional), and any dotfiles. Prevents the same
internal-docs-leak the collab-decoding repo hit. **This is implementation task #1** so nothing internal is ever
served.

## Adding a new post (the authoring workflow this enables)

1. `cp research/_template.html research/<slug>.html`
2. Fill in the front-matter (title/authors/abstract), body sections, and bibliography (follow the EDIT markers).
3. Append an entry for the post to `research/index.json`.
4. Commit + push → Cloudflare deploys → the post is live at `/research/<slug>` and appears in the `/research` list.

## Data update pipeline (change lives in the collab-decoding repo, not here)

For the dashboard to update automatically, the autonomous loop must, on each data change:
1. Commit + push `docs/data.json` (and `watermarks.json` when regenerated) to `monash/main`.
2. `curl -s https://purge.jsdelivr.net/gh/Monash-AI-Alignment/collaborative-decoding@main/docs/data.json`
   (and the `watermarks.json` purge URL).

Tracked as a follow-up in that repo. Until it's wired, updates are a manual push + purge; the site still shows
the last-committed snapshot correctly.

## Testing / verification

- Serve `website/` locally over HTTP (`python3 -m http.server`) and load each page in **headless Chromium**
  (the puppeteer-core harness from the collab-decoding session). Distill renders into **shadow DOM** — assert on
  `el.shadowRoot`, not light DOM. Screenshot `/research` and `/research/collaborative-decoding`.
- Confirm the live dashboard fetches jsDelivr successfully (charts populate, no console errors).
- Confirm KaTeX math and `d-cite` citations render (the two classic failure modes).
- Deploy is not "done" until the live `monashaialignment.org/research/...` URL is checked in a real browser.

## Gotchas (carried from the collab-decoding site)

- Bibliography script MUST be `type="text/bibtex"` (not `text/bibliography`). An uncaught KaTeX error aborts the
  entire Distill render — validate math.
- `.assetsignore` is allowlist-by-exclusion — wrangler serves ALL of the directory otherwise. Keep it locked.
- The watermark p-value is **side-reporting only** — never an optimization target (invariant from the science).

## Deferred / follow-ups

- Add a `LICENSE` + safety-research attribution to the collab-decoding repo.
- Wire the loop's commit+push + jsDelivr purge (above).
- τ-sweep operating points on the watermark chart (existing science backlog).

## Open questions

None blocking. The exact post title/summary text and whether to surface latest posts on the home page are
content choices made during implementation.
