# Nature Nest — backend API

Independent Express/MongoDB backend for the [website](https://github.com/prince62058/Resort-site) and [admin studio](https://github.com/prince62058/resort-admin). This repository has no React/Vite build or frontend bundles.

## Dokploy — exact build settings

| Setting | Value |
| --- | --- |
| Repository | `https://github.com/prince62058/Resort-backend.git` |
| Branch | `main` |
| Build Path | `/` (repository root, never `.git`) |
| Build Type | Nixpacks |
| Node | 22 (pinned by `engines.node` and `.nvmrc`) |
| Install | `npm ci --omit=dev` |
| Build | `npm run build` (checks backend source; no database needed) |
| Start | `npm start` |
| Container port | `5174` |

The repository-root `package.json` and `nixpacks.toml` let Nixpacks detect and start Node automatically. The `.git` directory is Git metadata, not application source; choosing it causes "unable to generate a build plan". A Dockerfile is also provided for the Dockerfile build type, with root context.

Set in Dokploy's Environment tab:

```dotenv
NODE_ENV=production
PORT=5174
MONGODB_URI=<your private Atlas connection string>
MONGODB_DB=nature_nest
MEDIA_BUCKET=resort_media
```

Allow the Dokploy server's outbound IP in Atlas Network Access. Reuse the existing database to retain the owner, images and published content. `ADMIN_SETUP_TOKEN` is only required for the first owner in a new database. Real `.env` files and credentials are excluded from Git and Docker builds. Startup reports missing MongoDB configuration clearly.

## Verify

`GET /` returns the API name. `GET /api/health` returns `{"ready":true,"media":"mongodb"}` when Atlas is connected, and 503 if MongoDB is unavailable/unconfigured. `/admin/` and website page routes return 404 here; open the separate admin/website apps instead.

## API and data

- `/api/content`: published content, route redirects and version.
- `/api/enquiries`: contact/reservation/newsletter submissions; protected admin inbox routes live under `/api/admin`.
- `/api/admin`: owner setup/login/session, drafts/publishing, uploads, revisions, enquiries and password changes. Session cookies, CSRF validation, same-origin checks and rate limiting are retained.
- `/api/media`, `/api/media/folders`, `/assets/<path>`, `/api/media/file/<path>`: existing MongoDB/GridFS images and folders.
- `/sitemap.xml`: public website URLs configured in the content; `/robots.txt` excludes the API host from indexing.

Uploaded images and content persist in MongoDB, so no container upload volume or repeat image upload is needed. The private admin/website Node gateways forward browser requests on their own origins. Do not call the backend admin API directly from an unrelated browser origin or add permissive wildcard CORS to bypass origin checks. Public admin sessions require HTTPS; internal gateway-to-backend traffic can use HTTP on Dokploy's private network.

## Development and tests

Node.js 22. `npm ci`, create a private `.env` from `.env.example`, then `npm run dev` on port 5174. `npm run build` checks source, and `npm test` tests schema/authentication, migrations, SEO helpers, media streaming, fallback and safe error handling.

For full verification, clone/build the site and admin as sibling `site/` and `admin/` directories, then `npm run test:integration`. Set `SITE_PROJECT_DIR`/`ADMIN_PROJECT_DIR` for alternate checkout paths. The test uses an isolated database and installed Chrome; it never edits the real site's content or owner account.

`npm run media:sync` and `npm run media:verify` are optional local maintenance commands. They read the sibling `site/public/assets` directory; set `MEDIA_SOURCE_DIR` to a different local image folder if needed. Existing Atlas images do not need re-uploading for this split.

[Complete deployment guide](https://github.com/prince62058/Resort-site/blob/main/DEPLOYMENT.md)

## Corner reels

Manage the floating reel cards in **Admin → Corner reels**. Add a public `https://www.instagram.com/reel/.../` link, title and a cover from the media library. Enable/disable individual reels or the entire widget, reorder up to six entries, then use **Save draft** or **Publish changes**. Two covers appear at a time in the bottom-left corner; visitors can minimize them for the current browsing session. The widget hides while the footer or booking/menu overlay is visible so guest controls stay reachable.

Instagram is loaded only after the visitor opens a reel. The full-size dialog has previous/next controls, an Instagram fallback link, keyboard dismissal and mobile sizing. Instagram controls its own embed playback and may require a second tap, login or opening Instagram. Public content must allow embedding. Cover photos are manually selected; they are not automatically fetched Instagram thumbnails.

For an actual moving miniature preview, enter the original video's **direct HTTPS MP4/WebM URL** in the optional field. This enables a muted looping preview and a native video player with controls. Preview motion pauses with the site's motion control, reduced-motion preference or hidden tab. An unavailable video falls back to Instagram. No Instagram downloading/scraping, API credentials or forced autoplay are used.

Deploy backend, admin and site together for this feature. The backend adds the two requested initial links only when the existing content has no reel configuration, preserving owner edits and drafts. Subsequent changes use the regular CMS publishing workflow.
