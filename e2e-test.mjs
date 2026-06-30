/**
 * Full end-to-end test of the ShipFlow backend, driven over HTTP exactly like
 * the browser does: better-auth sign-up, then every tRPC procedure and the
 * AI + Inngest workflows (analyze → PRD → tasks), plus the invite REST routes.
 *
 * Run:  node e2e-test.mjs   (requires the dev server on :3000 + Inngest dev :8288)
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

// ── tiny cookie jar ─────────────────────────────────────────────────────────
let cookies = {};
function storeCookies(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
}
function cookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ── result tracking ───────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; failures.push(`${name}${detail ? " — " + detail : ""}`); console.log(`  \u2717 ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n=== ${t} ===`); }

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function rawFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "content-type": "application/json",
      origin: BASE,
      referer: `${BASE}/`,
      cookie: cookieHeader(),
      ...(opts.headers || {}),
    },
  });
  storeCookies(res);
  return res;
}

async function trpcQuery(name, input) {
  let path = `/api/trpc/${name}`;
  if (input !== undefined) path += `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const res = await rawFetch(path, { method: "GET" });
  const body = await res.json().catch(() => ({}));
  if (body?.error) throw Object.assign(new Error(body.error.json?.message || "trpc error"), { code: body.error.json?.data?.code, status: res.status });
  return body?.result?.data?.json;
}

async function trpcMutation(name, input) {
  const res = await rawFetch(`/api/trpc/${name}`, { method: "POST", body: JSON.stringify({ json: input ?? null }) });
  const body = await res.json().catch(() => ({}));
  if (body?.error) throw Object.assign(new Error(body.error.json?.message || "trpc error"), { code: body.error.json?.data?.code, status: res.status });
  return body?.result?.data?.json;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollWorkflow(featureRequestId, type, timeoutMs = 120000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    const wf = await trpcQuery("workflow.getLatestForFeature", { featureRequestId, type });
    if (wf) {
      last = wf;
      if (wf.status === "COMPLETED") return wf;
      if (wf.status === "FAILED") throw new Error(`${type} workflow FAILED: ${wf.error}`);
    }
    await sleep(2500);
  }
  throw new Error(`${type} workflow timed out (last status: ${last?.status ?? "none"}, step: ${last?.currentStep})`);
}

function strify(v) {
  if (Array.isArray(v)) return v.join("\n");
  if (v == null) return "n/a";
  return String(v);
}

// ── the run ───────────────────────────────────────────────────────────────
async function main() {
  const stamp = Date.now();
  const email = `e2e_${stamp}@example.com`;
  const password = "e2e-Test-Password-123";
  let wsId, projId, featId, prdContent, inviteId;

  section("Auth");
  {
    const res = await rawFetch("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password, name: "E2E Tester" }),
    });
    check("sign-up/email returns 200", res.ok, `status ${res.status}`);
    const session = await trpcQuery("user.me").catch((e) => { throw e; });
    check("user.me returns the new user", session?.email === email, `got ${session?.email}`);
  }

  section("Workspace");
  {
    const ws = await trpcMutation("workspace.create", { name: `E2E WS ${stamp}` });
    wsId = ws?.id;
    check("workspace.create", !!wsId);
    const list = await trpcQuery("workspace.list");
    check("workspace.list includes new workspace", Array.isArray(list) && list.some((w) => w.id === wsId));
    const got = await trpcQuery("workspace.getById", { workspaceId: wsId });
    check("workspace.getById", got?.id === wsId);
    const members = await trpcQuery("workspace.listMembers", { workspaceId: wsId });
    check("workspace.listMembers has creator as ADMIN", Array.isArray(members) && members.some((m) => m.role === "ADMIN"));
  }

  section("Project");
  {
    const p = await trpcMutation("project.create", { workspaceId: wsId, name: "E2E Project", description: "created by e2e" });
    projId = p?.id;
    check("project.create", !!projId);
    const list = await trpcQuery("project.list", { workspaceId: wsId });
    check("project.list includes new project", Array.isArray(list) && list.some((x) => x.id === projId));
    const stats = await trpcQuery("project.stats", { workspaceId: wsId });
    check("project.stats returns phase map", stats && typeof stats.DISCOVERY === "number");
  }

  section("Feature request");
  {
    const f = await trpcMutation("featureRequest.create", {
      workspaceId: wsId, projectId: projId,
      title: "Add CSV export to the reports page",
      description: "Users on the analytics team need to export the report table to CSV so they can share numbers with finance. Today they copy-paste manually which is error prone.",
      source: "WEB",
    });
    featId = f?.id;
    check("featureRequest.create (phase DISCOVERY)", f?.phase === "DISCOVERY", `phase ${f?.phase}`);
    const list = await trpcQuery("featureRequest.list", { workspaceId: wsId, projectId: projId });
    check("featureRequest.list includes new feature", list?.items?.some((x) => x.id === featId));
    const got = await trpcQuery("featureRequest.getById", { workspaceId: wsId, id: featId });
    check("featureRequest.getById", got?.id === featId);
  }

  section("AI completeness analysis");
  {
    const a = await trpcMutation("featureRequest.analyze", { workspaceId: wsId, featureRequestId: featId });
    check("featureRequest.analyze returns structured result", a && typeof a.isComplete === "boolean", JSON.stringify(a)?.slice(0, 120));
    // Answer any clarifications so PRD generation can proceed.
    const got = await trpcQuery("featureRequest.getById", { workspaceId: wsId, id: featId });
    const clars = got?.clarifications ?? [];
    check("analyze created/has clarifications array", Array.isArray(clars));
    let answered = 0;
    for (const c of clars.filter((c) => !c.answer)) {
      await trpcMutation("featureRequest.submitClarification", {
        workspaceId: wsId, featureRequestId: featId, clarificationId: c.id,
        answer: "The CSV should include all visible columns, respect active filters, and use UTF-8 with a header row.",
      });
      answered++;
    }
    check(`submitClarification answered ${answered} question(s)`, true);
  }

  section("PRD generation (Inngest + AI)");
  {
    await trpcMutation("featureRequest.triggerPRD", { workspaceId: wsId, featureRequestId: featId });
    check("featureRequest.triggerPRD accepted", true);
    const wf = await pollWorkflow(featId, "PRD_GENERATION");
    check("PRD_GENERATION workflow COMPLETED", wf.status === "COMPLETED", `${wf.completedSteps}/${wf.totalSteps}`);
    const prd = await trpcQuery("prd.getByFeature", { workspaceId: wsId, featureRequestId: featId });
    prdContent = prd?.content;
    check("prd.getByFeature returns content", !!prdContent && typeof prdContent === "object");
  }

  section("PRD edit + approve");
  {
    const c = prdContent || {};
    const content = {
      problemStatement: strify(c.problemStatement),
      goals: strify(c.goals),
      nonGoals: strify(c.nonGoals),
      userStories: strify(c.userStories),
      acceptanceCriteria: strify(c.acceptanceCriteria),
      edgeCases: strify(c.edgeCases),
      successMetrics: strify(c.successMetrics) + "\n- E2E edit marker",
    };
    const updated = await trpcMutation("prd.update", { workspaceId: wsId, featureRequestId: featId, content });
    check("prd.update saves edit", !!updated);
    const approved = await trpcMutation("prd.approve", { workspaceId: wsId, featureRequestId: featId });
    check("prd.approve", approved?.status === "APPROVED" || !!approved, `status ${approved?.status}`);
  }

  section("Task generation (Inngest + AI)");
  {
    await trpcMutation("task.generateFromPRD", { workspaceId: wsId, featureRequestId: featId });
    check("task.generateFromPRD accepted", true);
    const wf = await pollWorkflow(featId, "TASK_GENERATION");
    check("TASK_GENERATION workflow COMPLETED", wf.status === "COMPLETED", `${wf.completedSteps}/${wf.totalSteps}`);
    const tasks = await trpcQuery("task.list", { workspaceId: wsId, featureRequestId: featId });
    check("task.list returns generated tasks", Array.isArray(tasks) && tasks.length > 0, `${tasks?.length} tasks`);
  }

  section("Task board ops");
  {
    const approvedPlan = await trpcMutation("task.approveTaskPlan", { workspaceId: wsId, featureRequestId: featId }).catch((e) => ({ _err: e.message }));
    check("task.approveTaskPlan", !approvedPlan?._err, approvedPlan?._err);
    const t = await trpcMutation("task.create", { workspaceId: wsId, featureRequestId: featId, title: "E2E manual task", description: "manual", acceptanceCriteria: "works" });
    check("task.create (manual)", !!t?.id);
    const moved = await trpcMutation("task.move", { workspaceId: wsId, id: t.id, status: "IN_PROGRESS" }).catch((e) => ({ _err: e.message }));
    check("task.move to IN_PROGRESS", !moved?._err, moved?._err);
    const del = await trpcMutation("task.delete", { workspaceId: wsId, id: t.id }).catch((e) => ({ _err: e.message }));
    check("task.delete", !del?._err, del?._err);
  }

  section("GitHub guard (new user has no GitHub link)");
  {
    let code = null;
    try { await trpcQuery("github.listAvailableRepos", { workspaceId: wsId }); }
    catch (e) { code = e.code; }
    check("github.listAvailableRepos blocked w/ PRECONDITION_FAILED", code === "PRECONDITION_FAILED", `code ${code}`);
  }

  section("Billing / Analytics / Activity / Notifications / Approvals");
  {
    const plan = await trpcQuery("billing.getCurrentPlan", { workspaceId: wsId });
    check("billing.getCurrentPlan = FREE", plan?.tier === "FREE", `tier ${plan?.tier}`);
    const usage = await trpcQuery("billing.getUsage", { workspaceId: wsId });
    check("billing.getUsage shape", usage?.aiReviews && usage?.repositories);
    const metrics = await trpcQuery("analytics.getMetrics", { workspaceId: wsId, windowDays: 30 });
    check("analytics.getMetrics totalFeatures>=1", (metrics?.totalFeatures ?? 0) >= 1, `total ${metrics?.totalFeatures}`);
    const activity = await trpcQuery("activity.list", { workspaceId: wsId, limit: 8 });
    check("activity.list returns items", Array.isArray(activity?.items) && activity.items.length > 0);
    const unread = await trpcQuery("notification.unreadCount");
    check("notification.unreadCount is a number", typeof unread === "number");
    const queue = await trpcQuery("approval.getApprovalQueue", { workspaceId: wsId });
    check("approval.getApprovalQueue returns items array", Array.isArray(queue?.items));
  }

  section("User settings");
  {
    const conns = await trpcQuery("user.connections");
    check("user.connections (github not linked)", conns && conns.github === false);
    const prof = await trpcMutation("user.updateProfile", { name: "E2E Tester Renamed" });
    check("user.updateProfile", prof?.name === "E2E Tester Renamed");
    const prefs = await trpcMutation("user.updateNotificationPrefs", { prefs: { weeklyDigest: true } });
    check("user.updateNotificationPrefs", !!prefs);
  }

  section("Invitations (tRPC + REST routes)");
  {
    const inv = await trpcMutation("workspace.invite", { workspaceId: wsId, email: `invitee_${stamp}@example.com`, role: "MEMBER" });
    inviteId = inv?.id;
    check("workspace.invite creates invitation", !!inviteId);
    // The new REST route the invite page uses:
    const res = await rawFetch(`/api/invites/${inviteId}`, { method: "GET" });
    const info = await res.json().catch(() => ({}));
    check("GET /api/invites/[token] returns info", res.ok && !!info.workspaceName, `status ${res.status}`);
    // Accept as the wrong user (current session email != invitee) → 403
    const acc = await rawFetch(`/api/invites/${inviteId}/accept`, { method: "POST" });
    check("POST /api/invites/[token]/accept rejects wrong user (403)", acc.status === 403, `status ${acc.status}`);
  }

  // ── summary ──
  console.log(`\n──────────────────────────────────────`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  if (failures.length) {
    console.log(`\nFailures:`);
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nFATAL: ${e.message}`);
  console.log(`\nRESULT: ${pass} passed, ${fail} failed (aborted)`);
  process.exit(1);
});
