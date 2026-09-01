# Public Social Media Metrics Tracker

Log in, hand it a pile of Instagram / YouTube / Facebook links, get one table of public
metrics. The point is to avoid opening hundreds of posts by hand.

No campaigns, no brands, no CRM, no historical tracking.

## What it does

The dashboard has three sections, listed in the left sidebar:

- **Metrics** — add links, fetch metrics, browse and export the table. Headline totals sit
  at the top of this section, each labelled with how many links it came from.
- **Engagement** — recent-video averages and engagement rate, per account.
- **Discovery** — search a directory of Instagram creators by state, city, niche and
  follower range.

Adding a fourth is a matter of adding an entry to `src/lib/sections.ts` and a component;
the shell needs no other change.

1. **Sign up / log in** — email + password, session cookie.
2. **Provide links**, either way:
   - Paste a single URL, or many — one per line, comma separated, or any mix.
   - Upload `.csv`, `.tsv`, `.txt`, `.xlsx`, `.xlsm` — every sheet and every cell is
     scanned, so URLs can sit in any column. A creator column is optional.
3. **Detect** — identifies the platform, removes duplicates, and shows per-platform counts
   before anything is fetched.
4. **Process** — fetches real public metrics in bulk.
5. **Results** — Platform, Creator, URL, Views, Likes, Comments, Shares, Post date, with
   search, platform filter, sorting and pagination.
6. **Creator stats** (optional) — for each creator in the results, the average of their
   last 10 videos plus the account's engagement rate.
7. **Refresh All** — re-fetches without re-uploading or re-pasting.
8. **Export** — CSV or Excel.

## Quick start

```bash
npm install
cp .env.example .env
npm run db:up        # Postgres on localhost:5434
npm run db:migrate   # create the User table
```

