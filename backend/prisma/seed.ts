/**
 * Seed script with CLEARLY FAKE example data (names from the design brief, fake +91 numbers).
 * WARNING: wipes all app tables first. Run with `npm run db:seed`.
 */
import { PrismaClient, type TaskPriority, type TaskStatus } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};
const ago = (hours: number) => new Date(Date.now() - hours * 3600_000);

const WIREFRAME_FILE = "5eed0000-0000-4000-8000-000000000001.svg";
const WIREFRAME_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500" font-family="Inter, Arial, sans-serif">
  <rect width="800" height="500" fill="#FAFAFA"/>
  <rect x="250" y="70" width="300" height="360" rx="16" fill="#FFFFFF" stroke="#D4D4D8" stroke-width="2"/>
  <rect x="280" y="100" width="90" height="16" rx="4" fill="#7C3AED"/>
  <text x="280" y="160" font-size="22" font-weight="600" fill="#18181B">Sign in</text>
  <text x="280" y="184" font-size="13" fill="#71717A">Enter your mobile number</text>
  <rect x="280" y="205" width="70" height="40" rx="8" fill="#FFFFFF" stroke="#D4D4D8"/>
  <text x="295" y="230" font-size="14" fill="#18181B">+91 ▾</text>
  <rect x="360" y="205" width="160" height="40" rx="8" fill="#FFFFFF" stroke="#D4D4D8"/>
  <text x="372" y="230" font-size="14" fill="#A1A1AA">98765 43210</text>
  <rect x="280" y="265" width="240" height="44" rx="8" fill="#4F46E5"/>
  <text x="365" y="292" font-size="14" font-weight="600" fill="#FFFFFF">Send code</text>
  <g fill="#FFFFFF" stroke="#D4D4D8">
    <rect x="280" y="340" width="32" height="40" rx="6"/><rect x="321" y="340" width="32" height="40" rx="6"/>
    <rect x="362" y="340" width="32" height="40" rx="6"/><rect x="403" y="340" width="32" height="40" rx="6"/>
    <rect x="444" y="340" width="32" height="40" rx="6"/><rect x="485" y="340" width="32" height="40" rx="6"/>
  </g>
  <text x="280" y="405" font-size="12" fill="#71717A">Step 2: 6-digit OTP (example wireframe)</text>
