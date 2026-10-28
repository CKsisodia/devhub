/**
 * Seed script with CLEARLY FAKE example data (names from the design brief, @devhub.test emails, known dev
 * passwords). WARNING: wipes all app tables first. Run with `npm run db:seed`. Never use these in production.
 */
import { PrismaClient, type PocOutcome, type WorkItemStatus, type WorkItemType } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Safety guard: this script WIPES all app tables, so it only runs against a local database.
// (Same rule as scripts/guard-db.mjs; override only with ALLOW_REMOTE_DB_DESTRUCTIVE=1.)
{
  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  let host = "";
  try {
    host = new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase();
  } catch {
    host = "";
  }
  if (!LOCAL_HOSTS.has(host) && process.env.ALLOW_REMOTE_DB_DESTRUCTIVE !== "1") {
    console.error(`[seed] BLOCKED: DATABASE_URL points to a non-local host (${host || "unset/unparseable"}).`);
    console.error("[seed] The seed wipes all app tables. Override only with ALLOW_REMOTE_DB_DESTRUCTIVE=1.");
    process.exit(1);
  }
}

const prisma = new PrismaClient();

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000);

export const ADMIN_PASSWORD = "Admin@devhub26";
export const VIEWER_PASSWORD = "Viewer@devhub26";

const WIREFRAME_FILE = "5eed0000-0000-4000-8000-000000000001.svg";
const WIREFRAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500" font-family="Inter, Arial, sans-serif">
  <rect width="800" height="500" fill="#FAFAFA"/>
  <rect x="250" y="70" width="300" height="360" rx="16" fill="#FFFFFF" stroke="#D4D4D8" stroke-width="2"/>
  <rect x="280" y="100" width="90" height="16" rx="4" fill="#7C3AED"/>
  <text x="280" y="160" font-size="22" font-weight="600" fill="#18181B">Sign in</text>
  <text x="280" y="184" font-size="13" fill="#71717A">Email and password, then authenticator code</text>
  <rect x="280" y="200" width="240" height="30" rx="8" fill="#FFFFFF" stroke="#D4D4D8"/>
  <text x="292" y="220" font-size="13" fill="#A1A1AA">you@company.com</text>
  <rect x="280" y="238" width="240" height="30" rx="8" fill="#FFFFFF" stroke="#D4D4D8"/>
  <text x="292" y="258" font-size="13" fill="#A1A1AA">••••••••••</text>
  <rect x="280" y="278" width="240" height="40" rx="8" fill="#4F46E5"/>
  <text x="377" y="303" font-size="14" font-weight="600" fill="#FFFFFF">Continue</text>
  <g fill="#FFFFFF" stroke="#D4D4D8">
    <rect x="280" y="340" width="32" height="40" rx="6"/><rect x="321" y="340" width="32" height="40" rx="6"/>
    <rect x="362" y="340" width="32" height="40" rx="6"/><rect x="403" y="340" width="32" height="40" rx="6"/>
    <rect x="444" y="340" width="32" height="40" rx="6"/><rect x="485" y="340" width="32" height="40" rx="6"/>
  </g>
  <text x="280" y="405" font-size="12" fill="#71717A">Step 2: 6-digit authenticator code (example wireframe)</text>
