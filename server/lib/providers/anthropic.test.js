// SPDX-License-Identifier: AGPL-3.0-or-later
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

describe("anthropic provider adapter", () => {
  it("toAnthropicMessages splits system and user, maps assistant", () => {
    const { toAnthropicMessages } = require("./anthropic");
    const { system, messages } = toAnthropicMessages([
      { role: "system", content: "You are a tutor." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
      { role: "user", content: "Teach fractions" },
    ]);
    assert.equal(system, "You are a tutor.");
    assert.equal(messages.length, 3);
    assert.equal(messages[0].role, "user");
    assert.equal(messages[1].role, "assistant");
    assert.equal(messages[2].role, "user");
  });

  it("vision image_url becomes Anthropic base64 image block", () => {
    const { toAnthropicMessages } = require("./anthropic");
    const b64 = Buffer.from("fake").toString("base64");
    const dataUrl = `data:image/jpeg;base64,${b64}`;
    const { messages } = toAnthropicMessages([
      { role: "user", content: [
        { type: "text", text: "Read this" },
        { type: "image_url", image_url: { url: dataUrl } },
      ]},
    ]);
    assert.equal(messages[0].content[1].type, "image");
    assert.equal(messages[0].content[1].source.media_type, "image/jpeg");
    assert.equal(messages[0].content[1].source.data, b64);
  });

  it("ai provider detection: anthropic vs openai", () => {
    const orig = { provider: process.env.AI_PROVIDER, base: process.env.AI_BASE_URL, key: process.env.AI_API_KEY };
    // explicit
    process.env.AI_PROVIDER = "anthropic";
    process.env.AI_API_KEY = "sk-ant-test";
    delete require.cache[require.resolve("../ai")];
    delete require.cache[require.resolve("./anthropic")];
    let ai = require("../ai");
    assert.equal(ai.provider(), "anthropic");
    assert.equal(ai.configured(), true);
    // auto-detect via base URL
    process.env.AI_PROVIDER = "";
    process.env.AI_BASE_URL = "https://api.anthropic.com";
    delete require.cache[require.resolve("../ai")];
    ai = require("../ai");
    assert.equal(ai.provider(), "anthropic");
    // explicit openai
    process.env.AI_PROVIDER = "openai";
    process.env.AI_BASE_URL = "https://api.openai.com/v1";
    delete require.cache[require.resolve("../ai")];
    ai = require("../ai");
    assert.equal(ai.provider(), "openai");
    // restore
    if (orig.provider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = orig.provider;
    if (orig.base === undefined) delete process.env.AI_BASE_URL; else process.env.AI_BASE_URL = orig.base;
    if (orig.key === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = orig.key;
    delete require.cache[require.resolve("../ai")];
    delete require.cache[require.resolve("./anthropic")];
  });
});