</svg>`;

async function main() {
  // Wipe (children first)
  await prisma.activityLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.doc.deleteMany({ where: { parentId: { not: null } } });
  await prisma.doc.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.learningItem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();

  const admin = await prisma.role.create({ data: { name: "admin" } });
  const viewer = await prisma.role.create({ data: { name: "viewer" } });

  const mk = (name: string, phoneNumber: string, roleId: string, active = true) =>
    prisma.user.create({ data: { name, phoneNumber, roleId, active } });
  const asha = await mk("Asha Rao", "+919876500001", admin.id);
  const ravi = await mk("Ravi Kumar", "+919876500002", viewer.id);
  const meera = await mk("Meera Iyer", "+919876500003", viewer.id);
  const daniel = await mk("Daniel Fernandes", "+919876500004", viewer.id);
  const priya = await mk("Priya Nair", "+919876500005", viewer.id, false); // deactivated example

  const login = await prisma.project.create({
    data: {
      name: "Login Redesign",
      description: "Rebuild the sign-in experience around mobile-number OTP, with accessible inputs and clear error states. (Example project)",
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

  type T = [string, string, string | null, TaskPriority, TaskStatus, number | null, string[], string?];
  const tasks: T[] = [
    // project, title, assignee, priority, status, due offset, tags, description
    [login.id, "Build mobile number input with country code", ravi.id, "HIGH", "IN_PROGRESS", 2, ["forms", "a11y"], "Default to **+91**. Validate with libphonenumber.\n\n- Paste support\n- Numeric keypad on mobile"],
    [login.id, "Implement 6-digit OTP input", ravi.id, "HIGH", "TODO", 5, ["forms"], "Auto-advance, paste fills all boxes, backspace moves back."],
    [login.id, "Add error states to login", ravi.id, "MEDIUM", "BACKLOG", 9, ["ux"]],
    [login.id, "Lazy-load hero illustration", ravi.id, "URGENT", "TODO", -1, ["performance"], "Overdue example task."],
    [login.id, "Resend-code countdown timer", meera.id, "MEDIUM", "REVIEW", 3, ["forms"]],
    [login.id, "Login page copy review", meera.id, "LOW", "DONE", -5, ["content"]],
    [login.id, "Session expiry redirect", daniel.id, "MEDIUM", "DONE", -3, ["auth"]],
    [login.id, "Glass card + gradient mesh background", meera.id, "LOW", "DONE", -8, ["css"]],
    [ds.id, "Fix focus rings on buttons", ravi.id, "MEDIUM", "DONE", -2, ["a11y", "css"]],
    [ds.id, "Status pill component", meera.id, "MEDIUM", "IN_PROGRESS", 7, ["components"]],
    [ds.id, "Colour tokens as CSS variables", meera.id, "HIGH", "REVIEW", 1, ["tokens", "css"]],
    [ds.id, "Priority badge with signal bars", ravi.id, "LOW", "BACKLOG", null, ["components"]],
    [ds.id, "Docs site for components", null, "MEDIUM", "BACKLOG", null, ["docs"]],
    [ds.id, "Typography scale (Inter)", priya.id, "MEDIUM", "DONE", -12, ["tokens"]],
    [ds.id, "Kanban card component", ravi.id, "MEDIUM", "DONE", -6, ["components"]],
    [ds.id, "Review component API naming", asha.id, "MEDIUM", "TODO", 4, ["components", "review"]],
    [login.id, "Sign off final login designs", asha.id, "HIGH", "REVIEW", 2, ["design"]],
    [checkout.id, "Audit checkout bundle size", daniel.id, "HIGH", "TODO", 14, ["performance"]],
    [checkout.id, "Preload payment fonts", daniel.id, "LOW", "BACKLOG", null, ["performance"]],
    [checkout.id, "Measure LCP on mid-range Android", daniel.id, "MEDIUM", "IN_PROGRESS", -2, ["performance", "testing"]],
  ];
  const created = [];
  for (const [projectId, title, assigneeId, priority, status, due, tags, description] of tasks) {
    created.push(
      await prisma.task.create({
        data: { projectId, title, assigneeId, priority, status, dueDate: due === null ? null : day(due), tags, description: description ?? "", createdById: asha.id },
      }),
    );
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
      "# Login Redesign\n\nGoal: a fast, accessible **mobile-number + OTP** sign-in.\n\n## Scope\n\n| Area | Owner | Notes |\n|---|---|---|\n| Number input | Ravi | +91 default |\n| OTP input | Ravi | 6 boxes, paste support |\n| Error states | Meera | Copy from the design brief |\n\n## Links\n\n- Design brief (internal)\n- [WAI forms tutorial](https://www.w3.org/WAI/tutorials/forms/)",
  });
  const arch = await doc({
    projectId: login.id,
    title: "Architecture",
    position: 1,
    content:
      "# Architecture\n\nThe frontend (Next.js) talks to a separate API service. Authentication uses SuperTokens passwordless (phone OTP).\n\n```mermaid\nflowchart LR\n  Browser[Next.js frontend] -->|/api/*| API[Express API]\n  API --> DB[(Postgres)]\n  API --> ST[SuperTokens core]\n  API --> LLM[LLM API]\n```\n",
  });
  const authFlow = await doc({
    projectId: login.id,
    parentId: arch.id,
    title: "Auth flow",
    position: 0,
    content:
      "# Auth flow\n\nOnly numbers added by the admin can request a code. The OTP is valid for a few minutes.\n\n```mermaid\nsequenceDiagram\n  actor U as User\n  participant FE as Frontend\n  participant API as API\n  participant ST as SuperTokens\n  U->>FE: Enter mobile number\n  FE->>API: POST /api/auth/signinup/code\n  API->>API: Is number registered and active?\n  API->>ST: Create code\n  ST-->>U: SMS with 6-digit code\n  U->>FE: Enter code\n  FE->>API: POST /api/auth/signinup/code/consume\n  API-->>FE: Session cookies\n```\n\n## Tasks by status\n\n```chart\n{\"type\":\"bar\",\"title\":\"Login Redesign: tasks by status\",\"data\":[{\"label\":\"Backlog\",\"value\":1},{\"label\":\"To do\",\"value\":2},{\"label\":\"In progress\",\"value\":1},{\"label\":\"Review\",\"value\":1},{\"label\":\"Done\",\"value\":3}]}\n```\n",
  });
  await doc({
    projectId: login.id,
    parentId: arch.id,
    title: "API contract",
    position: 1,
    content: "# API contract\n\n```http\nPOST /api/auth/signinup/code\n{ \"phoneNumber\": \"+919876500002\" }\n```\n\nErrors return `{ status, reason }`.",
  });
  const wire = await doc({
    projectId: login.id,
    title: "Wireframes",
    position: 2,
    content: `# Wireframes\n\nStep 1 of the sign-in flow (example wireframe).\n\n![Login wireframe](${wireframeUrl})\n\n## Completion trend\n\n\`\`\`chart\n{"type":"line","title":"Tasks done per week","data":[{"label":"W1","value":1},{"label":"W2","value":2},{"label":"W3","value":2},{"label":"W4","value":3}]}\n\`\`\`\n`,
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
      "# Team conventions\n\nTeam-wide docs live in the **General** space.\n\n```mermaid\nflowchart TD\n  A[Pick task from backlog] --> B[Branch + PR]\n  B --> C{Review}\n  C -->|changes| B\n  C -->|approved| D[Merge + deploy]\n```\n",
  });

  // Recent activity examples
  const act = (summary: string, entityType: string, entityId: string, projectId: string | null, hours: number, action = "updated") =>
    prisma.activityLog.create({ data: { userId: asha.id, entityType, entityId, projectId, action, summary, createdAt: ago(hours) } });
  await act(`moved "${created[0].title}" to In progress`, "task", created[0].id, login.id, 2);
  await act(`updated doc "Auth flow"`, "doc", authFlow.id, login.id, 26);
  await act(`created "${created[1].title}"`, "task", created[1].id, login.id, 30, "created");
  await act(`moved "${created[10].title}" to Review`, "task", created[10].id, ds.id, 50);
  await act(`moved "${created[8].title}" to Done`, "task", created[8].id, ds.id, 72);

  console.log("Seeded example data. Sign-in numbers (fake):");
  console.log("  Admin  Asha Rao          +91 98765 00001");
  console.log("  Viewer Ravi Kumar        +91 98765 00002");
  console.log("  Viewer Meera Iyer        +91 98765 00003");
  console.log("  Viewer Daniel Fernandes  +91 98765 00004");
  console.log("  (deactivated) Priya Nair +91 98765 00005");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
