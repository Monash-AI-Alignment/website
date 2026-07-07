# Research Posts Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `Monash-AI-Alignment/website` placeholder into a home for Distill-style research posts — a zero-build post template, a `/research` index page, and the collaborative-decoding writeup migrated in with a live dashboard.

**Architecture:** Pure static HTML/CSS/JS served by Cloudflare Workers static assets (no build step). Posts are hand-authored Distill HTML from a copyable template. A `research/index.json` manifest drives the listing page. The migrated writeup's live dashboard fetches `data.json`/`watermarks.json` cross-origin from the public `Monash-AI-Alignment/collaborative-decoding` repo via jsDelivr (CORS `*`).

**Tech Stack:** Static HTML/CSS/vanilla JS; Distill `template.v2.js` (vendored); Cloudflare Workers static assets (`wrangler`); jsDelivr CDN; puppeteer-core + headless Chromium for verification.

## Global Constraints

- **Zero build step.** No SSG, no bundler, no npm build. Files are served as-is.
- **Repo & branch:** work in `/fs04/ax74/smur0075/website` on branch `research-posts` (already created; spec already committed there).
- **All user/agent-derived text rendered via `textContent`** (never `innerHTML` with data values) — XSS-safe, matching the collab-decoding site's discipline.
- **Data URLs (exact, verbatim):**
  - `https://cdn.jsdelivr.net/gh/Monash-AI-Alignment/collaborative-decoding@main/docs/data.json`
  - `https://cdn.jsdelivr.net/gh/Monash-AI-Alignment/collaborative-decoding@main/docs/watermarks.json`
  - Fetch both with `{ cache: "no-store" }`.
- **Distill bibliography script tag MUST be `type="text/bibtex"`** (not `text/bibliography`). An uncaught KaTeX error aborts the whole Distill render.
- **Theme:** light only, reuse existing `styles.css` variables (`--accent: #006dae` Monash blue, Inter, `--maxw: 760px`). Do not add dark mode.
- **`.assetsignore` is allowlist-by-exclusion** — wrangler serves ALL of the directory unless a file is excluded. Keep it locked.
- **Verification harness:** headless Chromium at `/usr/bin/chromium-browser`; puppeteer-core installed under the session scratchpad. Distill renders into **shadow DOM** — assert on `document.querySelector('d-article').shadowRoot`, not light DOM.
- **Local serving caveat:** `python3 -m http.server` does NOT do Cloudflare's clean-URL rewriting, so locally request the explicit `.html` paths (e.g. `/research/index.html`); clean URLs (`/research/<slug>`) only resolve on the live Cloudflare deploy.
- **Scratchpad path (this session):** `/fs04/scratch2/ax74/smur0075/tmp/claude-17158/-fs04-ax74-smur0075-automated-w2s-research/1c2f993c-8082-434e-a4d5-a04349ec8556/scratchpad` (referred to below as `$SP`).

---

## File Structure

- Create: `.assetsignore` — exclude internal files from the public deploy.
- Create: `assets/distill.template.v2.js` — vendored Distill core.
- Create: `research/index.json` — post manifest.
- Create: `research/index.html` — listing page (Monash-styled cards; no Distill).
- Create: `research/_template.html` — Distill post skeleton with EDIT markers.
- Create: `research/collaborative-decoding.html` — migrated writeup (from collab-decoding `docs/index.html`).
- Create: `research/collaborative-decoding-findings.html` — migrated findings feed (from `docs/explore.html`).
- Create: `docs/superpowers/verify/check.js` — reusable headless render-check (not served).
- Modify: `index.html` — add a "Research" entry point.

Source files to copy from (read-only): `/fs04/ax74/smur0075/automated-w2s-research/docs/index.html` and `.../docs/explore.html`.

---

### Task 1: Deploy hygiene — `.assetsignore`

