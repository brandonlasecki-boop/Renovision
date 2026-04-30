import { afterEach, describe, expect, it } from "vitest";
import { resolveOpenAiImageEditOutputSize } from "./openai-bid";

const ENV_KEY = "MOCKUP_OPENAI_IMAGE_EDIT_SIZE";

describe("resolveOpenAiImageEditOutputSize", () => {
  const saved = process.env[ENV_KEY];

  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = saved;
  });

  it("returns 1024x1024 for dall-e-2", () => {
    delete process.env[ENV_KEY];
    expect(resolveOpenAiImageEditOutputSize("dall-e-2")).toBe("1024x1024");
  });

  it("returns auto for gpt-image-1 to preserve source aspect", () => {
    delete process.env[ENV_KEY];
    expect(resolveOpenAiImageEditOutputSize("gpt-image-1")).toBe("auto");
  });

  it("respects MOCKUP_OPENAI_IMAGE_EDIT_SIZE override", () => {
    process.env[ENV_KEY] = "1536x1024";
    expect(resolveOpenAiImageEditOutputSize("gpt-image-1")).toBe("1536x1024");
  });
});