Generate a session key and put it in `.env` as `APP_SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Then add at least one data provider (see below) and start it:

```bash
npm run dev     # http://localhost:3000
```

Click **Create one** on the login page to register the first account.

## Data providers — read this before expecting numbers

**Nothing is ever estimated, synthesised or defaulted to zero.** A metric that cannot be
retrieved shows `N/A` with the reason attached, in the table and in exports. There is no
demo mode.

What is actually obtainable for content you do **not** own differs sharply per platform:

| Platform | Official API | What you get |
| --- | --- | --- |
| YouTube | Data API v3 (`YOUTUBE_API_KEY`) | **Works fully.** Any public video: views, likes, comments, publish date, channel. |
| Instagram | Business Discovery (`INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`) | **Partial.** Views, likes, comments, date — but only for public Business/Creator accounts, and only when the creator's username is known. No shares. |
| Facebook | Graph API (`FACEBOOK_ACCESS_TOKEN`) | **Owned Pages only.** No official endpoint returns metrics for a Page you do not manage. |

### Instagram: why it is only partial

Business Discovery is queried by **username**, not by post URL. It returns that account's
recent media, which the app matches back to your links by shortcode.

You never have to supply usernames yourself. The app resolves each post URL to its creator
automatically via Instagram's oEmbed endpoint (`INSTAGRAM_OEMBED_TOKEN`). A creator column
in the file is **optional** — when present it is used as a shortcut and saves a lookup.

Remaining limits:

- Personal and age-gated accounts are excluded by Meta — Business/Creator only.
- Only recent media is reachable; older posts fall outside the paginated window.
- Shares and saves are not exposed. Rate limit is 1,000 queries per hour.
- If oEmbed cannot resolve a URL, the row shows `N/A` with that reason rather than guessing.

### Facebook: why the official API cannot do it

Meta restricts video and reel insights to a Page access token issued to someone holding the
`ANALYZE` task on that specific Page. Page Public Content Access returns metadata, not
performance metrics. So arbitrary public Facebook URLs are not obtainable officially, at
all.

### Third-party provider (optional, off by default)

To read arbitrary public Instagram and Facebook URLs, configure an Apify actor:

```
APIFY_TOKEN=...
APIFY_INSTAGRAM_ACTOR=data-slayer~instagram-post-details
APIFY_FACEBOOK_ACTOR=clappi~facebook-posts-reels-scraper
```

These actors read public pages rather than calling an authorised platform API, which Meta's
terms restrict, and they bill per result. **Review the provider's terms and your own legal
position before enabling this.** It is never switched on implicitly — no token, no calls.

Each actor expects URLs under a different input key, so the shapes are hard-coded in
`src/lib/providers/public-data.ts`. Swapping in an actor that is not listed there falls back
to a generic `startUrls` input, which many actors reject; adding one usually means adding its
input shape as well.

Two Facebook actors were compared. `apify~facebook-posts-scraper` returns metrics only while
crawling a Page feed and returns nothing for a direct `/reel/` URL, so it is unsuitable here.
`clappi~facebook-posts-reels-scraper` accepts post, reel and `/share/` URLs directly and
returns views, likes, comments and shares, which is why it is the documented default.

`src/lib/providers/public-data.ts` normalises the common actor output field names, so
swapping actors is usually a config change rather than a code change.

### Metric availability

| Metric | Instagram | YouTube | Facebook |
| --- | --- | --- | --- |
| Views | Business Discovery or third-party | Yes | Owned Page or third-party |
| Likes | Business Discovery or third-party | Yes | Owned Page or third-party |
| Comments | Business Discovery or third-party | Yes | Owned Page or third-party |
| Shares | N/A | N/A (YouTube Analytics is owner-only) | Owned Page or third-party |
| Post date | Yes | Yes | Yes |

Short Facebook links (`fb.watch`, `/share/`) are detected and listed, but carry no content
id, so they report `N/A` rather than being silently dropped.

## Creator stats

Alongside the per-link table, each distinct creator can be summarised: follower count,
average views / likes / comments over their **last 10 videos**, and an engagement rate of

```
(avg likes + avg comments) ÷ followers
```

Views are deliberately left out of that numerator. A reel's reach is dominated by how far
the algorithm pushed it, so including views would measure distribution rather than how
engaged the account's own audience is.

This is behind a **Get creator stats** button rather than running automatically, because
Instagram costs one provider lookup per creator (two, with follower counts). Lookups are
per creator, not per link, so fifty links from five creators cost five lookups. Results are
cached for the session and included in both exports — extra columns on the results sheet,
plus a dedicated **Creators** sheet in the Excel file.

| Platform | Source | Cost |
| --- | --- | --- |
| YouTube | Official Data API — `channels.list`, `playlistItems.list`, `videos.list` | 3 quota units per batch, against 10,000/day |
| Instagram | `APIFY_INSTAGRAM_REELS_ACTOR` + `APIFY_INSTAGRAM_PROFILE_ACTOR` | Billed per creator |
| Facebook | Not supported | — |

Facebook is absent on purpose: no actor reliably exposes Page follower counts and recent
reels together, and a half-built engagement rate would be worse than saying nothing.

### Instagram view counts, and why the actor matters

Instagram reports two different numbers for the same reel: `videoPlayCount` (every play,
replays included) and the much smaller legacy `videoViewCount` (3-second views). For one
NASA reel these were 2,673,147 and 392,454 respectively. Instagram's own UI labels the
former "views", so that is what this app reports — otherwise the figure would not match
what the creator sees, and would vary depending on which field a given actor returned.

The numbers were verified against Instagram's own `metrics` object for a public reel:

| | Instagram `metrics` | This app |
| --- | --- | --- |
| `play_count` | 6,579,473 | 6,579,473 |
| `like_count` | 146,135 | 146,135 |
| `comment_count` | 994 | 994 |
| `share_count` | 5,067 | 5,067 |

`data-slayer~instagram-post-details` is the documented default because it returns that whole
object, **including share counts**. `apify~instagram-scraper` also works and is still
supported, but omits shares, so Instagram rows show `N/A` for them.

## Creator discovery

Search a directory of Instagram creators by **state**, **city**, **category/niche** and
**follower range**.

### Why this is a directory you upload, and not a search

Instagram publishes no structured location or category for an account. There is no API
field for "state", none for "city", and none for "niche" — not in the Graph API, and not in
anything a scraper can read reliably. A bio sometimes says "Patna", often does not, and
never says "Lifestyle".

So those three facts can only come from a source that already knows them. This app takes
that source to be a sheet you maintain, which means every filter result is something you
can stand behind. The alternative — guessing a creator's city from their bio — would put
invented data next to the real metrics everywhere else in this app, and there would be no
way for anyone reading the screen to tell which was which.

### Importing

**Discovery → Import sheet.** Same formats as the metrics upload: `.csv`, `.tsv`, `.txt`,
`.xlsx`, `.xlsm`. Every tab in the workbook is read.

Only a username column is required. Headers are matched by name, not position, and a
generous set of spellings is accepted:

| Field | Headers recognised (among others) |
| --- | --- |
| Username | `INSTA`, `IG`, `Instagram Handle`, `Username`, `Profile URL`, `Link` |
| Name | `Influencer Name`, `Creator Name`, `Full Name`, `Name` |
| State | `State`, `Province`, `Region` |
| City | `City`, `Town`, `District`, `Location` |
| Category | `Category`, `Niche`, `Genre`, `Vertical`, `Industry` |
| Followers | `Followers`, `Follower Count`, `Audience Size`, `Reach` |

Anything else — an agency column, a phone number — is kept in `notes` rather than dropped.

### Sheets that are not one clean table

A maintained influencer sheet rarely is. A single tab commonly stacks several tables,
separated by blank rows, each repeating a header with a different set of columns — one
block with a language column, another further down without it.

So every row is tested as a possible header, and the most recent header governs the rows
beneath it. Reading only the first row would import one block and silently drop the rest,
which is how a 5,000-row workbook becomes 84 creators.

A row counts as a header when it names a username column **and** at least one other known
field. Both conditions matter: without the first, the block cannot seed the directory;
without the second, a stray data cell reading "instagram" would be mistaken for a header and
swallow every row under it.

After each import the app reports, per tab, how many tables it found and how many creators
came out — plus a warning when a filterable field was never labelled anywhere in the file.
Coverage gaps are then visible immediately rather than discovered weeks later.

### Messy cells

- Handles arrive as `name`, `@name`, `name/`, a full profile URL, or — when the cell is
  linked — as display text followed by the URL. All are read. Post and reel URLs are
  rejected, since they identify content rather than an account.
- A cell that is not wholly a handle and contains no `@` or URL is skipped rather than
  guessed at. Taking the first word of `not a handle!` would import a creator called `not`.
- Follower counts read `45000`, `45,000`, `1,20,000`, `45k`, `1.2M` and `10K+`. Anything
  unreadable becomes `N/A`, never `0` — a zero would rank the creator at the bottom of every
  range filter as though it were a fact.
- `patna`, `Patna` and `PATNA` all become `Patna`, so the city appears once in the dropdown
  instead of three times, each matching a third of the rows. State abbreviations (`UP`) and
  a short list of acronyms (`NCR`, `UGC`) stay upper-case; longer all-caps words are
  title-cased, so `GOA` does not sit in the filter beside `Goa` as a separate place.

### Keeping states and cities in their own columns

Sheets kept by several people do not hold the two apart, and the result is a State filter
listing cities and a City filter listing states. Three things go wrong, and `resolvePlace`
in `src/lib/directory/normalise.ts` handles all of them against a list of India's states
and major cities in `src/lib/directory/india.ts`:

- **A city typed under State**, or a state typed under City. `CHENNAI` in the State column
  is recognised as a city and moved across.
- **Both in one cell**, as `Mumbai, Maharashtra`. The cell is split and each half filed.
- **A block with a City column and no State column at all** — common when a tab covers one
  region. The state is derived from the city: Chennai gives Tamil Nadu, Patna gives Bihar.

A state your sheet *does* name is never overruled — someone based in Noida but listed under
Delhi stays under Delhi. Derivation only fills a blank, and the import report says how many
it filled, so it is visible rather than silent.

Abbreviations and former names resolve to one entry (`UP`, `TN`, `Orissa`, `Pondicherry`),
as do renamed cities — `Bangalore` and `Bengaluru`, `Gurgaon` and `Gurugram`, `Allahabad`
and `Prayagraj` — so each place appears once in the dropdown instead of splitting its
creators across two.

City names that two states share (`Aurangabad`, `Bilaspur`, `Hamirpur`) are deliberately
left out of the lookup. Guessing one would file half those creators under the wrong state,
which is worse than leaving the state blank.

### Re-importing

Rows are keyed on username, so uploading a corrected or extended sheet updates in place
instead of creating duplicates. A field is only overwritten when the new sheet actually has
a value for it — so a partial upload of just handles and follower counts enriches the
directory rather than blanking everyone's city.

The directory is shared across all users. It is one dataset the team maintains, and a
per-user copy would mean re-uploading the same 10,000 rows for every account.

### Categories as tags

Sheets write a creator's category as a run-on — `Fashion/lifestyle/ugc`, `Lifestyle/blog`,
`City Page (pune)`. Stored whole, each spelling becomes its own filter option: one real
sheet produced 146 categories for 4,325 creators, so picking "Lifestyle" returned the 116
typed that exact way and missed the 1,400 typed `Fashion/lifestyle`.

Import splits on `/`, `,`, `&` and `and`, drops a parenthetical city that repeats the city
column, and maps known spellings (`Citypage`, `Comedian`, `Food Vlogger`) to one name.
A creator carries every tag that applies, so "Lifestyle" finds all of them. The dropdown
lists each category once, ordered by how many creators it would return, with that count
shown next to the name.

### Filtering

The dropdowns are built from the values that actually exist in the directory, and the city
list narrows to the chosen state. You cannot select "Bihar + Mumbai" and get an empty screen
with no explanation, because that pairing is never offered.

Follower presets follow the industry bands — Nano (under 10K), Micro (10K–100K), Mid
(100K–500K), Macro (500K–1M), Mega (1M+). Filtering and paging run in Postgres, so a
directory of tens of thousands of rows stays responsive. Follower counts on the cards are
the exact stored number, never a rounded `1.2M`.

### Sheet counts versus the live count

A maintained sheet holds whatever was true the day someone typed it, and it is nearly always
rounded — `309k` where the profile says 309,412. That is close enough to filter on and wrong
on a card, where the user is comparing against the number Instagram is showing them right now.

So every card labels its own figure. **From sheet** is the uploaded value; clicking it fetches
the exact count from Instagram, and the label becomes **Live** with the time of the check in
its tooltip. The header button does the same for every unchecked creator on the page at once.

It is a click rather than something automatic because each lookup is a billed actor call
(`APIFY_INSTAGRAM_PROFILE_ACTOR`); refreshing a 5,000-row directory on load would be 5,000 of
them. For the same reason a refresh covers one screenful at a time, so the cost is always
visible in what is on screen.

Two rules keep the number trustworthy afterwards:

- A creator the actor could not read — private, renamed, deleted — keeps its sheet figure and
  reports why. Blanking it would turn "we did not check" into "this creator has no audience",
  which looks identical on a card and is the more expensive mistake.
- A later import never overwrites a live count with a sheet one. `followersSource` records
  where the stored number came from, and the upsert skips any row already marked `live`.

Only one number is ever stored, so filtering, sorting and the card all agree; there is never a
second figure to reconcile.

## Accounts and security

Users live in Postgres (`User` table). Passwords are bcrypt hashes at cost 12; plaintext is
never stored or logged.

- **Signup is open** — anyone who can reach the app can register. Put it behind SSO, a VPN,
  or a domain allowlist before exposing it.
- **Passwords** must be at least 12 characters, enforced server-side.
- **Rate limits**: 5 signups per IP per hour, 10 logins per IP per 15 minutes. These are
  in-process, so they protect one instance only — see the `x-forwarded-for` caveat in
  `src/lib/rate-limit.ts`.
- **No account enumeration**: wrong password and unknown email return the same message and
  take the same time.
- **Sessions** are signed cookies (HMAC-SHA256, `httpOnly`, `sameSite=lax`, `secure` in
  production, 12h expiry). Results are keyed by session, so users never see each other's data.

There are no roles.

## Architecture

```
prisma/schema.prisma       User + Creator (directory) + WorkSession tables
src/
  app/
    signup/ login/         Auth pages
    dashboard/             Metrics | Engagement | Discovery
    api/
      auth/…               Signup, login, logout
      upload               Scan a workbook, detect links
      urls                 Direct pasted-URL input
      process              Fetch metrics (also serves "Refresh All")
      creators             Account-level stats, on demand
      results              Restore session state on reload
      export               CSV / XLSX download
      directory            Filtered creator search + dropdown values
      directory/import     Import a creator sheet into the directory
  components/
    dashboard/             One component per sidebar section
  lib/
    detect.ts              URL extraction, platform ID, canonicalisation, dedupe
    parse.ts               Excel + CSV reading across all sheets
    metrics.ts             Per-platform provider chain, official first
    providers/             youtube | instagram | facebook | public-data
    creators/              Account-level averages and engagement rate
    directory/             Column mapping, normalisation, import, query
    store.ts               Per-login Metrics/Engagement work (Postgres)
    export.ts              CSV + XLSX writers
