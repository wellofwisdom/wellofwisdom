// SPDX-License-Identifier: AGPL-3.0-or-later
// Kie music: Suno Generate Music on kie.ai, same key as images and voice.
// One loop per chapter at $0.06 per generation, cached in UPLOAD_DIR like
// every other piece of generated media. Silent when not configured.
const { fetchT } = require("../http");

const KIE_BASE = "https://api.kie.ai";
const DEFAULT_MUSIC_MODEL = "suno-generate-music";

function musicModel() {
  return String(process.env.SUNO_MUSIC_ON_KIE || DEFAULT_MUSIC_MODEL).trim() || DEFAULT_MUSIC_MODEL;
}

function kieMusicConfigured() {
  const m = musicModel();
  const key = String(process.env.KIE_API_KEY || "").trim();
  return Boolean(m && key);
}

function kieMusicStatus() {
  return { configured: kieMusicConfigured(), model: musicModel(), via: "kie" };
}

function moodPrompt(chapter, mood) {
  const title = String((chapter && chapter.title) || "adventure").slice(0, 80);
  const hook = String((chapter && chapter.hook) || "").slice(0, 160);
  const moods = {
    calm: "gentle, curious, warm acoustic loop",
    tension: "tense, rhythmic, low strings loop",
    boss: "epic, driving, percussive loop with choir hit",
    victory: "bright, triumphant, uplifting loop",
  };
  const moodLine = moods[mood] || moods.calm;
  return `Instrumental game music loop. ${moodLine}. For chapter "${title}"${hook ? `: ${hook}` : ""}. 12 seconds, seamless loop, no vocals, no drums dominating, classroom friendly, 90 to 110 bpm.`;
}

function checkKie(data) {
  if (data && typeof data === "object" && data.code && Number(data.code) !== 200) {
    throw new Error(`kie_${data.code}: ${String(data.msg || data.message || "business error").slice(0, 200)}`);
  }
  return data;
}

function resultUrls(d) {
  const r = (d && d.response) || {};
  for (const urls of [r.resultUrls, d && d.resultUrls]) {
    if (Array.isArray(urls) && urls.length) return urls;
  }
  for (const raw of [r.resultJson, d && d.resultJson]) {
    if (!raw) continue;
    try {
      const urls = JSON.parse(raw).resultUrls;
      if (Array.isArray(urls) && urls.length) return urls;
    } catch { /* ignore */ }
  }
  return [];
}

async function kieCreateTask(key, model, input) {
  const res = await fetchT(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input }),
  }, { timeoutMs: 60000, retries: 1 });
  if (!res.ok) throw new Error(`kie_http_${res.status}: ${String(await res.text()).slice(0, 200)}`);
  const data = checkKie(await res.json());
  const taskId = data && data.data && data.data.taskId;
  if (!taskId) throw new Error(`kie_no_task: ${JSON.stringify(data).slice(0, 200)}`);
  return String(taskId);
}

async function kiePollRaw(key, taskId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetchT(`${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${taskId}`, {
      headers: { authorization: `Bearer ${key}` },
    }, { timeoutMs: 30000, retries: 1 });
    if (!res.ok) continue;
    const info = checkKie(await res.json());
    const d = (info && info.data) || {};
    const state = String(d.state || d.status || "").toLowerCase();
    if (state.includes("succ")) return d;
    if (state.includes("fail") || state.includes("error")) {
      throw new Error(`kie_job_failed: ${String(d.failMsg || d.error || "generation failed").slice(0, 200)}`);
    }
  }
  throw new Error("kie_timeout");
}

async function generateMusicLoop({ chapter, mood, durationSec }) {
  const key = String(process.env.KIE_API_KEY || "").trim();
  if (!key) throw new Error("kie_music_not_configured");
  const model = musicModel();
  if (!model) throw new Error("kie_music_no_model");
  const prompt = moodPrompt(chapter, mood);
  const dur = Math.max(4, Math.min(24, Number(durationSec) || 12));
  const input = { prompt, duration: dur };
  const taskId = await kieCreateTask(key, model, input);
  const d = await kiePollRaw(key, taskId, 6 * 60 * 1000);
  const urls = resultUrls(d);
  if (!urls[0]) throw new Error(`kie_music_no_url: ${JSON.stringify(d).slice(0, 300)}`);
  const res = await fetchT(urls[0], {}, { timeoutMs: 30000, retries: 1 }).catch(() => null);
  if (!res || !res.ok) return { url: urls[0] };
  const buf = Buffer.from(await res.arrayBuffer());
  return { url: urls[0], buffer: buf };
}

module.exports = { musicModel, kieMusicConfigured, kieMusicStatus, moodPrompt, generateMusicLoop };
