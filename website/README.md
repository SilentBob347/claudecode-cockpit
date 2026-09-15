# Cockpit Website

Marketing site for Cockpit — deployed at [opencockpit.dev](https://opencockpit.dev).

## Stack

- Next.js 16 (App Router, **static export** via `output: 'export'`)
- React 19 + TypeScript
- TailwindCSS v4 (reuses the brand color tokens from the main app's `globals.css`)
- Deployed on **Cloudflare Pages** + a single Pages Function for root i18n redirect

## Pages

| Route | Purpose |
|---|---|
| `/` | Pages Function reads `Accept-Language` + `lang_pref` cookie → 302 to `/en/` or `/zh/` |
| `/en/`, `/zh/` | Homepage (Hero, three panel sections, Bubbles, Extras, Built-on, Final CTA) |
| `/en/docs/`, `/zh/docs/` | Quick start / install / first run / CLI reference |
| `/en/changelog/`, `/zh/changelog/` | GitHub Releases pulled at build time |

## Local dev

```bash
cd website
npm install
npm run dev          # → http://localhost:3458
```

The Pages Function isn't active in dev — visiting `/` triggers a tiny client-side
redirect (see `components/RootRedirect.tsx`). Visiting `/en/` or `/zh/` directly
gives the same UX as production.

## Build

```bash
npm run build        # fetches GitHub Releases, then static-exports to ./out
```

Output goes to `out/`. The pre-build step (`scripts/fetch-changelog.mjs`) writes
`data/changelog.json`. If the network is down, the script writes an empty array
so the build never fails.

To raise the GitHub API rate limit, set `GITHUB_TOKEN` in the build environment
(60 → 5000 requests/hour).

## Preview a production build locally

```bash
npm run preview      # uses wrangler to emulate Cloudflare Pages + Functions
```

## Deployment (GitHub Actions → Cloudflare Pages)

Deploys are driven by [`.github/workflows/website-deploy.yml`](../.github/workflows/website-deploy.yml).

**Trigger**: only when files under `website/**` (or the workflow file itself) change.
Pushes that touch only `src/`, `bin/`, `e2b/`, etc. do not trigger this workflow.

**Flow**:

| Event | Result |
|---|---|
| `push` to `main` (touching `website/**`) | Production deploy → `opencockpit.dev` |
| `pull_request` (touching `website/**`) | Preview deploy → unique URL, posted to PR |
| Manual `workflow_dispatch` | Production deploy of current branch |

### One-time setup — automated via `scripts/setup-cloudflare.sh`

A single script handles 4 of the 5 steps. The only manual step is creating the
Cloudflare API token (Cloudflare doesn't allow tokens to mint new tokens).

#### Step 1 (manual): create a Cloudflare API token

Cloudflare Dashboard → My Profile → API Tokens → **Create Token** → use the
"Edit Cloudflare Workers" template, or a custom token with:

- Account → Cloudflare Pages → Edit
- Account → Account Settings → Read

Copy the token value — you'll only see it once.

#### Step 2 (automated): run the bootstrap script

The script auto-loads `website/.env` (gitignored) if present, so the easiest
flow is:

```bash
cd website
cp .env.example .env       # then edit .env to fill in the two values
gh auth login              # if not already logged in
./scripts/setup-cloudflare.sh
```

Alternatively, pass the values inline:

```bash
CLOUDFLARE_API_TOKEN=… E2B_API_KEY=… ./scripts/setup-cloudflare.sh
```

The script is idempotent — safe to re-run. It:

1. Creates the `cockpit-website` Pages project (skipped if it already exists).
2. Uploads `E2B_API_KEY` as a runtime secret for `functions/try.ts`.
3. Attaches `opencockpit.dev` as a custom domain.
4. Pushes `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to your GitHub repo secrets.

After it finishes, push any commit that touches `website/**` and the workflow takes over.

#### Manual alternative (dashboard)

If you'd rather click through the dashboard:

| Step | Where | What |
|---|---|---|
| Create project | Cloudflare → Workers & Pages → Create → Pages → Direct Upload | Name: `cockpit-website` |
| Runtime secret | Pages → `cockpit-website` → Settings → Variables and Secrets | Add `E2B_API_KEY` |
| Custom domain | Pages → `cockpit-website` → Custom domains | Add `opencockpit.dev` |
| GitHub secrets | GitHub repo → Settings → Secrets → Actions | Add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` |

### Verifying

After the first push to `main`:

1. GitHub Actions tab → "Deploy Website" should be green.
2. The job summary shows the live deployment URL.
3. Visit `https://opencockpit.dev` → should hit the i18n redirect Function and land on `/en/` or `/zh/` based on browser language.

### Rolling back

Cloudflare Pages keeps every deployment. To roll back: Pages → Deployments → pick a previous build → "Rollback to this deployment". No git revert needed.

## Cloudflare Pages setup (manual reference)

When wiring this up in Cloudflare:

| Field | Value |
|---|---|
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `out` |
| Root directory | `/website` |
| Node version | `20` |

### Required environment variables

| Variable | Used by | Notes |
|---|---|---|
| `E2B_API_KEY` | `functions/try.ts` | Server-side secret. Get from [e2b.dev](https://e2b.dev). Without it, `/try` returns 503. |
| `GITHUB_TOKEN` | `scripts/fetch-changelog.mjs` | Optional. Raises GitHub API rate limit from 60 → 5000/hour during build. |

### How Functions are wired

The `functions/` directory is auto-detected by Cloudflare Pages.
`public/_routes.json` whitelists only `/`, `/try`, `/try/*` — every other URL
is served directly as a static asset, so Function invocations stay near zero.

| Path | Function | Purpose |
|---|---|---|
| `/` | `functions/index.ts` | i18n redirect (`Accept-Language` + `lang_pref` cookie → 302 to `/en/` or `/zh/`) |
| `/try` | `functions/try.ts` | E2B demo handler — confirmation page + sandbox creation. The entire demo flow lives under `opencockpit.dev`. (The legacy Vercel handler at `e2b/api/try.js` was retired; `e2b/` now only builds the sandbox template.) |

## i18n strategy

- All marketing content lives in `content/messages.ts` (single TypeScript file,
  no i18n framework — KISS).
- Each page generates `/en/...` and `/zh/...` static HTML at build time.
- A `LangSwitch` component lets users toggle and persists their choice via
  the `lang_pref` cookie.
- `<html lang>` is initially `"en"` (statically rendered) and updated to
  `"zh-CN"` on `/zh/*` pages by `components/LocaleSync.tsx`.

## Brand tokens

The CSS in `app/globals.css` mirrors the design tokens from the main app's
`src/app/globals.css` (Radix Teal-9 brand color, Slate gray scale). When the
brand evolves, update both files together.

## Adding screenshots

Drop PNG files in `public/screenshots/`:

- `agent.png`, `explorer.png`, `console.png` (4:3 aspect ratio, ~1600×1200)

The `PanelSection` component shows a placeholder card until the file exists,
so layout never breaks.

## SEO checks and sharing images

`npm run build` runs the SEO checks automatically after static export and image
creation. Run `npm run test:seo` to check an existing `out/` directory, and
`npm run typecheck` / `npm run lint` for TypeScript and ESLint.

The checks read every sitemap page's exported HTML and validate canonical URLs,
reciprocal en/zh/x-default alternates, unique titles/descriptions, one H1, document
language, indexability, page-specific social metadata, images and breadcrumbs.
Coverage requires both homepages, both documentation/blog indexes and at least
two details per section and locale. `/try` tests invoke the actual Pages Function
with network access stubbed: no test creates an E2B sandbox.

Blog cards are generated by `scripts/generate-blog-og.mjs` from the exported
English `og:title`, at `out/og/blog/<slug>.png` (1200 × 630). Both translations
share their article's English topic card; localized metadata and image alt text
remain page-specific. This avoids a runtime image endpoint, duplicated copy and
platform-dependent CJK fonts. Adding a post automatically adds its card. A title
that cannot fit the template fails the build instead of clipping silently. The
explicit `sharp` build dependency uses the version already in the lockfile.

`public/_headers` gives only `/_next/static/*` a one-year immutable cache lifetime.
Next versions these asset URLs. HTML, feeds, sitemap and unversioned images keep
Pages' normal revalidation. Pages Functions set their own response headers;
`_headers` does not apply to them. See [Cloudflare's header documentation](https://developers.cloudflare.com/pages/configuration/headers/).

`/try` is crawlable so search engines can read `noindex, nofollow` on the inert
confirmation page. Sandbox creation retains the bot filter, explicit confirmation
flow and visitor cooldown. The static fallback remains noindex and `/try` stays
out of the sitemap. See [Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

### September 2026 SEO verification

- Reproduced the documentation OG inheritance bug in the previous local export.
  The new checker failed at the wrong `og:url` before rebuilding.
- Passed all 90 sitemap pages: 2 homepages, 2 docs indexes, 52 docs details,
  2 blog indexes, 30 blog details and 2 changelogs.
- English blog titles, including the brand suffix: 43–60 characters; descriptions:
  118–144 characters. Length thresholds are review hints, not hard SEO rules.
- Generated and checked 15 PNG cards for all 30 translated blog pages; visually
  inspected the session search/delegation card for wrapping and clipping.
- Passed production build, ESLint, TypeScript and three demo safety tests covering
  human/crawler confirmation access, blocked bot creation and visitor cooldown.

Changed sources:

| Files | Purpose |
|---|---|
| `app/[locale]/docs/[...slug]/page.tsx` | Page-specific OG/Twitter metadata and visible breadcrumbs |
| `app/[locale]/blog/[slug]/page.tsx`, `components/Breadcrumbs.tsx` | Article cards and matching visible/JSON-LD breadcrumb trails |
| `content/posts.ts` | Concise English article titles and summaries |
| `app/robots.ts`, `functions/try.ts` | Crawlable noindex confirmation; creation protections retained |
| `app/layout.tsx` | Remove the inherited bilingual meta keywords list |
| `public/_headers` | Cache only versioned Next static assets as immutable |
| `scripts/generate-blog-og.mjs` | Generate article topic cards during postbuild |
| `scripts/check-seo.mjs`, `scripts/try.test.mjs` | Export invariants and demo regression tests |
| `package.json`, `package-lock.json`, `README.md` | Build wiring, explicit image dependency and maintenance notes |

After an authorized deployment, use Search Console URL Inspection on representative
English/Chinese docs and blog pages, submit the sitemap if needed, and verify that
Google can read `/try`'s noindex. Check actual CSS/JS response headers in Cloudflare:
external cache rules can override repository configuration. Confirm normal HTML
revalidation and the root language redirect, then refresh cached social previews
if a sharing service still shows the old image. No external settings are changed
by these source changes; local tests do not prove production edge behavior or
search-engine recrawl timing.
