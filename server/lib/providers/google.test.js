// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("google gemini provider adapter", () => {
  it("toGeminiContents maps system to user turn and assistant to model", () => {
    const { toGeminiContents } = require("./google");
    const contents = toGeminiContents([
      { role: "system", content: "You are a tutor." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
    assert.equal(contents.length, 3);
    assert.equal(contents[0].role, "user");
    assert.equal(contents[0].parts[0].text, "You are a tutor.");
    assert.equal(contents[2].role, "model");
  });

  it("vision image_url becomes inlineData", () => {
    const { toGeminiContents } = require("./google");
    const b64 = Buffer.from("fake").toString("base64");
    const dataUrl = `data:image/jpeg;base64,${b64}`;
    const contents = toGeminiContents([
      { role: "user", content: [
        { type: "text", text: "Read this" },
        { type: "image_url", image_url: { url: dataUrl } },
      ]},
    ]);
    const p = contents[0].parts.find((x) => x.inlineData);
    assert.ok(p);
    assert.equal(p.inlineData.mimeType, "image/jpeg");
    assert.equal(p.inlineData.data, b64);
  });

  it("ai provider detection: gemini vs openai vs anthropic", () => {
    const orig = { provider: process.env.AI_PROVIDER, base: process.env.AI_BASE_URL, key: process.env.AI_API_KEY };
    process.env.AI_PROVIDER = "gemini";
    process.env.AI_API_KEY = "fake-gemini-key";
    delete require.cache[require.resolve("../ai")];
    let ai = require("../ai");
    assert.equal(ai.provider(), "gemini");
    assert.equal(ai.configured(), true);
    process.env.AI_PROVIDER = "";
    process.env.AI_BASE_URL = "https://generativelanguage.googleapis.com";
    delete require.cache[require.resolve("../ai")];
    ai = require("../ai");
    assert.equal(ai.provider(), "gemini");
    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_API_KEY = "sk-ant-test";
    delete require.cache[require.resolve("../ai")];
    ai = require("../ai");
    assert.equal(ai.provider(), "anthropic");
    if (orig.provider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = orig.provider;
    if (orig.base === undefined) delete process.env.AI_BASE_URL; else process.env.AI_BASE_URL = orig.base;
    if (orig.key === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = orig.key;
    delete require.cache[require.resolve("../ai")];
  });
});
