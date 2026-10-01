// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const harness = require("../test-support/db");
const ctx = harness.prepare(__filename);

// The generate route refuses work while the instance has no AI, and the job
// reads the TTS gate from the key env. A dummy base and key satisfy both
// checks; the job itself never dials anything because the test swaps
// ai.chatJson and media.speechSegment before it runs.
process.env.AI_BASE_URL = process.env.AI_BASE_URL || "http://127.0.0.1:9/v1";
process.env.KIE_API_KEY = process.env.KIE_API_KEY || "test-key";
async function app() { return require("../../server/index"); }
async function http(a, path, opts = {}) {
  const m = require("node:http"); const body = opts.body != null ? JSON.stringify(opts.body) : null;
  const h = { ...(opts.headers || {}) }; if (body != null) h["content-type"] = "application/json"; if (opts.cookie) h["cookie"] = opts.cookie;
  return new Promise((resolve, reject) => {
    const s = m.createServer(a); s.listen(0, () => {
      const { port } = s.address(); const req = m.request({ method: opts.method || "POST", host: "127.0.0.1", port, path, headers: h }, (res) => {
        let d = ""; res.on("data", (x) => { d += x; }); res.on("end", () => { s.close(); let j = null; try { j = JSON.parse(d || ""); } catch {} const sc = res.headers["set-cookie"] || []; const c = Array.isArray(sc) ? sc : (sc ? [String(sc)] : []); resolve({ status: res.statusCode, setCookie: c, text: d || "", json: j }); });
      }); req.on("error", (e) => { s.close(); reject(e); }); if (body != null) req.write(body); req.end();
    });
  });
}
function jar(r) { return r.setCookie.map((c) => c.split(";")[0]).join("; "); }

function mp3Segment(text) {
  // ID3v2-tagged fake audio: enough to prove bytes flow and tags get stripped.
  const head = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 10]);
  return Buffer.concat([head, Buffer.from(`audio:${text}`)]);
}

async function waitForJob(jobId, ms = 20000) {
  const db = require("../lib/db");
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const { rows } = await db.query("select status, error, result from jobs where id = $1", [jobId]);
    if (rows[0] && rows[0].status !== "queued" && rows[0].status !== "running") return rows[0];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`job ${jobId} did not settle`);
}

describe("audio overviews integration", () => {
  before(ctx.setup); after(ctx.teardown);

  it("generates, stores, and replaces one overview per unit", async () => {
    if (ctx.skip) { console.log("# skip: TEST_DATABASE_URL not set"); return; }
    const a = await app();
    const db = require("../lib/db");
    const ai = require("../lib/ai");
    const media = require("../lib/media");

    // Mocked AI and TTS: overview.js talks to both through the module object,
    // so swapping these exports intercepts the job without touching the wire.
    ai.chatJson = async () => ({
      json: { segments: [
        { host: "a", text: "What is a unit?" },
        { host: "b", text: "A chapter of a course." },
        { host: "a", text: "And the overview?" },
        { host: "b", text: "This recording." },
      ] },
      content: "", usage: null, model: "mock",
    });
    media.speechSegment = async ({ text }) => mp3Segment(text);

    const email = `ov_${Date.now()}@example.com`;
    const r = await http(a, "/api/auth/signup", { body: { familyName: "Fam OV", name: "Parent", email, password: "s3cur3Pass" } });
    assert.equal(r.status, 200, r.text);
    const cookie = jar(r);
    const { rows: urows } = await db.query("select id, family_id from users where email=$1", [email.toLowerCase()]);
    const userId = Number(urows[0].id);
    const familyId = Number(urows[0].family_id);

    const c = await db.query(
      "insert into courses (family_id, title, topic, created_by) values ($1,$2,'overview test',$3) returning id",
      [familyId, `Course ${Date.now()}`, userId]
    );
    const courseId = Number(c.rows[0].id);
    const un = await db.query("insert into units (course_id, title, position) values ($1,'Ancient maps',0) returning id", [courseId]);
    const unitId = Number(un.rows[0].id);
    const ls = await db.query("insert into lessons (unit_id, title, summary, position) values ($1,'Maps','How to read one.',0) returning id", [unitId]);
    await db.query(
      "insert into lesson_items (lesson_id, type, position, content) values ($1,'article',0,$2)",
      [Number(ls.rows[0].id), JSON.stringify({ title: "Compass rose", body: "North is up, and a rose names the winds." })]
    );

    // Someone else's unit reads as not found, never as generated.
    const foreign = await http(a, "/api/overviews/generate", { cookie, body: { unitId: 999999 } });
    assert.equal(foreign.status, 404, foreign.text);

    const gen = await http(a, "/api/overviews/generate", { cookie, body: { unitId } });
    assert.equal(gen.status, 202, gen.text);
    const job1 = await waitForJob(gen.json.jobId);
    assert.equal(job1.status, "done", job1.error);
    assert.equal(job1.result.skipped, 0);
    assert.equal(job1.result.segments, 4);

    const first = await http(a, `/api/overviews/for-unit/${unitId}`, { cookie, method: "GET" });
    assert.equal(first.status, 200, first.text);
    const ov1 = first.json.overview;
    assert.ok(ov1, "overview exists");
    assert.ok(ov1.url.startsWith("/media/"), ov1.url);
    assert.equal(ov1.script.length, 4, "script stored with the file");

    const row1 = (await db.query("select bytes, storage_key, meta from uploads where id = $1", [ov1.uploadId])).rows[0];
    assert.equal(row1.meta.refType, "overview");
    assert.equal(Number(row1.meta.unitId), unitId);
    assert.ok(row1.bytes > 0);
    const asset = (await db.query(
      "select ref_type, ref_id, purpose from media_assets where family_id = $1 and ref_type = 'overview' and ref_id = $2",
      [familyId, unitId]
    )).rows[0];
    assert.ok(asset, "media_assets row recorded");

    // Regenerate replaces: same unit, new file, exactly one overview left.
    const gen2 = await http(a, "/api/overviews/generate", { cookie, body: { unitId } });
    assert.equal(gen2.status, 202, gen2.text);
    const job2 = await waitForJob(gen2.json.jobId);
    assert.equal(job2.status, "done", job2.error);
    assert.equal(job2.result.replaced, 1);

    const second = await http(a, `/api/overviews/for-unit/${unitId}`, { cookie, method: "GET" });
    const ov2 = second.json.overview;
    assert.ok(ov2 && ov2.uploadId !== ov1.uploadId, "a new file replaced the old one");
    const left = (await db.query(
      "select count(*)::int as n from uploads where family_id = $1 and meta->>'refType' = 'overview' and meta->>'unitId' = $2",
      [familyId, String(unitId)]
    )).rows[0].n;
    assert.equal(left, 1, "only the last overview survives");
    const gone = (await db.query("select count(*)::int as n from uploads where id = $1", [ov1.uploadId])).rows[0].n;
    assert.equal(gone, 0, "the old upload row is deleted");
  });
});