</svg>`;

async function main() {
  // Wipe (children first)
  await prisma.activityLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.doc.deleteMany({ where: { parentId: { not: null } } });
  await prisma.doc.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.session.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.learningItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();

  const admin = await prisma.role.create({ data: { name: "admin" } });
  const viewer = await prisma.role.create({ data: { name: "viewer" } });

  // Known DEV passwords (documented in the README). TOTP is NOT pre-enrolled: each user scans a QR code
  // on first sign-in, exactly like a real new user.
  const adminHash = await hashPassword(ADMIN_PASSWORD);
  const viewerHash = await hashPassword(VIEWER_PASSWORD);
  const mk = (name: string, email: string, roleId: string, active = true) =>
    prisma.user.create({ data: { name, email, passwordHash: roleId === admin.id ? adminHash : viewerHash, roleId, active } });
  const asha = await mk("Asha Rao", "asha@devhub.test", admin.id);
  const ravi = await mk("Ravi Kumar", "ravi@devhub.test", viewer.id);
  const meera = await mk("Meera Iyer", "meera@devhub.test", viewer.id);
  const daniel = await mk("Daniel Fernandes", "daniel@devhub.test", viewer.id);
  const priya = await mk("Priya Nair", "priya@devhub.test", viewer.id, false); // deactivated example

  const login = await prisma.project.create({
    data: {
      name: "Login Redesign",
      description: "Rebuild the sign-in experience: email + password with authenticator-app two-factor, accessible inputs and clear error states. (Example project)",
      status: "ACTIVE",
      startDate: day(-30),
      targetDate: day(21),
      createdById: asha.id,
      members: { create: [asha, ravi, meera, daniel].map((u) => ({ userId: u.id })) },
    },
  });
  const ds = await prisma.project.create({
    data: {
      name: "Design System v2",
      description: "Tokens, components and docs for the next version of our design system. (Example project)",
      status: "ACTIVE",
      startDate: day(-60),
      targetDate: day(45),
      createdById: asha.id,
      members: { create: [asha, ravi, meera, priya].map((u) => ({ userId: u.id })) },
    },
  });
  const checkout = await prisma.project.create({
    data: {
      name: "Checkout Performance",
      description: "Bring checkout LCP under 2.5 s on mid-range phones. Paused until Q1. (Example project)",
      status: "ON_HOLD",
      startDate: day(-20),
      targetDate: day(60),
      createdById: asha.id,
      members: { create: [asha, daniel].map((u) => ({ userId: u.id })) },
    },
  });

  type T = [string | null, string, WorkItemStatus, string, number];
  const tasks: T[] = [
    // project, title, status, notes, hours since last update
    [login.id, "Email + password form", "IN_PROGRESS", "Labels above inputs, show/hide password toggle.\n\n- Autofill friendly (`autocomplete=\"username\"` / `current-password`)\n- Inline error under the field", 3],
    [login.id, "6-box authenticator code input", "IN_PROGRESS", "Auto-advance, paste fills all boxes, backspace moves back. Numeric keypad on mobile.", 5],
    [login.id, "QR code setup screen", "IN_PROGRESS", "Show the QR plus the secret as text for manual entry. Explain which apps work (Google Authenticator, Authy, 1Password).", 8],
    [login.id, "Remember the last used email", "TODO", "Pre-fill the email field on the sign-in screen (local storage, never the password).", 6],
    [login.id, "Error copy for wrong code / locked out", "HOLD", "Waiting for final wording from design.", 30],
    [login.id, "Session expiry redirect", "DONE", "Send the user back to /login and keep the page they were on.", 50],
    [login.id, "Glass card + gradient mesh background", "DONE", "", 70],
    [login.id, "SMS OTP fallback", "REJECT", "Dropped: we use an authenticator app only (no SMS costs or DLT registration).", 26],
    [ds.id, "Status pill component", "IN_PROGRESS", "Five variants: To do, In progress, Done, Hold, Reject.", 4],
    [ds.id, "Colour tokens as CSS variables", "IN_PROGRESS", "Expose zinc scale + accent gradient as `--color-*`.", 20],
    [ds.id, "Motion tokens (durations, easings)", "TODO", "150–200 ms, ease-out; respect prefers-reduced-motion.", 14],
    [ds.id, "Fix focus rings on buttons", "DONE", "2 px ring, offset 2, accent colour.", 72],
    [ds.id, "Typography scale (Inter)", "DONE", "", 120],
    [ds.id, "Docs site for components", "HOLD", "Parked until the component API is stable.", 96],
    [ds.id, "Kanban card component", "REJECT", "Not needed: tasks are a simple list.", 40],
    [checkout.id, "Audit checkout bundle size", "HOLD", "Project paused until Q1.", 150],
    [checkout.id, "Measure LCP on mid-range Android", "IN_PROGRESS", "Baseline: 3.4 s on a Moto G. Target < 2.5 s.", 10],
    [null, "Upgrade to the latest Next.js minor", "IN_PROGRESS", "Team-wide chore, not tied to a project.", 12],
    [null, "Write onboarding notes for new joiners", "TODO", "Local setup, review checklist, where docs live.", 9],
    [null, "Try container queries in the card grid", "HOLD", "Idea from the learning section.", 200],
  ];

  type Extra = { targetPeriod?: string; goal?: string; timeboxEnd?: Date; findings?: string; outcome?: PocOutcome };
  type W = [WorkItemType, string | null, string, WorkItemStatus, string, number, Extra];
  const y = new Date().getUTCFullYear();
  const others: W[] = [
    // Roadmap: target period = month or quarter
    ["ROADMAP", ds.id, "Design System v2 stable release", "IN_PROGRESS", "All core components documented and used in two products.", 18, { targetPeriod: `${y}-Q4` }],
    ["ROADMAP", login.id, "New sign-in live for everyone", "IN_PROGRESS", "Email + password + authenticator app for all internal tools.", 22, { targetPeriod: `${y}-11` }],
    ["ROADMAP", checkout.id, "Checkout LCP under 2.5 s", "HOLD", "Resumes when the checkout project restarts.", 100, { targetPeriod: `${y + 1}-Q1` }],
    ["ROADMAP", null, "Dark mode across all apps", "TODO", "Tokens are ready for it; needs a design pass.", 60, { targetPeriod: `${y + 1}-Q2` }],
    ["ROADMAP", null, "Retire the legacy jQuery admin", "TODO", "Last two screens still use it.", 130, { targetPeriod: `${y + 1}-Q3` }],
    ["ROADMAP", ds.id, "Icon set refresh", "DONE", "Moved to Lucide, 1.5 px stroke.", 300, { targetPeriod: `${y}-Q3` }],
    // R&D: goal, time box, findings
    ["RND", null, "Signals vs. React state for large forms", "IN_PROGRESS", "Compare re-render counts on the checkout form.", 7, { goal: "Decide whether signals are worth adopting for big forms.", timeboxEnd: day(9), findings: "Early numbers: ~40% fewer renders, but extra tooling." }],
    ["RND", ds.id, "CSS anchor positioning for popovers", "TODO", "", 16, { goal: "Can we drop the positioning library for menus and tooltips?", timeboxEnd: day(21) }],
    ["RND", null, "Bundle analysis tooling", "DONE", "", 90, { goal: "Pick one tool for CI bundle-size checks.", timeboxEnd: day(-5), findings: "Chose the bundler's built-in analyzer + a size budget in CI." }],
    ["RND", checkout.id, "Edge rendering for checkout", "HOLD", "", 140, { goal: "Measure TTFB gains from rendering at the edge.", timeboxEnd: day(30), findings: "" }],
    // POC: goal, time box, findings, outcome
    ["POC", login.id, "Passkeys as a second factor", "IN_PROGRESS", "Throwaway branch, not production code.", 5, { goal: "Can passkeys replace the 6-digit code for supported devices?", timeboxEnd: day(6), findings: "Works in Chrome and Safari; Firefox on Linux is patchy." }],
    ["POC", ds.id, "View Transitions API for page changes", "DONE", "", 48, { goal: "Smooth page transitions without a JS animation library.", timeboxEnd: day(-3), findings: "Nice in Chromium; needs a fallback elsewhere.", outcome: "NEEDS_MORE_WORK" }],
    ["POC", null, "Storybook 9 upgrade", "DONE", "", 110, { goal: "Check our stories still build and interaction tests pass.", timeboxEnd: day(-12), findings: "Smooth upgrade, faster startup.", outcome: "ADOPT" }],
    ["POC", null, "Micro-frontends with module federation", "REJECT", "", 260, { goal: "Split the admin into independently deployed parts.", timeboxEnd: day(-30), findings: "Too much complexity for a team our size.", outcome: "DROP" }],
    ["POC", checkout.id, "Server components for the cart", "TODO", "", 20, { goal: "Ship less JS on the cart page.", timeboxEnd: day(14) }],
  ];
  const created: { id: string; title: string }[] = [];
  for (const [projectId, title, status, notes, h] of tasks) {
    created.push(await prisma.workItem.create({ data: { type: "TASK", projectId, title, status, notes, createdById: asha.id, createdAt: ago(h + 48), updatedAt: ago(h) } }));
  }
  const createdOther: { id: string; title: string }[] = [];
  for (const [type, projectId, title, status, notes, h, extra] of others) {
    createdOther.push(await prisma.workItem.create({ data: { type, projectId, title, status, notes, ...extra, createdById: asha.id, createdAt: ago(h + 48), updatedAt: ago(h) } }));
  }

  // Learning (example curation; links point to well-known public resources)
  const learning = [
    { type: "ARTICLE", title: "Core Web Vitals in practice", url: "https://web.dev/articles/vitals", summary: "What LCP, INP and CLS measure, and the thresholds that count as good.", tags: ["Performance"], pinned: true, h: 200 },
    { type: "NEWS", title: "React release notes (example)", url: "https://react.dev/blog", summary: "Latest posts from the React team blog: releases, RFCs and upgrade guides.", tags: ["React"], pinned: false, h: 30 },
    { type: "BLOG", title: "Container queries in practice", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries", summary: "Size components by their container instead of the viewport.", tags: ["CSS"], pinned: false, h: 80 },
    { type: "ARTICLE", title: "Accessible forms checklist", url: "https://www.w3.org/WAI/tutorials/forms/", summary: "Labels, instructions, validation and notifications for accessible forms.", tags: ["Accessibility"], pinned: false, h: 120 },
    { type: "ARTICLE", title: "TypeScript handbook: narrowing", url: "https://www.typescriptlang.org/docs/handbook/2/narrowing.html", summary: "How TypeScript narrows union types with control-flow analysis.", tags: ["TypeScript"], pinned: false, h: 150 },
    { type: "NEWS", title: "Testing Library guiding principles", url: "https://testing-library.com/docs/guiding-principles", summary: "The more your tests resemble the way software is used, the more confidence they give.", tags: ["Testing", "React"], pinned: false, h: 10 },
  ] as const;
  for (const l of learning) {
    await prisma.learningItem.create({
      data: { type: l.type, title: l.title, url: l.url, summary: l.summary, tags: [...l.tags], pinned: l.pinned, createdById: asha.id, createdAt: ago(l.h) },
    });
  }
  await prisma.learningItem.create({
    data: {
      type: "BLOG",
      title: "How we review frontend PRs (example internal post)",
      summary: "Our team checklist for reviewing UI changes: a11y, performance and visual QA.",
      body: "## Why a checklist?\n\nConsistent reviews catch the same classes of bugs every time.\n\n## The checklist\n\n1. **Accessibility** – keyboard path, focus rings, labels.\n2. **Performance** – no new layout shift; images sized.\n3. **Visual QA** – compare against the design at 390 / 768 / 1440.\n\n```ts\n// Example: prefer semantic elements\n<button type=\"button\" onClick={save}>Save</button>\n```\n\n> This is example content for the demo.",
      tags: ["Accessibility", "Performance"],
      createdById: asha.id,
      createdAt: ago(48),
    },
  });

  // Wireframe image on local disk (dev upload fallback)
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, WIREFRAME_FILE), WIREFRAME_SVG);
  const wireframeUrl = `/api/uploads/files/${WIREFRAME_FILE}`;

  const doc = (data: { projectId: string | null; parentId?: string | null; title: string; content: string; position: number; updatedAt?: Date }) =>
    prisma.doc.create({ data: { ...data, parentId: data.parentId ?? null, createdById: asha.id, updatedById: asha.id } });

  await doc({
    projectId: login.id,
    title: "Overview",
    position: 0,
    content:
      "# Login Redesign\n\nGoal: a fast, accessible **email + password** sign-in with **authenticator-app two-factor (TOTP)**.\n\n## Scope\n\n| Area | Owner | Notes |\n|---|---|---|\n| Email + password form | Ravi | Autofill friendly |\n| QR setup + 6-box code input | Ravi | Paste support |\n| Error states | Meera | Copy from the design brief |\n\n## Links\n\n- Design brief (internal)\n- [WAI forms tutorial](https://www.w3.org/WAI/tutorials/forms/)",
  });
  const arch = await doc({
    projectId: login.id,
    title: "Architecture",
    position: 1,
    content:
      "# Architecture\n\nThe frontend (Next.js) talks to a separate API service. Authentication is email + password followed by a TOTP code from an authenticator app; sessions live in Postgres behind an httpOnly cookie.\n\n```mermaid\nflowchart LR\n  Browser[Next.js frontend] -->|/api/*| API[Express API]\n  API --> DB[(Postgres)]\n  API --> LLM[LLM API]\n  Phone[Authenticator app] -. 6-digit code .-> Browser\n```\n",
  });
  const authFlow = await doc({
    projectId: login.id,
    parentId: arch.id,
    title: "Auth flow",
    position: 0,
    content:
      "# Auth flow\n\nOnly users added by the admin can sign in. First sign-in: scan a QR code, confirm a code. Every later sign-in: password, then code.\n\n```mermaid\nsequenceDiagram\n  actor U as User\n  participant FE as Frontend\n  participant API as API\n  U->>FE: Email + password\n  FE->>API: POST /api/auth/login\n  API-->>FE: step = totp_setup or totp_verify\n  alt First sign-in\n    FE->>API: POST /api/auth/totp/setup\n    API-->>FE: QR code\n    U->>FE: Scan, type 6-digit code\n    FE->>API: POST /api/auth/totp/enable\n  else Enrolled\n    U->>FE: 6-digit code\n    FE->>API: POST /api/auth/totp/verify\n  end\n  API-->>FE: httpOnly session cookie\n```\n\n## Tasks by status\n\n```chart\n{\"type\":\"bar\",\"title\":\"Login Redesign: tasks by status\",\"data\":[{\"label\":\"To do\",\"value\":1},{\"label\":\"In progress\",\"value\":3},{\"label\":\"Done\",\"value\":2},{\"label\":\"Hold\",\"value\":1},{\"label\":\"Reject\",\"value\":1}]}\n```\n",
  });
  await doc({
    projectId: login.id,
    parentId: arch.id,
    title: "API contract",
    position: 1,
    content: "# API contract\n\n```http\nPOST /api/auth/login\n{ \"email\": \"ravi@devhub.test\", \"password\": \"…\" }\n\n200 { \"step\": \"totp_verify\" }\n```\n\nErrors return `{ error }` with 401 (wrong credentials), 403 (deactivated) or 429 (too many attempts).",
  });
  const wire = await doc({
    projectId: login.id,
    title: "Wireframes",
    position: 2,
    content: `# Wireframes\n\nStep 1 of the sign-in flow (example wireframe).\n\n![Login wireframe](${wireframeUrl})\n\n## Completion trend\n\n\`\`\`chart\n{"type":"line","title":"Items done per week","data":[{"label":"W1","value":1},{"label":"W2","value":2},{"label":"W3","value":2},{"label":"W4","value":3}]}\n\`\`\`\n`,
  });
  await prisma.attachment.create({ data: { docId: wire.id, fileUrl: wireframeUrl, fileName: "login-wireframe.svg", uploadedById: asha.id } });
  await doc({
    projectId: ds.id,
    title: "Tokens",
    position: 0,
    content:
      "# Tokens\n\nNeutrals use the zinc scale; one accent gradient (violet → indigo → blue).\n\n```chart\n{\"type\":\"pie\",\"title\":\"Components by status\",\"data\":[{\"label\":\"Done\",\"value\":3},{\"label\":\"In progress\",\"value\":1},{\"label\":\"Planned\",\"value\":2}]}\n```\n",
  });
  await doc({
    projectId: null,
    title: "Team conventions",
    position: 0,
    content:
      "# Team conventions\n\nTeam-wide docs live in the **General** space.\n\n```mermaid\nflowchart TD\n  A[Pick a task] --> B[Branch + PR]\n  B --> C{Review}\n  C -->|changes| B\n  C -->|approved| D[Merge + deploy]\n```\n",
  });

  // Recent activity examples
  const act = (summary: string, entityType: string, entityId: string, projectId: string | null, hours: number, action = "updated") =>
    prisma.activityLog.create({ data: { userId: asha.id, entityType, entityId, projectId, action, summary, createdAt: ago(hours) } });
  const byTitle = (t: string) => [...created, ...createdOther].find((i) => i.title === t)!;
  await act(`set "Email + password form" to In progress`, "task", byTitle("Email + password form").id, login.id, 3);
  await act(`set "Passkeys as a second factor" to In progress`, "poc", byTitle("Passkeys as a second factor").id, login.id, 5);
  await act(`updated "Signals vs. React state for large forms" (findings)`, "rnd", byTitle("Signals vs. React state for large forms").id, null, 7);
  await act(`set "Design System v2 stable release" to In progress`, "roadmap", byTitle("Design System v2 stable release").id, ds.id, 18);
  await act(`updated doc "Auth flow"`, "doc", authFlow.id, login.id, 26);
  await act(`set "SMS OTP fallback" to Reject`, "task", byTitle("SMS OTP fallback").id, login.id, 26);
  await act(`added "QR code setup screen"`, "task", byTitle("QR code setup screen").id, login.id, 30, "created");
  await act(`set "View Transitions API for page changes" to Done`, "poc", byTitle("View Transitions API for page changes").id, ds.id, 48);
  await act(`set "Fix focus rings on buttons" to Done`, "task", byTitle("Fix focus rings on buttons").id, ds.id, 72);
  await act(`set "Docs site for components" to Hold`, "task", byTitle("Docs site for components").id, ds.id, 96);

  console.log(`
Seeded example data (fake). Sign in at http://localhost:3000/login with:

  Role          Name               Email                Password
  Admin         Asha Rao           asha@devhub.test     ${ADMIN_PASSWORD}
  Viewer        Ravi Kumar         ravi@devhub.test     ${VIEWER_PASSWORD}
  Viewer        Meera Iyer         meera@devhub.test    ${VIEWER_PASSWORD}
  Viewer        Daniel Fernandes   daniel@devhub.test   ${VIEWER_PASSWORD}
  (deactivated) Priya Nair         priya@devhub.test    ${VIEWER_PASSWORD}

Two-factor: nobody is enrolled yet. On first sign-in each user sees a QR code; scan it with Google
Authenticator / Authy / 1Password (or type the secret shown under it), then enter the 6-digit code.
Re-running the seed resets everyone's password and two-factor to the values above.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