Do this first so no internal file (specs, plans, this repo's config) is ever served once we deploy.

**Files:**
- Create: `.assetsignore`

- [ ] **Step 1: Write `.assetsignore`**

```
# Cloudflare Workers Assets serves EVERY file in the deploy directory unless excluded here.
# Keep internal/planning/config files out of the public site.
docs/
.wrangler/
.gitignore
.assetsignore
wrangler.jsonc
README.md
*.md
research/_template.html
```

- [ ] **Step 2: Verify wrangler would exclude `docs/` from the upload**

Run:
```bash
cd /fs04/ax74/smur0075/website
CLOUDFLARE_API_TOKEN=$(cat ~/.cf_token) npx --yes wrangler deploy --dry-run 2>&1 | grep -iE "asset|upload|docs" | head
```
Expected: the dry-run reports the asset count and does NOT list files under `docs/`. (Dry-run does not publish.)

- [ ] **Step 3: Commit**

```bash
cd /fs04/ax74/smur0075/website
git add .assetsignore
git commit -m "chore: add .assetsignore so internal docs/config are never served"
```

---

### Task 2: Vendor the Distill core

Remove the runtime dependency on `distill.pub` and pin the version.

**Files:**
- Create: `assets/distill.template.v2.js`

- [ ] **Step 1: Download the Distill template into assets/**

```bash
cd /fs04/ax74/smur0075/website
curl -fsSL https://distill.pub/template.v2.js -o assets/distill.template.v2.js
```

- [ ] **Step 2: Verify it's the real file (non-trivial size + recognizable markers)**

```bash
cd /fs04/ax74/smur0075/website
wc -c assets/distill.template.v2.js            # expect > 50000 bytes
grep -c "d-article\|distill\|d-citation" assets/distill.template.v2.js   # expect > 0
```
Expected: size > 50 KB and at least one marker match. If the download is an HTML error page or tiny, stop and re-fetch.

- [ ] **Step 3: Commit**

```bash
cd /fs04/ax74/smur0075/website
git add assets/distill.template.v2.js
git commit -m "chore: vendor distill template.v2.js (pin + drop distill.pub dependency)"
```

---

### Task 3: Research index page + manifest (+ verify harness)

**Files:**
- Create: `research/index.json`
- Create: `research/index.html`
- Create: `docs/superpowers/verify/check.js`

**Interfaces:**
- Produces: `research/index.json` shape `{ "posts": [ { slug, title, authors[], date (ISO "YYYY-MM-DD"), summary, tags[], status } ] }` — consumed by `research/index.html` and by the human authoring workflow.
- Produces: `docs/superpowers/verify/check.js` — CLI `node check.js <url> [textToAssert]`; prints console errors, body text, and `d-article` shadow text; exits non-zero on any page/console error or if `textToAssert` is absent.

- [ ] **Step 1: Create the reusable render-check harness**

Create `docs/superpowers/verify/check.js`:
```js
// Headless render check. Usage: node check.js <url> [textToAssert]
// Exits 1 on any page/console error, or if textToAssert is given and not found.
const puppeteer = require('puppeteer-core');
(async () => {
  const url = process.argv[2];
  const needle = process.argv[3];
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  const body = await page.evaluate(() => document.body.innerText);
  const shadow = await page.evaluate(() => {
    const a = document.querySelector('d-article');
    return a && a.shadowRoot ? a.shadowRoot.textContent.slice(0, 600) : '(no d-article shadow)';
  });
  console.log('=== CONSOLE/PAGE ERRORS ===\n' + (errors.join('\n') || '(none)'));
  console.log('=== BODY TEXT (first 900) ===\n' + body.slice(0, 900));
  console.log('=== D-ARTICLE SHADOW (first 600) ===\n' + shadow);
  const combined = body + ' ' + shadow;
  const missing = needle && !combined.includes(needle);
  if (missing) console.log('=== MISSING ASSERTION: "' + needle + '" ===');
  await browser.close();
  process.exit(errors.length || missing ? 1 : 0);
})();
```

- [ ] **Step 2: Install puppeteer-core into the scratchpad (one-time)**

```bash
SP="/fs04/scratch2/ax74/smur0075/tmp/claude-17158/-fs04-ax74-smur0075-automated-w2s-research/1c2f993c-8082-434e-a4d5-a04349ec8556/scratchpad"
cd "$SP" && npm init -y >/dev/null 2>&1; npm install puppeteer-core >/dev/null 2>&1 && echo "puppeteer-core ready"
```
Expected: prints `puppeteer-core ready`. (node_modules stays in scratchpad — never committed.)

- [ ] **Step 3: Write the manifest with the first post**

Create `research/index.json`:
```json
{
  "posts": [
    {
      "slug": "collaborative-decoding",
      "title": "Laundering a Watermark by Collaborative Decoding",
      "authors": ["Sean Murphy"],
      "date": "2026-07-06",
      "summary": "An autonomous research agent asks whether a small unwatermarked model can launder a large watermarked model's output by writing most of the tokens itself — a living report on watermark dilution.",
      "tags": ["watermarking", "security", "autonomous-research"],
      "status": "live"
    }
  ]
}
```
(Title/summary are placeholder-quality; the user may adjust wording later — this is valid content to ship.)

- [ ] **Step 4: Write the failing render check for the index page**

There is no `research/index.html` yet. Serve and check it fails:
```bash
cd /fs04/ax74/smur0075/website && python3 -m http.server 8899 >/tmp/httpd.log 2>&1 &
SP="/fs04/scratch2/ax74/smur0075/tmp/claude-17158/-fs04-ax74-smur0075-automated-w2s-research/1c2f993c-8082-434e-a4d5-a04349ec8556/scratchpad"
NODE_PATH="$SP/node_modules" node docs/superpowers/verify/check.js "http://localhost:8899/research/index.html" "Laundering a Watermark"
```
Expected: FAIL (404/empty — file doesn't exist yet).

- [ ] **Step 5: Write the index page**

Create `research/index.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Research — Monash AI Alignment</title>
  <meta name="description" content="Research writeups and living reports from Monash AI Alignment." />
  <link rel="icon" type="image/x-icon" href="/assets/favicon.ico" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
  <style>
    .posts { max-width: var(--maxw); margin: 0 auto; padding: 8px 24px 64px; list-style: none; }
    .post-card { display: block; padding: 26px 0; border-top: 1px solid var(--border); text-decoration: none; color: inherit; }
    .post-card:last-child { border-bottom: 1px solid var(--border); }
    .post-card:hover { text-decoration: none; }
    .post-card:hover .post-title { color: var(--accent); }
    .post-title { font-size: 1.3rem; font-weight: 600; margin: 0 0 6px; color: var(--text); letter-spacing: -0.01em; line-height: 1.25; }
    .post-meta { font-size: 0.85rem; color: var(--text-mute); margin: 0 0 10px; }
    .post-summary { margin: 0 0 14px; color: var(--text-dim); }
    .tags { display: flex; gap: 8px; flex-wrap: wrap; }
    .tag { font-size: 0.72rem; padding: 3px 10px; border-radius: 999px; background: #eef4f8; color: var(--accent-dark); }
    .posts .empty { color: var(--text-mute); padding: 26px 0; border-top: 1px solid var(--border); }
  </style>
</head>
<body>
  <header class="nav">
    <a class="brand" href="/" aria-label="Monash AI Alignment"><img src="/assets/logo-blue.svg" alt="Monash AI Alignment" /></a>
  </header>
  <main>
    <section class="section">
      <h2>Research</h2>
      <p>Writeups and living reports from the group.</p>
    </section>
    <ul class="posts" id="posts"><li class="empty">Loading…</li></ul>
  </main>
  <footer>
    <div class="foot-row">
      <p>&copy; <span id="year"></span> Monash AI Alignment</p>
      <p class="muted"><a href="/">Home</a></p>
    </div>
  </footer>
  <script>
    const yEl = document.getElementById("year"); if (yEl) yEl.textContent = new Date().getFullYear();
    const fmtDate = iso => new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" });
    (async function render() {
      const list = document.getElementById("posts");
      try {
        const res = await fetch("/research/index.json", { cache: "no-store" });
        const data = await res.json();
        const posts = (data.posts || [])
          .filter(p => p.status !== "draft")
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        if (!posts.length) { list.innerHTML = '<li class="empty">No posts yet.</li>'; return; }
        list.textContent = "";
        for (const p of posts) {
          const card = document.createElement("a");
          card.className = "post-card";
          card.href = "/research/" + p.slug;
          const h = document.createElement("h3"); h.className = "post-title"; h.textContent = p.title;
          const meta = document.createElement("p"); meta.className = "post-meta";
          meta.textContent = (p.authors || []).join(", ") + (p.date ? " · " + fmtDate(p.date) : "");
          const sum = document.createElement("p"); sum.className = "post-summary"; sum.textContent = p.summary || "";
          const tags = document.createElement("div"); tags.className = "tags";
          for (const t of (p.tags || [])) { const s = document.createElement("span"); s.className = "tag"; s.textContent = t; tags.appendChild(s); }
          card.append(h, meta, sum, tags);
          list.appendChild(card);
        }
      } catch (e) {
        list.innerHTML = '<li class="empty">Could not load posts.</li>';
      }
    })();
  </script>
</body>
</html>
```

- [ ] **Step 6: Run the render check — expect PASS**

```bash
SP="/fs04/scratch2/ax74/smur0075/tmp/claude-17158/-fs04-ax74-smur0075-automated-w2s-research/1c2f993c-8082-434e-a4d5-a04349ec8556/scratchpad"
NODE_PATH="$SP/node_modules" node docs/superpowers/verify/check.js "http://localhost:8899/research/index.html" "Laundering a Watermark"
```
Expected: PASS (exit 0); body text shows the post title, authors, date, and the three tags; no console errors.

- [ ] **Step 7: Commit**

```bash
cd /fs04/ax74/smur0075/website
git add research/index.json research/index.html docs/superpowers/verify/check.js
git commit -m "feat: /research index page + post manifest + render-check harness"
```

---

### Task 4: Post template

**Files:**
- Create: `research/_template.html`

**Interfaces:**
- Consumes: `assets/distill.template.v2.js` (Task 2).
- Produces: the skeleton authors copy to `research/<slug>.html`.

- [ ] **Step 1: Write the failing render check**

```bash
SP="/fs04/scratch2/ax74/smur0075/tmp/claude-17158/-fs04-ax74-smur0075-automated-w2s-research/1c2f993c-8082-434e-a4d5-a04349ec8556/scratchpad"
NODE_PATH="$SP/node_modules" node docs/superpowers/verify/check.js "http://localhost:8899/research/_template.html" "Post Title Goes Here"
```
Expected: FAIL (file doesn't exist).

- [ ] **Step 2: Write the template**

Create `research/_template.html`:
```html
<!doctype html>
<!--
  HOW TO ADD A RESEARCH POST
  1. Copy this file:  cp research/_template.html research/<slug>.html
  2. Fill in every <!-- EDIT --> marker below (title, authors, abstract, body, bibliography).
  3. Add an entry for the post to research/index.json:
       { "slug": "<slug>", "title": "...", "authors": ["..."], "date": "YYYY-MM-DD",
         "summary": "one-two sentences", "tags": ["..."], "status": "live" }
  4. Commit + push. It goes live at /research/<slug> and appears on /research.
  Distill docs: https://distill.pub/guide/  ·  Math is KaTeX ($…$ / $$…$$). Citations use <d-cite key="...">.
-->
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- EDIT: page <title> -->
  <title>Post Title Goes Here — Monash AI Alignment</title>
  <script src="/assets/distill.template.v2.js"></script>
</head>
<body>
  <!-- Monash header bar (keep) -->
  <div style="max-width:960px;margin:0 auto;padding:16px 24px 0;font-family:'Inter',system-ui,sans-serif">
    <a href="/research" style="color:#006dae;text-decoration:none;font-size:14px">← Monash AI Alignment · Research</a>
  </div>

  <d-front-matter>
    <script type="text/json">{
      "title": "Post Title Goes Here",
      "description": "One-sentence description for previews.",
      "authors": [ { "author": "Your Name", "authorURL": "" } ],
      "katex": { "delimiters": [ {"left": "$", "right": "$", "display": false}, {"left": "$$", "right": "$$", "display": true} ] }
    }</script>
  </d-front-matter>

  <d-title>
    <!-- EDIT: title + one-line tagline -->
    <h1>Post Title Goes Here</h1>
    <p>A one-line tagline for the post.</p>
  </d-title>

  <d-byline></d-byline>

  <d-article>
    <!-- EDIT: abstract / intro -->
    <p>Write the opening here. Inline math like $a^2 + b^2 = c^2$ and display math:</p>
    $$ \text{recovery} = \frac{U_\text{collab}}{U_\text{strong}} $$

    <h2>Section</h2>
    <p>Body text. Cite sources like this <d-cite key="example2020"></d-cite>.</p>
  </d-article>

  <d-appendix>
    <h3>References</h3>
    <d-bibliography></d-bibliography>
  </d-appendix>

  <!-- EDIT: bibliography — MUST be type="text/bibtex" -->
  <script type="text/bibtex">
    @article{example2020,
      title={An example reference},
      author={Doe, Jane},
      journal={Journal of Examples},
      year={2020}
    }
  </script>
</body>
</html>
```

- [ ] **Step 3: Run the render check — expect PASS**

```bash
SP="/fs04/scratch2/ax74/smur0075/tmp/claude-17158/-fs04-ax74-smur0075-automated-w2s-research/1c2f993c-8082-434e-a4d5-a04349ec8556/scratchpad"
NODE_PATH="$SP/node_modules" node docs/superpowers/verify/check.js "http://localhost:8899/research/_template.html" "Post Title Goes Here"
```
Expected: PASS; the `d-article` shadow text includes the section/body; no console errors (confirms Distill + KaTeX + bibtex parse cleanly).

- [ ] **Step 4: Commit**

```bash
cd /fs04/ax74/smur0075/website
git add research/_template.html
git commit -m "feat: zero-build Distill post template with authoring instructions"
```

---

### Task 5: Migrate the collab-decoding writeup + findings feed

Copy the two pages from the collab-decoding repo and repoint Distill + data URLs. No redesign.

**Files:**
- Create: `research/collaborative-decoding.html` (from `/fs04/ax74/smur0075/automated-w2s-research/docs/index.html`)
- Create: `research/collaborative-decoding-findings.html` (from `.../docs/explore.html`)

**Interfaces:**
- Consumes: `assets/distill.template.v2.js` (Task 2); the jsDelivr data URLs (Global Constraints).

- [ ] **Step 1: De-risk jsDelivr availability for the org repo**

```bash
curl -s -o /dev/null -w "data.json %{http_code}\n" "https://cdn.jsdelivr.net/gh/Monash-AI-Alignment/collaborative-decoding@main/docs/data.json"
curl -s -o /dev/null -w "watermarks.json %{http_code}\n" "https://cdn.jsdelivr.net/gh/Monash-AI-Alignment/collaborative-decoding@main/docs/watermarks.json"
```
Expected: both `200`. (Already verified during planning; re-confirm before wiring.)

- [ ] **Step 2: Copy both source pages verbatim**

```bash
cd /fs04/ax74/smur0075/website
cp /fs04/ax74/smur0075/automated-w2s-research/docs/index.html   research/collaborative-decoding.html
cp /fs04/ax74/smur0075/automated-w2s-research/docs/explore.html research/collaborative-decoding-findings.html
```

- [ ] **Step 3: Repoint the Distill script to the vendored copy (writeup)**

In `research/collaborative-decoding.html`, replace:
```html
<script src="https://distill.pub/template.v2.js"></script>
```
with:
```html
<script src="/assets/distill.template.v2.js"></script>
```

- [ ] **Step 4: Repoint the two data fetches to jsDelivr (writeup)**

In `research/collaborative-decoding.html`, replace:
```js
const r = await fetch("./data.json", { cache: "no-store" });
```
with:
```js
const r = await fetch("https://cdn.jsdelivr.net/gh/Monash-AI-Alignment/collaborative-decoding@main/docs/data.json", { cache: "no-store" });
```
and replace:
```js
fetch("./watermarks.json", { cache: "no-store" })
```
with:
```js
fetch("https://cdn.jsdelivr.net/gh/Monash-AI-Alignment/collaborative-decoding@main/docs/watermarks.json", { cache: "no-store" })
```

- [ ] **Step 5: Repoint the findings-feed data fetch to jsDelivr**

In `research/collaborative-decoding-findings.html`, replace:
```js
const d = await (await fetch("./data.json", { cache: "no-store" })).json();
```
with:
```js
const d = await (await fetch("https://cdn.jsdelivr.net/gh/Monash-AI-Alignment/collaborative-decoding@main/docs/data.json", { cache: "no-store" })).json();
```

- [ ] **Step 6: Add the Monash header bar to the writeup**

In `research/collaborative-decoding.html`, immediately after the opening `<body>` tag, insert:
```html
<div style="max-width:960px;margin:0 auto;padding:16px 24px 0;font-family:'Inter',system-ui,sans-serif">
  <a href="/research" style="color:#006dae;text-decoration:none;font-size:14px">← Monash AI Alignment · Research</a>
  <span style="color:#888;font-size:14px"> · </span>
  <a href="/research/collaborative-decoding-findings" style="color:#006dae;text-decoration:none;font-size:14px">Findings feed →</a>
</div>
```

- [ ] **Step 7: Render-check the writeup — charts must populate from live data**

```bash
SP="/fs04/scratch2/ax74/smur0075/tmp/claude-17158/-fs04-ax74-smur0075-automated-w2s-research/1c2f993c-8082-434e-a4d5-a04349ec8556/scratchpad"
NODE_PATH="$SP/node_modules" node docs/superpowers/verify/check.js "http://localhost:8899/research/collaborative-decoding.html" "seamgate"
```
Expected: PASS (exit 0). Console/page errors `(none)`. Body/shadow text includes leaderboard/finding content (e.g. `seamgate`), confirming the jsDelivr fetch succeeded and the dashboard rendered. If you see `Could not load data.json`, the fetch URL is wrong — recheck Step 4.

- [ ] **Step 8: Render-check the findings feed**

```bash
SP="/fs04/scratch2/ax74/smur0075/tmp/claude-17158/-fs04-ax74-smur0075-automated-w2s-research/1c2f993c-8082-434e-a4d5-a04349ec8556/scratchpad"
NODE_PATH="$SP/node_modules" node docs/superpowers/verify/check.js "http://localhost:8899/research/collaborative-decoding-findings.html"
```
Expected: PASS (exit 0), no console errors, findings content visible.

- [ ] **Step 9: Screenshot the writeup for a visual sanity check**

Add a screenshot to the harness run (optional inline node), or reuse `check.js` and eyeball the body dump. At minimum confirm KPIs, the frontier chart, the leaderboard, and the watermark p-value chart all appear in the body text dump. Record the result.

- [ ] **Step 10: Commit**

```bash
cd /fs04/ax74/smur0075/website
git add research/collaborative-decoding.html research/collaborative-decoding-findings.html
git commit -m "feat: migrate collab-decoding writeup + findings feed (live data via jsDelivr)"
```

---

### Task 6: Home page — add a Research entry point

**Files:**
- Modify: `index.html` (the existing home page)

- [ ] **Step 1: Add a nav link and a hero CTA to `/research`**

In `index.html`, in the hero `.cta-row` (currently just "Our research ↓"), change the research CTA to point at the new page. Replace:
```html
<a class="btn primary" href="#research">Our research &darr;</a>
```
with:
```html
<a class="btn primary" href="/research">Read our research &rarr;</a>
<a class="btn ghost" href="#research">Research areas &darr;</a>
```

- [ ] **Step 2: Render-check the home page links to /research**

```bash
SP="/fs04/scratch2/ax74/smur0075/tmp/claude-17158/-fs04-ax74-smur0075-automated-w2s-research/1c2f993c-8082-434e-a4d5-a04349ec8556/scratchpad"
NODE_PATH="$SP/node_modules" node docs/superpowers/verify/check.js "http://localhost:8899/index.html" "Read our research"
# Also assert the href exists:
NODE_PATH="$SP/node_modules" node -e 'const p=require("puppeteer-core");(async()=>{const b=await p.launch({executablePath:"/usr/bin/chromium-browser",args:["--no-sandbox"]});const pg=await b.newPage();await pg.goto("http://localhost:8899/index.html",{waitUntil:"networkidle0"});const ok=await pg.evaluate(()=>!!document.querySelector('a[href="/research"]'));console.log("has /research link:",ok);await b.close();process.exit(ok?0:1)})()'
```
Expected: both PASS; `has /research link: true`.

- [ ] **Step 3: Commit**

```bash
cd /fs04/ax74/smur0075/website
git add index.html
git commit -m "feat: link the home page to the /research index"
```

---

### Task 7: Deploy and verify live

Only after every prior task's render check passes locally.

**Files:** none (deploy + verification).

- [ ] **Step 1: Stop the local server**

```bash
pkill -f "http.server 8899" 2>/dev/null; echo done
```

- [ ] **Step 2: Merge `research-posts` → `main`** (go-live from the default branch)

```bash
cd /fs04/ax74/smur0075/website
git checkout main && git merge --no-ff research-posts -m "feat: research posts site + collab-decoding writeup"
```

- [ ] **Step 3: Deploy the Worker**

```bash
cd /fs04/ax74/smur0075/website
CLOUDFLARE_API_TOKEN=$(cat ~/.cf_token) npx --yes wrangler deploy 2>&1 | tail -15
```
Expected: a successful deploy with a `*.workers.dev` URL and/or the custom domain. If the token lacks access to this Worker, stop and report — the user may need to confirm the Cloudflare project/deploy trigger (as with the collab-decoding worker).

- [ ] **Step 4: Verify live routing + data + hygiene**

```bash
BASE="https://monashaialignment.org"   # or the workers.dev URL from Step 3 if the custom domain isn't attached
for u in "/research" "/research/collaborative-decoding" "/research/collaborative-decoding-findings"; do
  echo -n "$u -> "; curl -s -o /dev/null -w "%{http_code}\n" "$BASE$u"
done
echo -n "/docs/superpowers/specs/2026-07-07-research-posts-site-design.md (must be 404) -> "
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/docs/superpowers/specs/2026-07-07-research-posts-site-design.md"
```
Expected: the three `/research…` routes `200`; the `/docs/…` path `404` (confirms `.assetsignore` works).

- [ ] **Step 5: Headless-render the LIVE writeup**

```bash
SP="/fs04/scratch2/ax74/smur0075/tmp/claude-17158/-fs04-ax74-smur0075-automated-w2s-research/1c2f993c-8082-434e-a4d5-a04349ec8556/scratchpad"
NODE_PATH="$SP/node_modules" node docs/superpowers/verify/check.js "https://monashaialignment.org/research/collaborative-decoding" "seamgate"
```
Expected: PASS; live dashboard populated from jsDelivr, KaTeX + citations rendered, no console errors.

- [ ] **Step 6: Push main**

```bash
cd /fs04/ax74/smur0075/website
git push origin main
```

---

## Out of scope for this plan (follow-ups, tracked in the spec)

- Wiring the autonomous loop (in the `collaborative-decoding` repo) to commit+push `docs/data.json` and `curl` the jsDelivr purge URL on each update — makes the dashboard near-real-time. Until then, the site shows the last-committed snapshot.
- Adding a `LICENSE` + safety-research attribution to the `collaborative-decoding` repo.
- τ-sweep operating points on the watermark chart.

## Self-Review

**Spec coverage:** template (Task 4) ✓; `/research` index + manifest (Task 3) ✓; migrated writeup w/ live jsDelivr data (Task 5) ✓; findings feed (Task 5) ✓; vendored Distill (Task 2) ✓; `.assetsignore` hygiene (Task 1) ✓; home entry point (Task 6) ✓; routing verified live (Task 7) ✓; data-update pipeline + LICENSE + τ-sweep explicitly deferred ✓. No spec section is unaddressed.

**Placeholder scan:** the manifest title/summary are real, shippable copy (flagged editable), not a TBD. No "handle errors"/"similar to Task N"/"write tests for the above" placeholders — every code step shows the code.

**Type consistency:** manifest keys (`slug/title/authors/date/summary/tags/status`) are identical in the schema, the seed data, and the index.html reader. Data URLs are byte-identical across Tasks 5 and Global Constraints. Vendored Distill path `/assets/distill.template.v2.js` matches in Tasks 2, 4, 5.
