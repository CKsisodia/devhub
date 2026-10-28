# DevHub (FE Panel): Technical Documentation

| | |
|---|---|
| **Audience** | Chandrakiran Sisodia (project owner and admin) and future developers |
| **Document version** | 1.0, 14 October 2026 |
| **Code version** | v1.4 (box commit `a60f2ed`, same content as the Mac's `main` commit `c027d53`) |
| **Product spec** | *Frontend Developer Panel: Requirements and Design* v1.4 |
| **Status** | Describes the code as it is. Items that need attention before production are listed in section 9.8, not fixed in code. |

## Contents

1. Overview and architecture
2. Tech stack
3. Repository structure
4. Data model
5. Authentication and permissions
6. API reference
7. Environment variables (incl. 7.3 AI drafting with Ollama)
8. Local development on macOS (incl. 8.11 local dev against production DB)
9. Deployment (production)
10. Accessing database data
11. Maintenance

## 1. Overview and architecture

DevHub (shown in the UI as **FE Panel**) is an internal web panel for a small frontend team (10–20 users, 10–15 projects). It has these sections:

- **Dashboard**: per-user view of work items in the projects the user belongs to (plus items not tied to a project), project progress and recent activity. The admin can view any user's dashboard.
- **Projects**: project list and detail pages with members, status, dates and progress.
- **Tasks, Roadmap, R&D, POC**: four notes-style work sections stored on one shared `WorkItem` model with a `type` column. Each has manual entry and AI prompt-based entry (admin only).
- **Docs**: Markdown pages with Mermaid diagrams, charts (`chart` JSON code blocks) and uploaded images, in a per-project space or the team-wide **General** space, nested one level deep.
- **Learnings**: blog / article / news links or internal posts with tags and pinning.
- **Users** (admin only): add users, reset password, reset two-factor, deactivate / reactivate.

There are two roles. A **single Admin** creates, edits and deletes everything. Everyone else is a **Viewer** and is read-only, **except that any signed-in, active user can change the status of a Task, Roadmap, R&D or POC item**.

The UI has a collapsible sidebar (a slide-in drawer on phones), a light / dark / system theme toggle, the "Lagoon" palette defined as CSS variables, `motion` animations that honour reduced motion, and a **Cmd/Ctrl+K** command palette for navigation only (pages, Users for the admin, and projects). There is no search field in the header.

The system is two independent applications plus a database:

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS 4. All pages are client components that fetch JSON with SWR. The browser only ever talks to the frontend: `next.config.ts` rewrites every `/api/*` request to the backend, so the session cookie is first-party (same origin as the pages) both locally and on Vercel.
- **Backend**: Express 5 + TypeScript + Prisma 6, listening on port 4000 by default. It owns authentication, permissions, validation (zod), the activity log, AI drafting and uploads.
- **Database**: PostgreSQL. Locally it runs in Docker Compose (Postgres 16 on the owner's Mac; the Compose default image is `postgres:17-alpine`, see section 8). In production a managed Postgres (Neon or Supabase) is recommended.
- **External services (optional)**: an OpenAI-compatible chat completions API for AI drafting (a deterministic mock is used in development when no key is set), and Vercel Blob for image uploads (local disk otherwise).

```mermaid
flowchart LR
  subgraph Browser
    UI["Next.js pages (React 19, SWR)"]
  end
  subgraph FE["Frontend: Next.js 16 (port 3000 / Vercel)"]
    Pages["App Router pages and components"]
    RW["Rewrite /api/* to BACKEND_URL"]
  end
  subgraph BE["Backend: Express 5 (port 4000 / Render)"]
    Auth["/api/auth/* sign-in routes"]
    Guard["sessionAuthenticate, readOnlyForViewers, requireAdmin"]
    Routes["Routers: me, users, dashboard, tasks, roadmap, rnd, poc, ai, projects, learning, docs, uploads"]
    Prisma["Prisma Client 6"]
  end
  DB[("PostgreSQL 16 (Docker locally, Neon or Supabase in production)")]
  LLM["OpenAI-compatible LLM API (default: local Ollama + qwen2.5:7b; dev mock when none configured)"]
  Blob["Vercel Blob (optional; local disk fallback)"]

  UI -->|"HTML, JS"| Pages
  UI -->|"fetch /api/* with httpOnly cookie"| RW
  RW -->|"server-side proxy"| Auth
  RW --> Guard
  Guard --> Routes
  Auth --> Prisma
  Routes --> Prisma
  Prisma --> DB
  Routes -->|"POST /api/ai/draft"| LLM
  Routes -->|"POST /api/uploads"| Blob
```

**Request and sign-in flow.** Every request from the browser goes to the frontend origin. Next.js proxies `/api/*` to the backend server-side, and the backend's `Set-Cookie` header comes back through the proxy, so the browser stores the `devhub_session` cookie against the frontend's own domain.

```mermaid
sequenceDiagram
  actor U as User
  participant B as Browser
  participant N as Next.js frontend
  participant A as Express API
  participant D as Postgres

  U->>B: Email and password
  B->>N: POST /api/auth/login
  N->>A: Proxied POST /api/auth/login
  A->>A: Rate limit check (email, IP), argon2id verify
  A->>D: Create pending session (mfa_verified false, 10 min)
  A-->>B: Set-Cookie devhub_session (httpOnly), step totp_setup or totp_verify
  alt First sign-in (no authenticator yet)
    B->>N: POST /api/auth/totp/setup
    N->>A: Proxied
    A->>D: Store new secret, encrypted, on the pending session
    A-->>B: QR code data URL and text key
    U->>B: Scans QR, types 6-digit code
    B->>N: POST /api/auth/totp/enable
    N->>A: Proxied
    A->>D: Copy secret to user, totp_enabled true, rotate token
  else Already enrolled
    U->>B: 6-digit code
    B->>N: POST /api/auth/totp/verify
    N->>A: Proxied
    A->>D: Check code and last step (no replay), rotate token
  end
  opt Temporary password set by admin
    A-->>B: step set_password
    B->>N: POST /api/auth/password
    N->>A: Proxied
    A->>D: New argon2id hash, revoke other sessions, rotate token
  end
  A-->>B: step done, full session (168 h)
  B->>N: GET /api/me, /api/dashboard and others
  N->>A: Proxied with cookie
  A->>D: Look up SHA-256 of token, load user and role
  A-->>B: JSON
```

## 2. Tech stack

Versions are the ranges in each `package.json` (installed versions match the lower bound, e.g. Next.js 16.4.0, Express 5.2.1, Prisma 6.19.3).

| Layer | Technology | Version | Why |
|---|---|---|---|
| Frontend framework | Next.js (App Router) | `^16.4.0` | Standard React framework; first-party Vercel deployment; `rewrites()` gives a same-origin API proxy |
| UI library | React / React DOM | `^19.3.0` | Required by Next.js 16 |
| Language | TypeScript (both apps) | `~5.9.3` | Type safety across routes, DTOs and components |
| Styling | Tailwind CSS 4 + `@tailwindcss/postcss` | `^4.3.3` | Utility CSS; `@theme` CSS variables hold the "Lagoon" design tokens |
| Theme | next-themes | `^0.4.6` | Light / dark / system, stored in `localStorage` (`devhub.theme`), no flash on load |
| Animation | motion (Framer Motion) | `^12.43.0` | Page transitions, staggered lists, animated pills; honours reduced motion |
| Data fetching | SWR | `^2.5.1` | Client-side caching and revalidation of API lists |
| Icons | lucide-react | `^1.53.0` | Icons in the sidebar and UI |
| Diagrams | mermaid | `^12.1.0` | Client-side rendering of Mermaid blocks in docs |
| Charts | Recharts | `^3.10.1` | Rendering `chart` JSON blocks in docs |
| Markdown | react-markdown + remark-gfm | `^10.1.0` / `^4.0.1` | Doc and learning post rendering (GitHub-flavoured tables and lists) |
| Fonts | @fontsource-variable Inter, JetBrains Mono | `^5.3.0` | Self-hosted fonts, no external font requests |
| Backend framework | Express | `^5.2.1` | Small, well-known HTTP server; Express 5 forwards async errors to the error handler |
| ORM | Prisma Client / Prisma CLI | `^6.19.3` | Typed queries, migrations, seed runner, Prisma Studio |
| Database | PostgreSQL | 16 on the Mac (`postgres:16-alpine`); Compose default 17 | Cheap managed options (Neon, Supabase); uses text arrays (`tags`) and JSONB (`changes`) |
| Validation | zod | `^4.6.5` | Request bodies and AI draft output are validated before use |
| Password hashing | @node-rs/argon2 | `^2.2.2` | argon2id with OWASP parameters (19 MiB, 2 iterations) |
| Two-factor | otplib + qrcode | `^13.5.0` / `^1.5.4` | RFC 6238 TOTP for any authenticator app; QR code as a data URL |
| Uploads | multer + @vercel/blob | `^2.4.0` / `^2.8.1` | In-memory multipart parsing; Vercel Blob storage with a local-disk fallback |
| CORS | cors | `^2.8.6` | Only matters for extra origins; normal traffic is same-origin through the proxy |
| AI drafting | OpenAI-compatible chat completions API (plain `fetch`) | n/a | Any provider with JSON mode; default model `gpt-4o-mini` |
| Dev runner | tsx | `^4.23.15` | Runs TypeScript in watch mode; also runs the seed |
| Tests | Vitest + Supertest | `^5.0.3` / `^7.3.1` | Unit tests and HTTP-level tests against the Express app |
| Linting | ESLint 9, typescript-eslint, eslint-config-next | `^9.39.5` | Same `npm run lint` in both apps |
| Runtime | Node.js | `engines: >=20.9`; **use 22.9+ or 24 LTS** | Next.js 16 needs 20.9+; the backend scripts use `--env-file-if-exists` (Node 22.9+) |

## 3. Repository structure

Build output (`dist/`, `.next/`), `node_modules/`, env files and `backend/uploads/` are git-ignored.

```text
devhub/
├── README.md                  # Quick start, scripts, security notes, troubleshooting
├── docker-compose.yml         # Local Postgres only (service "db", volume "devhub-pg")
├── .env                       # Optional, git-ignored: POSTGRES_PORT / POSTGRES_IMAGE for Compose
├── docs/TECHNICAL.md          # This document
├── backend/                   # API service
│   ├── package.json           # Scripts: dev, build, start, lint, typecheck, test, db:*
│   ├── .env.example           # Documented backend settings (copy to .env)
│   ├── tsconfig.json          # Type-check config (tsconfig.build.json emits dist/)
│   ├── eslint.config.mjs      # Lint rules; vitest.config.ts runs tests/**/*.test.ts
│   ├── prisma/
│   │   ├── schema.prisma      # Data model (10 models, 6 enums)
│   │   ├── migrations/        # init, email_totp_auth_and_backlog, work_items
│   │   └── seed.ts            # WIPES app tables, loads fake dev data and known passwords
│   ├── src/
│   │   ├── index.ts           # Entry: checks the TOTP key, starts the server, logs the config
│   │   ├── app.ts             # CORS, Origin check, auth, viewer guard, routers, error handler
│   │   ├── config.ts          # Typed access to every environment variable and its default
│   │   ├── db.ts              # Shared PrismaClient
│   │   ├── types.ts           # AuthUser type on req.user
│   │   ├── auth/
│   │   │   ├── routes.ts      # /api/auth: login, state, totp/*, password, logout
│   │   │   ├── session.ts     # DB sessions, cookie helpers, token rotation, revocation
│   │   │   └── middleware.ts  # sessionAuthenticate (full session) and requireAdmin
│   │   ├── routes/
│   │   │   ├── me.ts          # Current user and AI mode
│   │   │   ├── users.ts       # Add, edit, deactivate, reset password, reset two-factor
│   │   │   ├── dashboard.ts   # Per-user dashboard data
│   │   │   ├── workItems.ts   # Generic router for /api/tasks, /roadmap, /rnd, /poc
│   │   │   ├── ai.ts          # POST /api/ai/draft (never writes)
│   │   │   ├── projects.ts    # Projects and members
│   │   │   ├── learning.ts    # Learning items and tags
│   │   │   ├── docs.ts        # Doc pages (one level of nesting)
│   │   │   └── uploads.ts     # Image upload and local-disk file serving
│   │   └── lib/
│   │       ├── workTypes.ts   # The single table describing the four work sections
│   │       ├── schemas.ts     # zod request schemas
│   │       ├── password.ts    # argon2id hashing and password policy
│   │       ├── totp.ts        # otplib TOTP and QR code generation
│   │       ├── crypto.ts      # AES-256-GCM secret encryption, dev key fallback, tokens
│   │       ├── rateLimit.ts   # In-memory fixed-window rate limiter
│   │       ├── llm.ts         # LLM client and mode (llm / mock / disabled)
│   │       ├── draft.ts       # Prompt building, mock replies, parsing AI drafts
│   │       ├── storage.ts     # Vercel Blob or local-disk storage
│   │       ├── activity.ts    # Activity log writer
│   │       └── stats.ts, dto.ts, errors.ts  # Status counts, response shaping, HTTP errors
│   └── tests/                 # permissions, auth-unit, auth-flow (needs DB), draft
└── frontend/                  # Web app
    ├── package.json           # Scripts: dev, build, start, lint, typecheck
    ├── .env.example           # BACKEND_URL (copy to .env.local)
    ├── next.config.ts         # /api/* rewrite to BACKEND_URL; /backlog, /learning redirects
    ├── app/
    │   ├── layout.tsx         # Root layout, fonts, metadata, browser theme colours
    │   ├── providers.tsx      # ThemeProvider, SWRConfig, MotionConfig, toasts
    │   ├── globals.css        # Tailwind import and "Lagoon" tokens (light and .dark)
    │   ├── page.tsx           # Redirects / to /dashboard
    │   ├── login/page.tsx     # Sign-in steps: password, QR setup, 6-box code, new password
    │   └── (app)/             # Signed-in area (AuthGate + AppShell)
    │       ├── layout.tsx     # Shell; template.tsx adds the page entrance animation
    │       ├── dashboard/     # Per-user dashboard
    │       ├── projects/      # List and projects/[id] detail
    │       ├── tasks/ roadmap/ rnd/ poc/  # Each renders <WorkSectionPage type=... />
    │       ├── docs/          # Doc spaces, page tree, editor
    │       ├── learnings/     # List and learnings/[id] post view
    │       └── users/         # Admin only
    ├── components/            # AppShell, AuthGate, CommandPalette, ThemeToggle, WorkItemsView,
    │                          # WorkItemForm, AiPrompt, WorkOverview, DocEditor, MermaidView,
    │                          # ChartBlock, Markdown, forms, ui kit, motion helpers, toasts
    └── lib/                   # api.ts (fetch wrapper), hooks.ts (SWR), nav.ts, workTypes.ts,
                               # types.ts, blocks.ts (doc blocks), format.ts (labels, tones)
```

## 4. Data model

The schema is in `backend/prisma/schema.prisma`. All ids are UUIDs generated by Prisma on the client side (`@default(uuid())`), so raw SQL inserts must supply an id (for example `gen_random_uuid()`). Tables are snake_case via `@@map`, **except the roles table, which is called `"Role"`** (capital R, must be quoted in SQL).

```mermaid
erDiagram
  Role ||--o{ users : "has"
  users ||--o{ sessions : "has"
  users ||--o{ project_members : "is member"
  projects ||--o{ project_members : "has"
  users ||--o{ projects : "created"
  projects |o--o{ work_items : "groups"
  users ||--o{ work_items : "created"
  users ||--o{ learning_items : "created"
  projects |o--o{ docs : "space"
  docs |o--o{ docs : "parent of"
  users ||--o{ docs : "created or updated"
  docs |o--o{ attachments : "has"
  users ||--o{ attachments : "uploaded"
  users ||--o{ activity_logs : "did"

  Role {
    uuid id PK
    text name UK "admin or viewer"
  }
  users {
    uuid id PK
    text name
    text email UK "lower-case"
    text password_hash "argon2id"
    bool must_change_password
    bool totp_enabled
    text totp_secret_enc "AES-256-GCM"
    int totp_last_step "replay guard"
    uuid role_id FK
    bool active
    timestamp last_login_at
    timestamp created_at
  }
  sessions {
    uuid id PK
    text token_hash UK "SHA-256 of cookie token"
    uuid user_id FK
    bool mfa_verified
    text pending_totp_secret_enc
    int failed_totp_attempts
    timestamp expires_at
  }
  projects {
    uuid id PK
    text name
    text description
    enum status "ACTIVE ON_HOLD COMPLETED"
    bool archived
    date start_date
    date target_date
    uuid created_by FK
  }
  project_members {
    uuid project_id PK
    uuid user_id PK
    timestamp added_at
  }
  work_items {
    uuid id PK
    enum type "TASK ROADMAP RND POC"
    text title
    text notes
    uuid project_id FK "nullable"
    enum status "TODO IN_PROGRESS DONE HOLD REJECT"
    text target_period "Roadmap"
    text goal "R&D and POC"
    date timebox_end "R&D and POC"
    text findings "R&D and POC"
    enum outcome "POC"
    uuid created_by FK
  }
  learning_items {
    uuid id PK
    enum type "BLOG ARTICLE NEWS"
    text title
    text url "null for internal post"
    text summary
    text body
    text_array tags
    bool pinned
    uuid created_by FK
  }
  docs {
    uuid id PK
    uuid project_id FK "null means General"
    uuid parent_id FK "one level"
    text title
    text content "Markdown"
    int position
    uuid created_by FK
    uuid updated_by FK
  }
  attachments {
    uuid id PK
    uuid doc_id FK
    text file_url
    text file_name
    uuid uploaded_by FK
  }
  activity_logs {
    uuid id PK
    uuid user_id FK
    text entity_type
    uuid entity_id
    uuid project_id
    text action
    text summary
    jsonb changes
    timestamp created_at
  }
```

**Key tables**

| Table | What it holds | Notes |
|---|---|---|
| `"Role"` | Two rows: `admin`, `viewer` | Code checks `role.name === "admin"`. Users created from the UI always get `viewer`; there is no UI or API to change a role. |
| `users` | People who can sign in | `email` unique, stored lower-case. `password_hash` is argon2id. `totp_secret_enc` is encrypted with `TOTP_ENCRYPTION_KEY`. `totp_last_step` is the last accepted 30-second step, so a code cannot be reused. `must_change_password` is true after an admin sets a temporary password. The API deactivates users; it never deletes them. |
| `sessions` | Server-side sessions | Only the SHA-256 of the cookie token is stored. `mfa_verified = false` means the password is done but TOTP is pending. `pending_totp_secret_enc` holds the secret shown as a QR code until confirmed. Cascade-deleted with the user. |
| `projects`, `project_members` | Projects and members | Membership drives the dashboard. Deleting a project cascades to members and docs; its work items stay with `project_id` set to null. |
| `work_items` | Tasks, Roadmap, R&D, POC | `type` decides the section. Roadmap: `target_period` (`2026-11` or `2026-Q4`). R&D: `goal`, `timebox_end`, `findings`. POC: the same plus `outcome` (`ADOPT`, `DROP`, `NEEDS_MORE_WORK`). Indexed on `(type, status)` and `project_id`. |
| `learning_items` | Links and internal posts | `url` null means an internal post with a Markdown `body`. `tags` is a Postgres text array. |
| `docs` | Documentation pages | `project_id` null is the General space. `parent_id` allows one level of nesting (checked in the API). `content` is Markdown, including `mermaid` and `chart` code blocks. |
| `attachments` | Uploaded images | `file_url` is a Vercel Blob URL or `/api/uploads/files/<uuid>.<ext>` for local disk. |
| `activity_logs` | Audit trail and dashboard activity | Every create, update and delete, with `changes` as JSON. `entity_type`: `task`, `roadmap`, `rnd`, `poc`, `doc`, `project`, `learning`, `user`. |

**Migrations** (`backend/prisma/migrations/`, applied in order):

1. `20261008105350_init`: first schema (phone-based users, Jira-style tasks).
2. `20261008120000_email_totp_auth_and_backlog`: email, password and TOTP columns, the `sessions` table, tasks converted to `backlog_items`. Existing users got a placeholder email and an unusable password.
3. `20261013090000_work_items`: renames `backlog_items` to `work_items` in place, adds `type` and the type-specific columns, and adds the `TODO` status.

## 5. Authentication and permissions

### 5.1 Sign-in flow

Implemented in `backend/src/auth/routes.ts` and `session.ts`; the UI is `frontend/app/login/page.tsx`.

1. **Password step** (`POST /api/auth/login`). The email is trimmed and lower-cased and the password is checked with argon2id. Unknown emails go through a dummy hash so the timing is similar, and both cases return *"Email or password is incorrect."* A deactivated user gets 403. On success, older pending sessions of that user are deleted and a new **pending** session is created (valid for `PENDING_LOGIN_TTL_MINUTES`, default 10). The response gives the next `step`.
2. **TOTP step**: `totp_setup` the first time (see 5.2), otherwise `totp_verify` (`POST /api/auth/totp/verify`). The code must be 6 digits, valid within ±1 period of 30 s, and newer than `totp_last_step` (no replay).
3. **Password change** (`set_password`), only when `must_change_password` is true: `POST /api/auth/password`. Policy: 10–128 characters, at least one letter and one number, must not contain the email name, and must differ from the temporary password. The user's other sessions are revoked.
4. **Done**: the session becomes a full session for `SESSION_TTL_HOURS` (default 168 h, 7 days) and `last_login_at` is updated.

Session details:

- Cookie `devhub_session`: random 256-bit token, `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when `COOKIE_SECURE` is true (default true when `NODE_ENV=production`).
- The token is **rotated** after each step (prevents session fixation).
- A pending session cannot call any API outside `/api/auth/*`: `sessionAuthenticate` returns 401 *"Finish signing in first."* until `mfa_verified` is true and no password change is pending.
- `GET /api/auth/state` lets the login page resume at the right step after a reload.
- Deactivation, password reset and two-factor reset delete all of that user's sessions at once.

Rate limiting (`lib/rateLimit.ts`, in memory, fixed window of `RATE_LIMIT_WINDOW_MINUTES`, default 15):

| Limiter | Key | Limit per window | Effect |
|---|---|---|---|
| Wrong passwords | email | `LOGIN_MAX_ATTEMPTS` (8) | 429 with `Retry-After`; reset by a correct password |
| Wrong passwords | client IP (`req.ip`) | 4 × `LOGIN_MAX_ATTEMPTS` (32) | 429 with `Retry-After` |
| Wrong TOTP codes | user | 10 | 429 with `Retry-After` |
| Wrong TOTP codes | pending session | 5 | Pending session deleted; the user starts again |

Because the limiter lives in process memory, counters reset on every restart and are **not shared between instances**. Run exactly one backend instance, or move the limiter to Redis or the database.

CSRF protection is SameSite=Lax cookies plus `sameOriginForMutations` in `app.ts`: any request other than GET, HEAD or OPTIONS whose `Origin` header is not `WEBSITE_DOMAIN`, an entry in `CORS_ORIGINS`, or the API's own host is rejected with 403 *"Cross-site request blocked."*

### 5.2 TOTP enrolment

1. After the password step the user has `totp_enabled = false`, so the step is `totp_setup`.
2. `POST /api/auth/totp/setup` generates a base32 secret (otplib defaults: SHA-1, 6 digits, 30 s), stores it **encrypted** (AES-256-GCM, format `v1.<iv>.<tag>.<ciphertext>`) on the pending session, and returns an `otpauth://` URI, a QR code (PNG data URL) and the plain key for manual entry. Reloading the page reuses the same secret. The issuer shown in the app is `TOTP_ISSUER` (default `APP_NAME`, "FE Panel").
3. The user scans the QR code with any authenticator app (Google Authenticator, Microsoft Authenticator, Authy, 1Password and similar) and types the current code.
4. `POST /api/auth/totp/enable` checks the code. Only then is the encrypted secret copied to `users.totp_secret_enc`, `totp_enabled` set to true, and the event written to the activity log.

The key comes from `TOTP_ENCRYPTION_KEY` (32 bytes, base64 or 64 hex characters). If it is empty and `NODE_ENV` is not `production`, a built-in, insecure development key is used and the startup log says so. With `NODE_ENV=production` the backend refuses to start without a valid key. **If the key changes, every stored secret becomes unreadable** and every user needs a two-factor reset.

### 5.3 Admin resets and recovery

On the **Users** page (admin only) the admin can:

- **Add user**: name, email and a temporary password. The user is created as a Viewer with `must_change_password = true`.
- **Reset password**: sets a new temporary password; the user chooses their own at next sign-in.
- **Reset two-factor**: clears `totp_enabled`, `totp_secret_enc` and `totp_last_step`; the user scans a new QR code at next sign-in.
- **Deactivate / reactivate**, and edit name or email. The admin account cannot be deactivated.

Each of these signs the user out everywhere. The admin cannot reset **their own** password or two-factor from the UI (the API returns 400); use the database procedure in section 8.8.

### 5.4 Permission matrix

| Action | Admin | Viewer | Anonymous |
|---|:---:|:---:|:---:|
| Sign in (`/api/auth/*`) | ✓ | ✓ | ✓ |
| View own dashboard | ✓ | ✓ | ✗ |
| View any user's dashboard (`?userId=`) | ✓ | ✗ (403) | ✗ |
| View Tasks, Roadmap, R&D, POC, Projects, Learnings, Docs, uploaded files | ✓ | ✓ | ✗ |
| **Change status** of a Task, Roadmap, R&D or POC item | ✓ | **✓** | ✗ |
| Add (manual, bulk or AI draft), edit, delete work items | ✓ | ✗ | ✗ |
| Create, edit, delete projects and members, learning items, docs | ✓ | ✗ | ✗ |
| Upload images | ✓ | ✗ | ✗ |
| List users | ✓ (full details) | ✓ (id, name, active only) | ✗ |
| Add users, reset password or two-factor, deactivate | ✓ | ✗ | ✗ |

### 5.5 Where permissions are enforced

All checks are on the backend; the frontend only hides controls for convenience.

1. **`sessionAuthenticate`** (`auth/middleware.ts`) runs on every `/api/*` route except `/api/auth/*` and `/api/health`. It requires a full, unexpired session of an active user, otherwise 401.
2. **`readOnlyForViewers`** (`app.ts`) is a global guard: any request other than GET, HEAD or OPTIONS from a non-admin gets 403, **except** the allow-list `VIEWER_ALLOWED_MUTATIONS`, which contains only `PATCH /api/{tasks|roadmap|rnd|poc}/:id/status`.
3. **`requireAdmin`** wraps every admin-only route as a second layer.
4. **Route-level checks**: the dashboard rejects another user's `userId` for Viewers; `GET /api/users` returns only names to Viewers; a work item requested through another section's path returns 404.
5. **Tests**: `backend/tests/permissions.test.ts` discovers every POST, PUT, PATCH and DELETE route from the routers and asserts that a Viewer gets 403 on all of them except the four status routes (and that these are the only exceptions), and that anonymous callers get 401. New routes are covered automatically.

## 6. API reference

All paths are under `/api` on the backend and are reached through the frontend's `/api/*` proxy. Bodies are JSON (max 1 MB), except uploads (multipart). Errors are `{ "error": "message" }` with a matching status: 400 validation, 401 not signed in, 403 forbidden, 404, 409 conflict, 429 rate limited, 502/503 AI errors.

"Signed in" means a full session of an active user (admin or viewer).

### 6.1 Health and auth

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/health` | Anyone | `{ "ok": true }` (does not touch the database) |
| POST | `/api/auth/login` | Anyone | `{ email, password }` → pending session and `step` |
| GET | `/api/auth/state` | Anyone with a session cookie | Current `step` and user name/email, or 401 |
| POST | `/api/auth/totp/setup` | Pending session, not enrolled | QR data URL, key, `otpauth://` URI |
| POST | `/api/auth/totp/enable` | Pending session, not enrolled | `{ code }` → confirms enrolment |
| POST | `/api/auth/totp/verify` | Pending session, enrolled user | `{ code }` → completes the TOTP step |
| POST | `/api/auth/password` | Session after TOTP, with a temporary password | `{ newPassword }` |
| POST | `/api/auth/logout` | Anyone | Deletes the session and clears the cookie (204) |

### 6.2 Current user, users and dashboard

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/me` | Signed in | `{ user: { id, name, role, email }, ai: { mode } }`, mode `llm`, `mock` or `disabled` |
| GET | `/api/users` | Signed in | Admin: full list (email, role, two-factor, last login). Viewer: id, name, active |
| POST | `/api/users` | Admin | `{ name, email, tempPassword }` → new Viewer |
| PATCH | `/api/users/:id` | Admin | `{ name?, email?, active? }`; deactivation signs the user out |
| POST | `/api/users/:id/reset-password` | Admin (not self) | `{ tempPassword }` |
| POST | `/api/users/:id/reset-totp` | Admin (not self) | Clears the user's authenticator |
| GET | `/api/dashboard?userId=` | Signed in (other `userId`: admin only) | Work items, project progress, recent activity |

### 6.3 Work sections: Tasks, Roadmap, R&D, POC

`<s>` is `tasks`, `roadmap`, `rnd` or `poc`. One generic router (`routes/workItems.ts`) is mounted four times. Fields that belong to another section are rejected with 400.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/<s>?status=&projectId=&q=` | Signed in | List; `projectId=none` for items without a project; `q` searches title and notes |
| POST | `/api/<s>` | Admin | Create one item |
| POST | `/api/<s>/bulk` | Admin | `{ creates, updates }` in one transaction (AI confirm step) |
| PATCH | `/api/<s>/:id/status` | **Signed in (admin or viewer)** | `{ status }`: `TODO`, `IN_PROGRESS`, `DONE`, `HOLD`, `REJECT` |
| PATCH | `/api/<s>/:id` | Admin | Edit any field of that section |
| DELETE | `/api/<s>/:id` | Admin | Delete (204) |
| POST | `/api/ai/draft` | Admin | `{ prompt, type }` → validated drafts (creates and updates); never writes |

### 6.4 Projects, learnings, docs and uploads

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/projects?includeArchived=1` | Signed in | List with progress and members |
| GET | `/api/projects/:id` | Signed in | Project detail |
| POST | `/api/projects` | Admin | Create |
| PATCH | `/api/projects/:id` | Admin | Edit (status, dates, archived and so on) |
| DELETE | `/api/projects/:id` | Admin | Delete; cascades members and docs, work items stay without a project |
| POST | `/api/projects/:id/members` | Admin | Add a member |
| DELETE | `/api/projects/:id/members/:userId` | Admin | Remove a member |
| GET | `/api/learning?type=&tags=&q=` | Signed in | List (pinned first) |
| GET | `/api/learning/tags` | Signed in | Distinct tags |
| GET | `/api/learning/:id` | Signed in | Item with body |
| POST, PATCH, DELETE | `/api/learning`, `/api/learning/:id` | Admin | Create, edit, delete |
| GET | `/api/docs?projectId=<uuid>` or `?projectId=general` | Signed in | Page tree of one space |
| GET | `/api/docs/:id` | Signed in | Page with content |
| POST, PATCH, DELETE | `/api/docs`, `/api/docs/:id` | Admin | Create, edit, delete (sub-pages are deleted with the parent) |
| POST | `/api/uploads` | Admin | Multipart field `file` (PNG, JPG, SVG, GIF, WEBP; max `UPLOAD_MAX_BYTES`), optional `docId` |
| GET | `/api/uploads/files/:name` | Signed in | Local-disk files only, served with a locked-down CSP |

Frontend redirects (not API): `/backlog` → `/tasks`, `/learning` → `/learnings`, `/learning/:id` → `/learnings/:id`.

## 7. Environment variables (incl. 7.3 AI drafting with Ollama)

### 7.1 Backend (`backend/.env`, from `backend/.env.example`)

Locally the backend reads `.env` through `node --env-file-if-exists=.env` (the Prisma CLI reads it too). On a host, set the values in the provider's dashboard.

| Name | Required? | Example | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | `postgresql://devhub:devhub@localhost:5433/devhub` | Postgres connection. Hosted: add `?sslmode=require` |
| `NODE_ENV` | **Yes in production** | `production` | Enables: required TOTP key, Secure cookie default, no AI mock |
| `PORT` | No (4000) | `4000` | Listen port. Render sets `PORT` itself |
| `WEBSITE_DOMAIN` | **Yes in production** (default `http://localhost:3000`) | `https://devhub.example.com` | Public frontend origin for CORS and the Origin check. Exact origin, no trailing slash |
| `CORS_ORIGINS` | No | `https://devhub-xyz.vercel.app` | Extra allowed origins, comma separated |
| `APP_NAME` | No (`FE Panel`) | `FE Panel` | Display name and default TOTP issuer |
| `TOTP_ENCRYPTION_KEY` | **Yes in production** | output of `openssl rand -base64 32` | 32-byte key for AES-256-GCM encryption of TOTP secrets. Never change without re-enrolling everyone |
| `TOTP_ISSUER` | No (`APP_NAME`) | `FE Panel` | Account label in authenticator apps |
| `SESSION_TTL_HOURS` | No (168) | `168` | Full session lifetime |
| `PENDING_LOGIN_TTL_MINUTES` | No (10) | `10` | Time to finish TOTP and any password change |
| `COOKIE_SECURE` | No (true in production) | `true` | Secure flag on the session cookie |
| `LOGIN_MAX_ATTEMPTS` | No (8) | `8` | Wrong passwords per email per window (×4 per IP) |
| `RATE_LIMIT_WINDOW_MINUTES` | No (15) | `15` | Rate-limit window |
| `LLM_BASE_URL` | No | `http://localhost:11434/v1` | OpenAI-compatible base URL (`/chat/completions` is appended). Ollama locally; Groq, OpenRouter, OpenAI or a hosted Ollama in production |
| `LLM_MODEL` | No | `qwen2.5:7b` | Model name; must support JSON mode (`response_format: json_object`) |
| `LLM_API_KEY` | Only for hosted providers | empty / `gsk_...` | Bearer token. Not needed for keyless local servers (localhost, 127.0.0.1, host.docker.internal or port 11434) |
| `LLM_TIMEOUT_MS` | No | `90000` | Per-request timeout; CPU-only local models need 30–90 s |
| `LLM_CONTEXT_ITEMS` | No | `60` | Max existing section items sent to the model as context |
| `LLM_MOCK` | No (code default `false`; `.env.example` sets `true`) | `true` | Dev only: keyword-based mock when **no LLM is configured** (no key and a non-local URL). Ignored in production |
| `BLOB_READ_WRITE_TOKEN` | **Yes in production** (else local disk) | `vercel_blob_rw_...` | Vercel Blob token for image uploads |
| `UPLOAD_DIR` | No (`uploads`) | `uploads` | Local-disk folder, relative to the backend working directory |
| `UPLOAD_MAX_BYTES` | No (5242880) | `5242880` | Maximum upload size (5 MB) |

### 7.2 Frontend (`frontend/.env.local`, from `frontend/.env.example`)

| Name | Required? | Example | Purpose |
|---|---|---|---|
| `BACKEND_URL` | **Yes in production** (default `http://localhost:4000`) | `https://devhub-api.onrender.com` | Target of the `/api/*` rewrite. Read when `next.config.ts` is evaluated (build and start), so redeploy after changing it. A trailing slash is stripped |
| `NEXT_PUBLIC_APP_NAME` | No | `FE Panel` | Listed in `.env.example` but **not read by any code** (the name is hard-coded in `app/layout.tsx`) |

### 7.3 AI drafting (LLM)

`POST /api/ai/draft {prompt, type}` (admin) builds a section-specific prompt in `src/lib/draft.ts`
(`buildMessages`: JSON shape, status rules, type rules for `targetPeriod` / `goal` / `timeboxEnd` / `findings` /
`outcome`, today's date, and an example reply), plus a context of project names and up to `LLM_CONTEXT_ITEMS` existing
items of that section. `src/lib/llm.ts` calls `${LLM_BASE_URL}/chat/completions` with `response_format: json_object`,
`temperature: 0.2`, `stream: false`, and a Bearer header only when `LLM_API_KEY` is set.

- **Validation:** the reply is parsed with zod (`parseDraftResponse`); statuses, periods, dates, outcomes and project names
  are normalised, and unknown values are flagged. On invalid JSON or the wrong shape the model gets its answer back plus a
  repair message and one more try; a second failure returns 502 with a clear message. Transport errors are not retried.
- **Errors:** Ollama down → 503 "The local AI server … isn't reachable. Is Ollama running?"; missing model → 502 with the
  `ollama pull` command; timeout (`LLM_TIMEOUT_MS`) → 504; 401/403 → bad key; 429 → rate limited.
- **Modes** (`/api/me` → `ai.mode`): `llm` when a key is set or the URL is a local/keyless server; else `mock` in dev when
  `LLM_MOCK=true`; else `disabled`. Drafts return `source`, `model` and `ms`; the preview shows the model and time.
- Nothing is written until the admin confirms the editable preview (`POST /api/<section>/bulk`).
- The Next.js rewrite proxy timeout is raised to 180 s (`experimental.proxyTimeout`) so slow CPU drafts aren't cut off.

**Local setup (macOS):** `brew install ollama && brew services start ollama && ollama pull qwen2.5:7b` (or download
the app/CLI from ollama.com when brew can't reach GitHub). Then in `backend/.env`: `LLM_BASE_URL=http://localhost:11434/v1`,
`LLM_MODEL=qwen2.5:7b`, `LLM_API_KEY=` and restart the backend. Qwen 2.5 7B needs ~5–6 GB RAM while loaded; on 8 GB machines
use `qwen2.5:3b`. On a CPU-only laptop expect ~15–60 s per draft.

**Production hosting options:**

| Option | Env | Cost / latency | Notes |
| --- | --- | --- | --- |
| Self-hosted Ollama on a VM (same region/VPC as the backend) | `LLM_BASE_URL=http://<private-ip>:11434/v1`, `LLM_MODEL=qwen2.5:7b` | VM only (CPU 4 vCPU/8–16 GB ≈ 30–60 s; small GPU ≈ 1–3 s) | Data stays on your infra. Ollama has no auth: keep 11434 private or front it with a reverse proxy that checks a token, and pass that token as `LLM_API_KEY` |
| Groq free tier | `https://api.groq.com/openai/v1`, `llama-3.1-8b-instant`, `LLM_API_KEY=gsk_…` | Free, ~1 s | Rate limits per minute/day; prompts leave your infra |
| OpenRouter free models | `https://openrouter.ai/api/v1`, e.g. `qwen/qwen-2.5-7b-instruct:free`, `LLM_API_KEY=sk-or-…` | Free, variable | Daily caps; model availability changes |

## 8. Local development on macOS (from scratch)

### 8.1 Prerequisites

- **Node.js 22 LTS (22.9 or later) or 24 LTS**, with npm. The README says 20.9+, which is enough for Next.js 16, but the backend `dev` and `start` scripts use `--env-file-if-exists`, which needs Node 22.9+. Install with `brew install node@22` or nvm (`nvm install 22`), then check `node -v`.
- **Docker Desktop** (start it with `open -a Docker` and wait for *Engine running*).
- **Git**.
- An **authenticator app** on your phone (or generate codes with the command in 8.7).
- Optional: `brew install libpq` for `psql` and `pg_dump` on the Mac (then `brew link --force libpq`).

### 8.2 Get the code

```bash
cd ~/Desktop
git clone <repo-url> devhub      # or use the existing ~/Desktop/devhub checkout
cd devhub
```

### 8.3 Start Postgres with Docker Compose

`docker-compose.yml` defines one service, `db`, with user, password and database all `devhub`, a named volume `devhub-pg` and a health check. By default it uses `postgres:17-alpine` on host port 5432. On the owner's Mac two overrides are set in a git-ignored **root** `.env` file next to `docker-compose.yml`:

- Port **5432 is already taken** by another project, so DevHub uses **5433**.
- The Mac **cannot pull images from Docker Hub** (corporate TLS interception causes `x509: certificate signed by unknown authority`), so it uses the already cached `postgres:16-alpine` image.

```bash
cd ~/Desktop/devhub
cat > .env <<'ENV'
POSTGRES_PORT=5433
POSTGRES_IMAGE=postgres:16-alpine
ENV

docker image ls postgres          # confirm postgres:16-alpine is cached
docker compose up -d
docker compose ps                 # "db" should show running (healthy)
```

The container is named `devhub-db-1` (project `devhub`, service `db`). Stop it with `docker compose down`; add `-v` to delete the data volume. If you switch Postgres major versions on an existing volume, run `docker compose down -v` first (this deletes local data; re-seed afterwards).

### 8.4 Backend

```bash
cd ~/Desktop/devhub/backend
cp .env.example .env
# Edit .env so DATABASE_URL uses the Compose port:
#   DATABASE_URL=postgresql://devhub:devhub@localhost:5433/devhub
# Leave TOTP_ENCRYPTION_KEY empty locally (the dev key is used and logged).
# AI drafting uses local Ollama by default (see 7.3 "AI drafting"); keep LLM_MOCK=true as fallback.

npm install            # postinstall runs "prisma generate"
npm run db:deploy      # prisma migrate deploy: applies the 3 migrations
npm run db:seed        # WIPES app tables and loads fake data (prints the logins)
npm run dev            # tsx watch on http://localhost:4000
```

Check: `curl http://localhost:4000/api/health` returns `{"ok":true}`. The startup log prints the TOTP key mode, cookie mode, AI mode and upload storage.

After changing `schema.prisma`, run `npm run db:migrate` (creates a migration and regenerates the client). After pulling someone else's schema change, `npm run db:deploy` and `npx prisma generate` are enough.

### 8.5 Frontend

In a second terminal:

```bash
cd ~/Desktop/devhub/frontend
cp .env.example .env.local     # BACKEND_URL=http://localhost:4000
npm install
npm run dev                    # http://localhost:3000
```

### 8.6 Seeded logins (fake development data)

Open **http://localhost:3000** (use `localhost`, not `127.0.0.1`; see 8.10).

| User | Role | Email | Password |
|---|---|---|---|
| Asha Rao | Admin | `asha@devhub.test` | `Admin@devhub26` |
| Ravi Kumar | Viewer | `ravi@devhub.test` | `Viewer@devhub26` |
| Meera Iyer | Viewer | `meera@devhub.test` | `Viewer@devhub26` |
| Daniel Fernandes | Viewer | `daniel@devhub.test` | `Viewer@devhub26` |
| Priya Nair | Viewer (inactive) | `priya@devhub.test` | `Viewer@devhub26` (shows the "deactivated" message) |

The seed also creates projects, work items in all four sections, learning items, docs (with Mermaid and chart examples) and a sample wireframe SVG in `backend/uploads/`. Seeded users have **no authenticator yet** and do not need to change their password.

### 8.7 Enrolling TOTP

1. Sign in with email and password. A QR code appears.
2. Scan it with your authenticator app (each dev account shows as *FE Panel (email)*), or tap *Copy key* and add it manually.
3. Type the 6-digit code. You are signed in. Later sign-ins ask for the password, then the current code.

No phone to hand? Generate the current code from the key shown under the QR code (key without spaces):

```bash
cd ~/Desktop/devhub/backend
node -e 'import("otplib").then(async (o) => console.log(await o.generate({ secret: process.argv[1] })))' YOURKEY
```

Re-running `npm run db:seed` recreates every user, so delete the old entries in your authenticator app and enrol again.

### 8.8 Resetting a user's TOTP or password with SQL

For a Viewer, use **Users → Reset two-factor** or **Reset password** in the UI. For the admin's own account (or if nobody can sign in), use SQL.

Reset two-factor (the user scans a new QR code at next sign-in; this also signs everyone out):

```bash
docker exec -it devhub-db-1 psql -U devhub -d devhub -c \
  "UPDATE users SET totp_enabled=false, totp_secret_enc=NULL, totp_last_step=NULL WHERE email='asha@devhub.test'; DELETE FROM sessions;"
```

Set a new temporary password (the user chooses their own after the TOTP step). The argon2 hash contains `$` signs, so pass it as a psql variable rather than pasting it inside a double-quoted shell string:

```bash
cd ~/Desktop/devhub/backend
HASH=$(node -e 'import("@node-rs/argon2").then(async (a) => console.log(await a.hash(process.argv[1])))' 'New-temp-pass-1')
docker exec -i devhub-db-1 psql -U devhub -d devhub -v hash="$HASH" <<'SQL'
UPDATE users SET password_hash = :'hash', must_change_password = true WHERE email = 'asha@devhub.test';
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'asha@devhub.test');
SQL
```

### 8.9 Lint, type-check, tests and build

| Where | Command | What it does |
|---|---|---|
| backend | `npm run lint` | ESLint |
| backend | `npm run typecheck` | `tsc --noEmit` |
| backend | `npm test` | Vitest: `permissions`, `auth-unit`, `draft` (no DB) and `auth-flow` (uses `DATABASE_URL`, creates and removes its own user, skipped if no DB is reachable) |
| backend | `npm run build` / `npm start` | Compile to `dist/` / run the compiled server |
| backend | `npm run db:reset` | Drop, re-migrate and re-seed the local database (guarded: local DB only) |
| backend | `npm run db:backup` / `npm run db:migrate:safe` | JSON backup to `backend/backups/` / backup + `prisma migrate deploy` (see 8.11) |
| frontend | `npm run lint` | ESLint (eslint-config-next) |
| frontend | `npm run typecheck` | `next typegen && tsc --noEmit` |
| frontend | `npm run build` / `npm start` | Production build / serve on port 3000 |

At v1.4, backend lint, type-check and all 160 tests (4 files) pass, and frontend lint and type-check pass.

### 8.10 Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Error: Cannot find module 'picocolors'` (or similar module errors) from the frontend dev server | Stale Next.js cache. Stop the dev server (Ctrl+C), run `rm -rf frontend/.next`, start `npm run dev` again. If it persists, `rm -rf node_modules && npm install` in `frontend/` |
| Sign-in fails with a generic error; the frontend terminal shows a proxy error such as `ECONNREFUSED` on port 4000 | **The backend is not running** (or crashed). Start it with `cd backend && npm run dev` and check `curl localhost:4000/api/health` |
| Sign-in returns 403 *"Cross-site request blocked."* | You opened `http://127.0.0.1:3000`. The Origin check only allows `WEBSITE_DOMAIN` (`http://localhost:3000`). **Use `http://localhost:3000`**, or add the other origin to `CORS_ORIGINS` |
| `Cannot connect to the Docker daemon` | Start Docker Desktop first (`open -a Docker`) |
| Port 5432 already in use, or `P1000: Authentication failed` on `db:deploy` | Another Postgres answers on that port. Use `POSTGRES_PORT=5433` in the root `.env` and port 5433 in `DATABASE_URL` |
| Port 4000 or 3000 in use | Find the process with `lsof -i :4000`. Change `PORT` in `backend/.env` and `BACKEND_URL` in `frontend/.env.local`; for the frontend run `npx next dev -p 3001` and set `WEBSITE_DOMAIN=http://localhost:3001` |
| Image pull fails with `x509: certificate signed by unknown authority` | TLS interception by the corporate proxy or VPN. Use a cached image (`POSTGRES_IMAGE=postgres:16-alpine`) or add the proxy's root certificate to Docker Desktop (ask IT) |
| `node: bad option: --env-file-if-exists` | Node is older than 22.9. Upgrade Node |
| *"That code didn't match"* | Phone clock not set automatically, the code was already used (each works once), or it expired (30 s) |
| 429 *"Too many attempts"* | Wait for the window (15 min) or restart the backend in dev (the limiter is in memory) |
| Signed out after re-seeding, or codes stop working | The seed recreated the users; delete the old authenticator entries and enrol again |
| AI prompt says *"AI drafting isn't configured"* | No `LLM_API_KEY`, and `LLM_MOCK` is not `true` (or `NODE_ENV=production`). Set `LLM_MOCK=true` locally |
| AI prompt says *"The local AI server … isn't reachable"* | Ollama isn't running. `brew services start ollama` (or `ollama serve`); check `curl localhost:11434/api/version` |
| AI prompt says *"model … isn't available"* | `ollama pull qwen2.5:7b` (or the model in `LLM_MODEL`) |
| AI prompt times out | First draft loads the model (~10–20 s extra). Free RAM, raise `LLM_TIMEOUT_MS`, or use `qwen2.5:3b` |

### 8.11 Local dev against production DB

You can point the local backend at the production Neon database (`DATABASE_URL` in `backend/.env`) to build
features on real data. Rules, so **no data is lost**:

- **Guarded commands.** `npm run db:migrate`, `db:reset`, `db:seed` and the Prisma seed (`prisma db seed`, also run by
  `migrate reset`) first run `scripts/guard-db.mjs`. It exits with an error unless `DATABASE_URL` (environment first,
  then `backend/.env`) points at `localhost`, `127.0.0.1` or `::1`. `prisma/seed.ts` has the same check. Override only
  with `ALLOW_REMOTE_DB_DESTRUCTIVE=1` (never against Neon). `npm run db:guard` shows which database you're on.
  Calling `npx prisma migrate dev/reset` directly bypasses the npm guard, so always use the npm scripts.
- **Backups.** `npm run db:backup` writes a read-only, consistent JSON snapshot of every table to
  `backend/backups/db-backup-<timestamp>.json` (gitignored, mode 600; it contains password hashes and encrypted
  TOTP secrets). Take one before any risky work. Neon branches / point-in-time restore are a second safety net.
- **Same `TOTP_ENCRYPTION_KEY` as production.** Locally set `TOTP_ENCRYPTION_KEY` to the Render value; otherwise
  authenticator codes can't be decrypted and anyone who (re-)enrols locally gets a secret production can't read.
- **Tests.** `npm test` only uses a DB when `DATABASE_URL` is exported in the shell (the auth-flow test creates and
  deletes its own user). Don't export the Neon URL when running tests.

Workflow for a new feature that changes the schema:

1. Edit `prisma/schema.prisma`, then create the migration against the **local Docker DB**:
   `DATABASE_URL=postgresql://devhub:devhub@localhost:5433/devhub npm run db:migrate -- --name short_name`.
2. Review the SQL: **additive only** (new tables, new nullable columns or columns with defaults, new indexes, new
   enum values via the new-enum pattern). No `DROP`, no renames/type changes that lose data, no `NOT NULL` without a default.
3. Commit the migration, then apply it to Neon with `npm run db:migrate:safe` (runs `db:backup`, then
   `prisma migrate deploy`, which only applies committed migrations and never resets). Render's pre-deploy
   `prisma migrate deploy` is a no-op afterwards.

## 9. Deployment (production)

### 9.0 Recommended setup

```mermaid
flowchart LR
  User["Team browser"] -->|"HTTPS devhub.example.com"| Vercel["Vercel: Next.js frontend (root directory frontend)"]
  Vercel -->|"rewrite /api/* to BACKEND_URL over HTTPS"| Render["Render web service: Express API (root directory backend, 1 instance)"]
  Render -->|"DATABASE_URL with sslmode=require"| Neon[("Neon Postgres")]
  Render -->|"BLOB_READ_WRITE_TOKEN"| Blob["Vercel Blob"]
  Render -->|"LLM_BASE_URL / LLM_API_KEY"| LLM["OpenAI-compatible API (Ollama VM, Groq, OpenRouter)"]
```

- **Database**: Neon Postgres (Supabase as the alternative).
- **Backend**: a Render web service, single instance, paid Starter plan (no spin-down). Alternatives: Railway, Fly.io or Google Cloud Run with the same commands.
- **Frontend**: Vercel, root directory `frontend`, `BACKEND_URL` pointing at the Render URL.
- Keep all three in nearby regions (for a team in India, for example Render Singapore and Neon `aws-ap-southeast-1` Singapore).

Order of work: database → backend → frontend → set the backend's `WEBSITE_DOMAIN` to the final frontend URL → smoke test.

### 9.1 Database on Neon (or Supabase)

1. Create a Neon account and a **project** (Postgres 16 or 17; the code works on 15+) in a region near the backend. Optionally rename the default database to `devhub`.
2. Under **Connect**, copy the connection strings:
   - **Direct** (host without `-pooler`): use it for migrations and, at this scale, also for the running backend. A single long-running Express process keeps a small Prisma connection pool, which is fine for 10–20 users.
   - **Pooled** (host contains `-pooler`): optional for the backend at runtime. The Prisma schema has no `directUrl`, so if `DATABASE_URL` is the pooled URL, run migrations with the direct URL explicitly (next step).
   - Both need `?sslmode=require`.
3. Apply migrations from your Mac (or let Render do it, see 9.2):

   ```bash
   cd ~/Desktop/devhub/backend
   DATABASE_URL='postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/devhub?sslmode=require' \
     npx prisma migrate deploy
   ```

4. **Create only the admin, no fake data.** Never run `npm run db:seed` against production: it deletes every app table and creates users with known dev passwords. Use the admin script instead, either in the Render Shell after the first deploy or from your Mac:

   ```bash
   cd ~/Desktop/devhub/backend
   DATABASE_URL='postgresql://...neon.tech/devhub?sslmode=require' \
     npm run create-admin -- --email you@yourcompany.com --name "Chandrakiran Sisodia"
   # Password is prompted (hidden) twice, or taken from ADMIN_PASSWORD. Hashed with argon2id.
   ```

   It creates the `admin` and `viewer` roles if missing and the single admin user, and refuses to run if an admin (or that email) already exists. At first sign-in the admin scans the QR code with an authenticator app; all other users are then added from the Users page.

**Supabase instead of Neon**: create a project and open **Connect** for the Prisma connection strings. The direct host `db.<ref>.supabase.co:5432` may be IPv6-only, so from Render use the **Session pooler** string (port 5432 on the `pooler.supabase.com` host), which also works for `prisma migrate deploy`. The Transaction pooler (port 6543) needs `?pgbouncer=true` and is not suitable for migrations. Run the same admin SQL in the Supabase SQL Editor.

### 9.2 Backend on Render (primary recommendation)

1. Render dashboard → **New → Web Service** → connect the Git repository.
2. Service settings:

   | Setting | Value |
   |---|---|
   | Root Directory | `backend` |
   | Runtime / Language | Node |
   | Region | Same as, or near, the database |
   | Build Command | `npm ci --include=dev && npm run build` |
   | Pre-Deploy Command | `npx prisma migrate deploy` (if your plan has no pre-deploy step, append `&& npx prisma migrate deploy` to the build command) |
   | Start Command | `npm start` (runs `node --env-file-if-exists=.env dist/index.js`) |
   | Health Check Path | `/api/health` |
   | Instance type | Starter (paid). The free type sleeps when idle, so the first sign-in after a pause can time out |
   | Instances | **1**. Do not enable autoscaling (in-memory rate limiter) |

   `--include=dev` matters: with `NODE_ENV=production` set, `npm ci` would skip `typescript` and the `prisma` CLI, which are devDependencies needed to build and migrate.
3. Environment variables (Render → Environment):

   | Variable | Value |
   |---|---|
   | `NODE_VERSION` | Optional: `backend/.node-version` already pins `22` (`engines`: `>=22.9 <25`) |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Neon direct (or pooled) URL with `?sslmode=require` |
   | `WEBSITE_DOMAIN` (alias `FRONTEND_ORIGIN`) | Exact `https://` frontend origin, e.g. `https://devhub.example.com`. On the first deploy use the `*.vercel.app` URL, then update it after adding the custom domain |
   | `CORS_ORIGINS` | Optional: the `*.vercel.app` production URL, if it should keep working alongside the custom domain |
   | `TOTP_ENCRYPTION_KEY` | Output of `openssl rand -base64 32` |
   | `APP_NAME`, `TOTP_ISSUER` | Optional, e.g. `FE Panel` |
   | `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Groq: `https://api.groq.com/openai/v1`, `openai/gpt-oss-120b`, your Groq key (create a fresh one for production). Without an LLM, AI drafting shows "not configured" and manual entry still works. `LLM_MOCK` is always ignored in production |
   | `BLOB_READ_WRITE_TOKEN` | From a **private** Vercel Blob store (9.3). Files are served only through `/api/uploads/files/...` to signed-in users |
   | `COOKIE_SECURE` | Leave empty (true in production) |

   Do not set `PORT`; Render provides it. With `NODE_ENV=production` the API **refuses to start** if `DATABASE_URL` or `TOTP_ENCRYPTION_KEY` is missing or `WEBSITE_DOMAIN` is not an `https://` origin, and it trusts exactly one proxy hop (`trust proxy` = 1), so `X-Forwarded-For` can't be spoofed to dodge the login rate limit.
5. After the first successful deploy, open Render → Shell and create the admin: `npm run create-admin -- --email you@yourcompany.com --name "Your Name"`.
4. Deploy and read the log. You should see lines like these (the `localhost` in the first line is only a log message):

   ```text
   DevHub API listening on http://localhost:10000
     TOTP secret key:  TOTP_ENCRYPTION_KEY
     Session cookie:   Secure (HTTPS only), 168 h
     AI drafting:      llm
     Uploads:          Vercel Blob
   ```

   Then `curl https://<service>.onrender.com/api/health` should return `{"ok":true}`.

**How CORS, Origin and cookies work here.** The browser calls the Vercel domain and Vercel proxies to Render server-side. The backend sees the browser's `Origin` (the Vercel domain), which must equal `WEBSITE_DOMAIN` or be listed in `CORS_ORIGINS`; otherwise every POST, PATCH and DELETE, including sign-in, fails with 403. The cookie has no `Domain` attribute, so it belongs to the frontend domain and is sent on every `/api/*` call. It is `Secure`, so HTTPS is required end to end (Vercel and Render both provide it). CORS headers themselves are not needed for this same-origin traffic.

**Alternatives** (same build and start commands, same variables, one instance):

- **Railway**: new service from the repo, root directory `backend`, set build and start commands, healthcheck path `/api/health`, and run migrations as a pre-deploy command or from your Mac.
- **Fly.io**: `fly launch` in `backend/` (Node buildpack or a small Dockerfile), `fly secrets set ...` for the variables, one machine with `min_machines_running = 1`, and `release_command = "npx prisma migrate deploy"`.
- **Google Cloud Run**: build a container (`npm ci --include=dev && npm run build`, start `npm start`), deploy with `--min-instances=1 --max-instances=1`, secrets from Secret Manager, and run migrations from your Mac or a Cloud Run job.

### 9.3 Frontend on Vercel

1. Vercel → **Add New → Project** → import the repository.
2. **Root Directory**: `frontend`. Framework preset: Next.js (detected). Keep the default build command and output. Node.js version 22.x or 24.x (Project Settings → General).
3. Environment variables (Project Settings → Environment Variables):
   - `BACKEND_URL` = `https://<service>.onrender.com` for **Production**.
   - For **Preview**, point at a separate staging backend or do not use previews. A preview pointing at the production backend acts on production data, and its preview origin is not in `WEBSITE_DOMAIN`, so writes would be blocked anyway.
4. Deploy. `BACKEND_URL` is read when `next.config.ts` is evaluated at build time, so **redeploy after any change to it**. This rewrite is what keeps the cookie first-party: the browser never calls the Render URL directly.
5. **Vercel Blob** for uploads: Project → **Storage → Create → Blob**, connect it to the project, copy `BLOB_READ_WRITE_TOKEN` and set it on the **Render backend** (the frontend does not use it).
6. **Custom domain**: Project Settings → Domains → add e.g. `devhub.example.com`, create the DNS record Vercel shows (for a subdomain usually a CNAME), and wait for the certificate. Then set `WEBSITE_DOMAIN=https://devhub.example.com` on Render and redeploy the backend. Sessions on the old `vercel.app` URL are separate cookies, so users sign in again on the new domain.

### 9.4 Secrets checklist

| Secret | Where | How | Notes |
|---|---|---|---|
| `TOTP_ENCRYPTION_KEY` | Render | `openssl rand -base64 32` | Keep a copy in a password manager. **Never rotate it** unless every user's two-factor is reset and re-enrolled (the admin via the SQL in 8.8). Use a different key per environment |
| `DATABASE_URL` | Render, password manager | Neon or Supabase dashboard | Contains the DB password; reset it in the provider if leaked |
| `LLM_API_KEY` | Render only | Provider dashboard | Set a monthly spend limit at the provider. Never put it in the frontend |
| `BLOB_READ_WRITE_TOKEN` | Render only | Vercel → Storage → Blob | Grants write access to the store |
| Admin temporary password | Nowhere after first use | You choose | Replaced at first sign-in |

Never commit `.env` or `.env.local` (both are git-ignored).

### 9.5 Post-deploy checklist and smoke test

1. `curl https://<backend>/api/health` → `{"ok":true}`; the Render log shows the TOTP key, Secure cookie, AI and Blob lines from 9.2.
2. `curl -i https://<frontend>/api/me` → `401 {"error":"Not signed in"}` (proves the rewrite reaches the backend).
3. Open the frontend and sign in as the admin with the temporary password → QR code → scan → code → new password → Dashboard.
4. In the browser developer tools, check that the `devhub_session` cookie is on the frontend domain and is `HttpOnly`, `Secure` and `SameSite=Lax`.
5. Sign out and in again (password, then code). Re-using the same code within 30 s must fail.
6. Create a project and a task by hand; try the AI prompt in Tasks if a key is set, then confirm and save.
7. Create a doc with a Mermaid block, upload an image, reload, and check the image still shows (its URL is `/api/uploads/files/...`; opening it signed out returns 401). Try an image close to 5 MB to confirm the proxy passes it.
8. Add a Viewer on the Users page, sign in as them in a private window, enrol TOTP and set a password. Confirm they see no add, edit or delete controls, **can** change a task's status, and cannot open another user's dashboard.
9. Deactivate the test Viewer and confirm their session ends.
10. Confirm the database provider's backups or restore window (see 10.5).

### 9.6 Rough monthly cost at 10–20 users

**Approximate only (October 2026). Check each provider's pricing page before deciding.**

| Item | Likely plan | Approx. per month |
|---|---|---|
| Render web service | Starter (0.5 CPU, 512 MB) | about US$7 |
| Neon Postgres | Free tier (0.5 GB) may be enough; paid plans are usage-based with a small minimum | US$0 to about US$20 |
| Vercel | Hobby is free but limited to personal, non-commercial use; a company team should use Pro (charged per member) | US$0 (Hobby) or about US$20 per seat (Pro) |
| Vercel Blob | A few hundred MB of wireframes | Usually within included usage |
| LLM | Occasional admin prompts | US$0 on Groq/OpenRouter free tiers; self-hosted Ollama = VM cost (~US$20–40/month CPU, 8 GB RAM) |
| **Total** | | **roughly US$7–50**, mainly depending on the Vercel plan and Neon tier |

Supabase as the database: the free tier pauses inactive projects; Pro is about US$25 per month.

### 9.7 Optional CI (suggestion only, not in the repo)

A GitHub Actions workflow, for example `.github/workflows/ci.yml`, could run the same checks on every push and pull request:

```yaml
name: CI
on: [push, pull_request]
jobs:
  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    services:
      postgres:
        image: postgres:16-alpine
        env: { POSTGRES_USER: devhub, POSTGRES_PASSWORD: devhub, POSTGRES_DB: devhub }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready -U devhub" --health-interval 5s --health-retries 10
    env:
      DATABASE_URL: postgresql://devhub:devhub@localhost:5432/devhub
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: backend/package-lock.json }
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build
        env: { BACKEND_URL: "http://localhost:4000" }
```

### 9.8 Before going live

Found while reading the code. Items marked **Fixed** were addressed in the pre-production hardening commit; the rest still need a setting or a decision.

1. **Fixed (still set it):** with `NODE_ENV=production` the API fails fast on missing `DATABASE_URL`, `TOTP_ENCRYPTION_KEY` or a non-https `WEBSITE_DOMAIN`; cookies are Secure and the AI mock is ignored. Without `NODE_ENV=production` none of this applies.
2. **Localhost defaults.** `WEBSITE_DOMAIN` defaults to `http://localhost:3000` and the frontend's `BACKEND_URL` to `http://localhost:4000`. If either is missing in production, sign-in fails (403 from the Origin check, or the proxy cannot reach the API). `BACKEND_URL` is fixed at build time.
3. **Local-disk uploads are not persistent** on Render, Railway, Fly.io or Cloud Run (ephemeral filesystems, wiped on each deploy). Set `BLOB_READ_WRITE_TOKEN` before anyone uploads.
4. **Fixed:** Blob uploads are now `access: "private"` and streamed through the authenticated `/api/uploads/files/...` route (create the Blob store as private).
5. **Single instance only.** The rate limiter is in memory: per process, reset on restart. Do not scale out without moving it to Redis or the database.
6. **Fixed:** `trust proxy` is `1` in production only (Render's single proxy hop) and off locally.
7. **Fixed:** `engines` is `>=22.9 <25` in both packages, with `.nvmrc` / `.node-version` set to 22.
8. **Build needs devDependencies.** `typescript` and the `prisma` CLI are devDependencies; use `npm ci --include=dev` when `NODE_ENV=production` is set during the build.
9. **Fixed:** use `npm run create-admin` (9.1 step 4); never `db:seed` in production.
10. **Pooled connection strings.** `schema.prisma` has no `directUrl`; if `DATABASE_URL` is pooled, run `migrate deploy` with the direct URL.
11. **Single admin with no self-recovery in the UI.** If the admin loses their authenticator, recovery is the SQL in 8.8 run against production. Keep console access and a tested procedure, and consider giving a second trusted person database console access.
12. **Expired sessions are only removed when looked up again.** Abandoned rows slowly accumulate in `sessions`. Harmless at this scale; optionally run `DELETE FROM sessions WHERE expires_at < now();` now and then.
13. **The health check does not touch the database.** `/api/health` reports OK even if Postgres is unreachable. Use the smoke test (or add a database ping later) for real monitoring.
14. **Preview deployments.** Vercel preview URLs are not allowed origins and would proxy to whatever `BACKEND_URL` Preview has. Point Preview at a staging backend or avoid previews with production data.
15. **Fixed:** helmet on the API; `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and HSTS (production) in `next.config.ts`. A full script CSP is not set.
16. **Minor:** the upload error says "max 5 MB" whatever `UPLOAD_MAX_BYTES` is; `NEXT_PUBLIC_APP_NAME` is documented but unused; the `docker-compose.yml` defaults (port 5432, Postgres 17) differ from the owner's Mac (5433, Postgres 16), which the root `.env` handles.

## 10. Accessing database data

### 10.1 Local connection details

From `docker-compose.yml` and the owner's `backend/.env`:

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `5433` (Compose default 5432 when there is no root `.env`) |
| Database | `devhub` |
| User | `devhub` |
| Password | `devhub` (local development only) |
| SSL | Off |
| URL | `postgresql://devhub:devhub@localhost:5433/devhub` |

### 10.2 Local options

**Prisma Studio**, a table editor in the browser that uses `DATABASE_URL` from `backend/.env`:

```bash
cd ~/Desktop/devhub/backend
npx prisma studio            # opens http://localhost:5555
```

**psql inside the container** (nothing to install on the Mac):

```bash
docker exec -it devhub-db-1 psql -U devhub -d devhub
# inside psql: \dt (tables), \d users (columns), \x (expanded rows), \q (quit)
```

From the repo root, `docker compose exec db psql -U devhub -d devhub` does the same. With `libpq` installed on the Mac: `psql postgresql://devhub:devhub@localhost:5433/devhub`.

**GUI clients**: TablePlus, DBeaver, pgAdmin or Postico. Create a PostgreSQL connection with host `localhost`, port `5433`, user `devhub`, password `devhub`, database `devhub`, SSL off.

### 10.3 Production options

- **Neon console**: project → **Tables** to browse and edit rows, **SQL Editor** to run queries. Supabase has the same as **Table Editor** and **SQL Editor**.
- **Prisma Studio pointed at production**, from your Mac, with read-only caution:

  ```bash
  cd ~/Desktop/devhub/backend
  DATABASE_URL='<production direct URL with sslmode=require>' npx prisma studio
  ```

  Prisma Studio edits and deletes rows with a click and has no undo. Prefer the console for reading, close Studio when done, and for routine browsing create a read-only database role in Neon or Supabase and use its URL.
- **GUI clients** with the provider's host, user and password, and SSL **required**.

### 10.4 Useful queries

```sql
-- Users with role and two-factor state
SELECT u.name, u.email, r.name AS role, u.active, u.totp_enabled, u.must_change_password, u.last_login_at
FROM users u JOIN "Role" r ON r.id = u.role_id
ORDER BY r.name, u.name;

-- Work items by section and status
SELECT type, status, count(*) FROM work_items GROUP BY type, status ORDER BY type, status;

-- Open POCs with outcome and time box
SELECT title, status, outcome, timebox_end FROM work_items
WHERE type = 'POC' AND status NOT IN ('DONE', 'REJECT') ORDER BY timebox_end NULLS LAST;

-- Roadmap by target period
SELECT target_period, title, status FROM work_items WHERE type = 'ROADMAP' ORDER BY target_period, title;

-- Project progress inputs (the UI shows Done divided by all items except Reject)
SELECT p.name,
       count(w.id) FILTER (WHERE w.status = 'DONE') AS done,
       count(w.id) FILTER (WHERE w.status <> 'REJECT') AS counted
FROM projects p LEFT JOIN work_items w ON w.project_id = p.id
GROUP BY p.name ORDER BY p.name;

-- Recent activity
SELECT a.created_at, u.name, a.entity_type, a.action, a.summary
FROM activity_logs a JOIN users u ON u.id = a.user_id
ORDER BY a.created_at DESC LIMIT 20;

-- Active full sessions per user
SELECT u.email, count(*) FROM sessions s JOIN users u ON u.id = s.user_id
WHERE s.expires_at > now() AND s.mfa_verified GROUP BY u.email;
```

### 10.5 Backups and restore

- **Local dump** (from the container):

  ```bash
  docker exec devhub-db-1 pg_dump -U devhub -d devhub -Fc > devhub-$(date +%F).dump
  # restore into the local database (replaces existing objects):
  docker exec -i devhub-db-1 pg_restore -U devhub -d devhub --clean --if-exists < devhub-2026-10-14.dump
  ```

- **Production dump** (needs a `pg_dump` whose major version is at least the server's, e.g. from `brew install libpq`):

  ```bash
  pg_dump 'postgresql://USER:PASSWORD@HOST/devhub?sslmode=require' -Fc -f devhub-prod-$(date +%F).dump
  ```

  The dump contains password hashes and encrypted TOTP secrets, so store it as carefully as the database. Restored into another environment, TOTP only works if that environment uses the same `TOTP_ENCRYPTION_KEY`.
- **Neon**: point-in-time restore within the plan's history window, and **branches** (instant copy-on-write copies). Before a risky migration, create a branch as a restore point; to look at old data, create a branch from a past timestamp and connect to it. Supabase has daily backups, and point-in-time recovery as a paid add-on.

### 10.6 Warning about sensitive columns

Do not edit `users.password_hash`, `users.totp_secret_enc`, `users.totp_last_step`, `sessions.token_hash` or `sessions.pending_totp_secret_enc` by hand. A wrong value locks users out or breaks decryption. The only supported manual changes are the documented resets in 8.8: clearing the TOTP columns together with `totp_enabled=false`, and setting a freshly generated argon2id hash with `must_change_password=true`. Do not change a user's `role_id` to create a second admin; the product assumes a single admin.

## 11. Maintenance

### 11.1 Adding a migration

1. Edit `backend/prisma/schema.prisma`.
2. `cd backend && npm run db:migrate -- --name short_description`. This runs `prisma migrate dev`: it creates `prisma/migrations/<timestamp>_short_description/migration.sql`, applies it to the local database and regenerates the client.
3. Review the SQL. For renames or type changes, edit it so existing data is kept (see `20261013090000_work_items` for an in-place rename and an enum conversion). That migration avoids `ALTER TYPE ... ADD VALUE` inside a transaction by creating a new enum and converting the column; follow the same pattern.
4. Update zod schemas (`lib/schemas.ts`), DTOs (`lib/dto.ts`), frontend types (`lib/types.ts`) and the seed if needed. Run lint, type-check and tests.
5. Commit the migration folder. Apply it to Neon with `npm run db:migrate:safe` (backup, then `prisma migrate deploy`; see 8.11; additive migrations only). Otherwise `npx prisma migrate deploy` (the Render pre-deploy command) applies it. Create a Neon branch first as a restore point for anything destructive.

### 11.2 Adding a new work section (WorkItem type pattern)

Example: a new **Spikes** section. The four existing sections are driven by small configuration tables, so most of the work is configuration:

1. **Schema**: add `SPIKE` to `enum WorkItemType` (plus any new nullable columns on `WorkItem`), and create a migration (11.1).
2. **`backend/src/lib/workTypes.ts`**: add `"SPIKE"` to `WORK_TYPES` and an entry in `WORK_TYPE_META` (`path: "spikes"`, `entity: "spike"`, `label`, `noun`, `extras`). The router is mounted from this table in `app.ts`, and the viewer status allow-list regex is built from the same paths, so both follow automatically. New extra fields also go into `ExtraField` and `EXTRA_FIELDS`.
3. **`backend/src/lib/activity.ts`**: add `"spike"` to the `EntityType` union. Dashboard queries use `WORK_ENTITY_TYPES`, which is derived automatically.
4. **`backend/src/lib/schemas.ts`**: add any new extra fields to the `extra` object.
5. **`backend/src/lib/draft.ts`**: add entries to `SECTION_HELP` (prompt guidance) and `IDEAS` (mock titles), and extend the type-specific handling if the section has extras.
6. **`frontend/lib/types.ts`**: add `"SPIKE"` to `WorkType` (and new fields to the item type).
7. **`frontend/lib/workTypes.ts`**: add to `WORK_TYPES` and `WORK` (path, label, lucide icon, subtitle, extras, empty-state texts, AI placeholder and examples, tint).
8. **`frontend/lib/nav.ts`**: add `"SPIKE"` to the type list in `NAV` (the sidebar order follows the requirements).
9. **Frontend page**: create `frontend/app/(app)/spikes/page.tsx` returning `<WorkSectionPage type="SPIKE" />`.
10. **Tests**: add `"spikes"` to `SECTIONS` in `backend/tests/permissions.test.ts` so the status allow-list is checked, and add draft-parser cases for new extras.
11. Run `npm run lint`, `npm run typecheck` and `npm test` in the backend, and `npm run lint`, `npm run typecheck` and `npm run build` in the frontend.

### 11.3 Updating theme tokens

- All colours live in `frontend/app/globals.css`: light values in `@theme { --color-* }`, dark overrides in `.dark { ... }`, and pill colours as `--tone-<name>-bg|fg|dot` in both. Components only use token utilities (`bg-surface`, `text-ink`, `text-accent-600`, `bg-ai` and so on) or `var(--tone-*)`, so change values here only.
- Current "Lagoon" core values:

  | Token | Light | Dark |
  |---|---|---|
  | `--color-canvas` / `--color-surface` | `#f8fafc` / `#ffffff` | `#070d17` / `#0f1724` |
  | `--color-ink` / `--color-muted` | `#0f172a` / `#596a7f` | `#e7eef7` / `#8a9ab2` |
  | `--color-accent-600` / `--color-accent-500` | `#0f766e` / `#0d9488` | `#5eead4` / `#2dd4bf` |
  | `--color-highlight` | `#f59e0b` | `#fbbf24` |
  | AI / primary gradient | `#047857 → #0F766E → #0E7490` | same |

- Mermaid and Recharts colours are set in JavaScript per theme (`components/MermaidView.tsx`, `components/ChartBlock.tsx`); update them to match when the palette changes. The browser theme colours are in `app/layout.tsx` (`viewport.themeColor`).
- Keep text and background pairs at WCAG AA contrast in both themes (the current pill pairs pass).
- The theme choice is stored in `localStorage` as `devhub.theme` (`ThemeProvider` in `app/providers.tsx`, default `system`).

### 11.4 Running tests

```bash
cd ~/Desktop/devhub/backend
npm test                                   # all tests; auth-flow needs the local DB running
npx vitest run tests/permissions.test.ts   # one file
npx vitest                                 # watch mode
```

`auth-flow.test.ts` creates a temporary user in the database named by `DATABASE_URL` and removes it afterwards; it is skipped when no database is reachable. Never run tests with `DATABASE_URL` pointing at production. The frontend has no unit tests; rely on `npm run lint`, `npm run typecheck`, `npm run build` and the smoke test in 9.5.

### 11.5 Routine upkeep

- Dependencies: `npm outdated` in each app; update, then run all checks. Read the upgrade guide before a Prisma or Next.js major upgrade.
- After pulling changes: `npm install` in both apps and `npm run db:deploy` in the backend.
- If the Next.js dev server shows odd module errors, delete `frontend/.next` (8.10).
- Keep this document in step with the code (`docs/TECHNICAL.md`).