```

Each platform has a provider **chain**: the official API is tried first, and the
third-party provider is only reached when the official one is unconfigured or returns
nothing. That is what makes YouTube work with zero third-party cost.

**Detected links and their metrics** live in `WorkSession`, keyed by the login cookie. That
is what makes "Refresh All" work without a re-upload, and what lets a reload restore the
table. Held in Postgres, not process memory, because a Vercel deploy is many short-lived
instances that do not share a `Map`. Logout deletes the row. Rows older than 12 hours are
evicted on the next write.

**Accounts and the creator directory** are also in Postgres, and they outlive any one login.
The directory is the team's dataset — losing 5,000 creators on logout would mean re-uploading
the sheet every session. Refresh, logout and a server restart all leave it in place.

| Data | Survives refresh | Survives logout | Survives restart / Vercel |
| --- | --- | --- | --- |
| Accounts | yes | yes | yes |
| Creator directory (the sheet) | yes | yes | yes |
| Metrics / Engagement work | yes | no | yes |
| Open sidebar section | yes (URL) | no | n/a |

## Deploying on Vercel

The free Hobby plan is enough, but the database cannot live on Vercel. Its functions cannot
run Postgres and do not share memory between invocations, so `User`, `Creator` and
`WorkSession` all need an external Postgres. [Neon](https://neon.tech) has a free tier that
gives you one `DATABASE_URL`.

Do not put the directory or the session work in Vercel KV or an in-memory store — both empty
on every cold start, which is the bug this design exists to avoid.

### 1. Put this folder in its own git repository

The repo must have `package.json` at its root. If `simple-tracker/` currently sits inside a
larger repo alongside another project, either give it its own repo or set **Root Directory**
to `simple-tracker` in Vercel's project settings.

```bash
cd simple-tracker
git init
git add .
git commit -m "Public social media metrics tracker"
```

Check before pushing that `.env` is not in the commit — `.gitignore` covers it, and
`.env.example` must never hold a real key.

Push to GitHub, GitLab or Bitbucket.

### 2. Create the database

Sign up at [neon.tech](https://neon.tech), create a project, and copy **both** connection
strings Neon offers. They differ only by `-pooler` in the host:

```
pooled:  postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
direct:  postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

