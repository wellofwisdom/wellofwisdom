// SPDX-License-Identifier: AGPL-3.0-or-later
export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// "View as learner" is a whole-session mode rather than a per-call argument,
// so it rides on every request from one place. Set once when preview starts,
// cleared when it ends. The server does the real enforcement; this only makes
// the client ask the right question.
let previewLearnerId: number | null = null;

export function setPreviewLearner(id: number | null) {
  previewLearnerId = id;
}

export function getPreviewLearner(): number | null {
  return previewLearnerId;
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (previewLearnerId) headers["x-preview-learner"] = String(previewLearnerId);

  const res = await fetch(path, {
    method: opts.method || "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const code = (data as { error?: string } | null)?.error || `http_${res.status}`;
    throw new ApiError(code, res.status);
  }
  return data as T;
}

const NICE: Record<string, string> = {
  email_taken: "That email already has an account. Try signing in instead.",
  email_invalid: "That email address doesn't look right.",
  password_too_short: "Password needs at least 8 characters.",
  invalid_credentials: "That didn't match. Check it and try again.",
  too_many_attempts: "Too many tries. Wait a few minutes and try again.",
  invite_invalid: "That invite code isn't right. Ask the person who runs this server.",
  username_taken: "That username is taken in your family. Pick another.",
  username_invalid: "Usernames: 2-24 letters/numbers, no spaces.",
  pin_invalid: "PIN is 4 to 6 digits.",
  family_name_required: "Give your family or school a name.",
  name_required: "A name is required.",
  grade_invalid: "Grade must be between 1 and 14.",
  video_unavailable: "That link does not point at a video that can be embedded. Check it and try again.",
  content_invalid: "That does not look like a video link. Paste a YouTube URL or id.",
  ai_not_configured: "This needs an AI provider, which is not set up on this instance. Add one in Settings.",
  no_questions: "This boss has no questions to fight with yet. Ask your guide to add some exercises to the course.",
  no_active_run: "This fight has timed out. Start it again to have another go.",
  preview_read_only: "You are viewing as a learner, so nothing can be saved. Use \"Back to my view\" in the banner at the top, then try again.",
  not_your_learner: "That learner is not one of yours to view.",
  boss_must_be_fought: "A boss has to be fought, not marked done.",
  already_submitted: "This is already handed in, so it cannot be changed. Your guide will send it back with their feedback.",
  not_a_project: "Only a project can be handed in.",
  nothing_to_hand_in: "There is nothing written yet. Add your work first.",
  nothing_to_return: "Write the feedback first, then send it back.",
  no_rubric: "This project has no rubric, so there is nothing to read it against. Add one on the course page.",
  outcome_invalid: "That is not one of the outcomes.",
  not_a_video: "That item is not a video.",
  not_an_upload: "Questions can only be drafted from a video uploaded here. An embedded video hands us no transcript.",
  no_captions: "This video has no captions yet. Generate or upload a caption track first, in the Videos panel.",
  nothing_drafted: "Nothing usable came back. Try again, or write the questions yourself.",
  day_invalid: "That is not a date this can record.",
  title_required: "Give it a title first.",
  date_invalid: "That is not a date this can record.",
  date_in_future: "That date has not happened yet. Check the date on the report.",
  kind_invalid: "Pick one of the kinds in the list.",
  percentile_invalid: "A percentile runs from 1 to 99. Check that row against the report.",
  nothing_recorded: "Add at least one score, or the evaluation's words, before saving.",
  learner_not_found: "That learner is not in this group.",
};

export function niceError(err: unknown): string {
  if (err instanceof ApiError) return NICE[err.code] || `Something went wrong (${err.code}).`;
  return "Could not reach the server. Check your connection.";
}
