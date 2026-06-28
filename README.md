# monashaialignment.org

Placeholder static site for Monash AI Alignment.

## Local preview

```bash
cd ~/projects/monash-aia-site
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy (Cloudflare Pages)

1. Push this folder to a GitHub repo (e.g. `monash-aialignment/website`).
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Build settings: leave **build command empty**, **output directory = `/`**.
4. After first deploy, Pages project → **Custom domains** → add `monashaialignment.org` and `www.monashaialignment.org`. Cloudflare auto-creates the records.

## Files

- `index.html` — single-page placeholder
- `styles.css` — dark theme, blue/violet accents, mobile-responsive
- `assets/logo.svg` — Monash AI Alignment wordmark (white-on-dark)

## Editing

Everything is plain HTML/CSS — no build step. Edit `index.html` to add events, members, links, etc. The `Soon` placeholder card in the Research section is a template for new threads.