Both are needed, for opposite reasons. The running app uses the pooled one, because
serverless functions open a connection per invocation and a direct connection runs out of
slots under any real traffic. Migrations use the direct one, because they take advisory
locks and run DDL, and a transaction pooler drops both — `prisma migrate deploy` over the
pooled URL hangs or fails with a lock error.

### 3. Generate a session secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 4. Import the project into Vercel

At [vercel.com/new](https://vercel.com/new), pick the repository. Framework detection finds
Next.js on its own; leave the build and output settings alone.

### 5. Set the environment variables

Under **Settings → Environment Variables**, add these for Production (and Preview, if you
want preview deploys to work):

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the Neon **pooled** string — host has `-pooler` |
| `DIRECT_DATABASE_URL` | the Neon **direct** string — same, without `-pooler` |
| `APP_SESSION_SECRET` | the string from step 3 |
| `MAX_UPLOAD_MB` | `4` — see the size limit below |
| `YOUTUBE_API_KEY` | your Google Cloud key |
| `APIFY_TOKEN` | only if you want Instagram and Facebook metrics |
| `APIFY_INSTAGRAM_ACTOR` | `data-slayer~instagram-post-details` |
| `APIFY_FACEBOOK_ACTOR` | `clappi~facebook-posts-reels-scraper` |
| `APIFY_INSTAGRAM_REELS_ACTOR` | `apify~instagram-reel-scraper` |
| `APIFY_INSTAGRAM_PROFILE_ACTOR` | `apify~instagram-profile-scraper` |

`APP_SESSION_SECRET`, `DATABASE_URL` and `DIRECT_DATABASE_URL` are the required ones. The
app starts without the rest; every metric simply reads `N/A` with the reason shown.

Miss one of the required three and the build fails at `prisma migrate deploy` with
`DATABASE_URL resolved to an empty string` — Vercel does not inherit anything from your
local `.env`, which is never committed.

### 6. Deploy

Press **Deploy**. The build script runs `prisma migrate deploy` before `next build`, so the
tables are created on the first deploy and every later migration applies automatically.

If the build fails on `prisma migrate deploy`, `DATABASE_URL` is wrong or Neon is
unreachable — the message names which.

### 7. First run

Open the deployment URL, click **Create one**, and register. Signup is open to anyone who
can reach the URL, so either put Vercel Authentication in front of it (Settings →
Deployment Protection) or register your accounts and treat the URL as private.

Then open **Discovery** and upload your creator sheet.

### Limits worth knowing

**Uploads are capped at 4.5 MB.** Vercel rejects a larger request body before your code sees
it, and no setting changes that — not on any plan. A 10,000-row `.xlsx` is normally well under
a megabyte, so this rarely bites. Set `MAX_UPLOAD_MB=4` so the app refuses oversized files with
a clear message rather than letting Vercel return a bare `413` that the browser cannot explain.

For a sheet that genuinely is larger, import it from your own machine instead of the browser
(see [Importing a large sheet](#importing-a-large-sheet)). Splitting the file into a few
uploads also works — the import merges on username, so nothing is duplicated.

**Functions stop at 300 seconds** on Hobby, which is what `/api/process`,
`/api/creators` and `/api/directory/import` already declare. Fetching a few hundred links or
importing 10,000 rows fits comfortably. Several thousand links in one go will not — process
them in batches.

**Cold starts.** The first request after an idle period takes a few seconds while the
function and the Neon connection wake up. Nothing is lost; it is just slow once.

## Scripts

```bash
npm run dev          # dev server
npm run build        # production build
npm start            # serve the build
npm test             # unit tests (vitest)
npm run lint         # eslint
npm run db:up        # start Postgres
npm run db:migrate   # create/apply migrations (dev)
npm run db:studio    # browse the database

npm run import:creators -- sheet.xlsx   # load a sheet without the browser
```

### Importing a large sheet

The browser upload cannot carry more than a few megabytes, because the host refuses the
request before the app sees it. Your own machine has no such ceiling, so a first load of a
big directory goes in from the command line:

```bash
DATABASE_URL="<the Neon pooled URL>" npm run import:creators -- ~/Desktop/creators.xlsx
```

It prints which host it is writing to before it starts, so a sheet meant for your laptop
does not land in production by accident. Several files in one command are fine.

This runs the same parser and the same upsert as the web upload — the same column guessing,
the same state and category cleanup, the same merge on username. It is the identical code
path, deliberately, so the two can never disagree about what a sheet means. Only the
transport differs.

`samples/sample-links.csv` covers the awkward cases: two links in one cell, the same video
in three URL forms, a link with no scheme, a profile page, and an unsupported platform.

## Limits

- Signup is open; no email verification and no password reset.
- Uploads capped at `MAX_UPLOAD_MB` (default 15).
- Metrics are fetched on demand; no scheduler, no history.
- Instagram and Facebook coverage depends entirely on which provider you configure.
