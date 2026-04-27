import { describe, expect, it } from "vitest";
import {
  isVertexGoogleUserAuthFailureMessage,
  isVertexMockupTimeoutMessage,
  isVertexResourceExhaustedMessage,
  resolveMockupImageProvider,
  isOpenAiFallbackOnVertexAuthErrorEnabled,
  isOpenAiFallbackOnVertexQuotaEnabled,
  isOpenAiFallbackOnVertexTimeoutEnabled,
  vertexGeminiImageModel,
  vertexLocation,
  VERTEX_GEMINI_IMAGE_MODEL_ID,
} from "@/lib/ai/mockup-image-provider";

describe("resolveMockupImageProvider", () => {
  it("uses Vertex when GOOGLE_CLOUD_PROJECT is set", () => {
    const prevP = process.env.GOOGLE_CLOUD_PROJECT;
    const prevM = process.env.MOCKUP_IMAGE_PROVIDER;
    delete process.env.MOCKUP_IMAGE_PROVIDER;
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    try {
      expect(resolveMockupImageProvider()).toBe("vertex_gemini");
    } finally {
      if (prevP === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
      else process.env.GOOGLE_CLOUD_PROJECT = prevP;
      if (prevM === undefined) delete process.env.MOCKUP_IMAGE_PROVIDER;
      else process.env.MOCKUP_IMAGE_PROVIDER = prevM;
    }
  });

  it("throws when Vertex is not configured (default is Vertex-only mockups)", () => {
    const prevP = process.env.GOOGLE_CLOUD_PROJECT;
    const prevM = process.env.MOCKUP_IMAGE_PROVIDER;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.MOCKUP_IMAGE_PROVIDER;
    try {
      expect(() => resolveMockupImageProvider()).toThrow(/Mockup images use Vertex AI/);
    } finally {
      if (prevP === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
      else process.env.GOOGLE_CLOUD_PROJECT = prevP;
      if (prevM === undefined) delete process.env.MOCKUP_IMAGE_PROVIDER;
      else process.env.MOCKUP_IMAGE_PROVIDER = prevM;
    }
  });

  it("MOCKUP_IMAGE_PROVIDER=auto uses Vertex when project is set", () => {
    const prevP = process.env.GOOGLE_CLOUD_PROJECT;
    const prevM = process.env.MOCKUP_IMAGE_PROVIDER;
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.MOCKUP_IMAGE_PROVIDER = "auto";
    try {
      expect(resolveMockupImageProvider()).toBe("vertex_gemini");
    } finally {
      if (prevP === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
      else process.env.GOOGLE_CLOUD_PROJECT = prevP;
      if (prevM === undefined) delete process.env.MOCKUP_IMAGE_PROVIDER;
      else process.env.MOCKUP_IMAGE_PROVIDER = prevM;
    }
  });

  it("MOCKUP_IMAGE_PROVIDER=openai skips Vertex even when project is set", () => {
    const prevP = process.env.GOOGLE_CLOUD_PROJECT;
    const prevM = process.env.MOCKUP_IMAGE_PROVIDER;
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.MOCKUP_IMAGE_PROVIDER = "openai";
    try {
      expect(resolveMockupImageProvider()).toBe("openai");
    } finally {
      if (prevP === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
      else process.env.GOOGLE_CLOUD_PROJECT = prevP;
      if (prevM === undefined) delete process.env.MOCKUP_IMAGE_PROVIDER;
      else process.env.MOCKUP_IMAGE_PROVIDER = prevM;
    }
  });

  it("MOCKUP_IMAGE_PROVIDER=vertex throws when project is missing", () => {
    const prevP = process.env.GOOGLE_CLOUD_PROJECT;
    const prevM = process.env.MOCKUP_IMAGE_PROVIDER;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    process.env.MOCKUP_IMAGE_PROVIDER = "vertex";
    try {
      expect(() => resolveMockupImageProvider()).toThrow(/MOCKUP_IMAGE_PROVIDER=vertex/);
    } finally {
      if (prevP === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
      else process.env.GOOGLE_CLOUD_PROJECT = prevP;
      if (prevM === undefined) delete process.env.MOCKUP_IMAGE_PROVIDER;
      else process.env.MOCKUP_IMAGE_PROVIDER = prevM;
    }
  });
});

describe("vertexGeminiImageModel / vertexLocation", () => {
  it("uses fixed Gemini 3.1 Flash Image id and global region", () => {
    expect(vertexGeminiImageModel()).toBe(VERTEX_GEMINI_IMAGE_MODEL_ID);
    expect(vertexLocation()).toBe("global");
  });
});

describe("isVertexMockupTimeoutMessage", () => {
  it("detects wrapped Vertex timeout errors", () => {
    expect(
      isVertexMockupTimeoutMessage(
        "Vertex mockup image request failed (gemini-3.1-flash-image-preview @ global): Vertex mockup image request (gemini-3.1-flash-image-preview @ global) timed out after 180s",
      ),
    ).toBe(true);
    expect(isVertexMockupTimeoutMessage("Vertex blocked")).toBe(false);
    expect(isVertexMockupTimeoutMessage("timed out after 30s")).toBe(false);
  });
});

describe("isVertexResourceExhaustedMessage", () => {
  it("detects 429 / RESOURCE_EXHAUSTED from Vertex mockup errors", () => {
    expect(
      isVertexResourceExhaustedMessage(
        'Vertex mockup image request failed (gemini-3.1-flash-image-preview @ global): {"error":{"code":429,"message":"Resource has been exhausted (e.g. check quota).","status":"RESOURCE_EXHAUSTED"}} | http_status=429',
      ),
    ).toBe(true);
    expect(isVertexResourceExhaustedMessage("Vertex mockup image request failed: timeout")).toBe(false);
    expect(isVertexResourceExhaustedMessage("RESOURCE_EXHAUSTED without vertex")).toBe(true);
  });
});

describe("isOpenAiFallbackOnVertexQuotaEnabled", () => {
  it("when unset: true in non-production, false in production", () => {
    const prevFb = process.env.MOCKUP_VERTEX_QUOTA_OPENAI_FALLBACK;
    const prevNode = process.env.NODE_ENV;
    try {
      delete process.env.MOCKUP_VERTEX_QUOTA_OPENAI_FALLBACK;
      process.env.NODE_ENV = "development";
      expect(isOpenAiFallbackOnVertexQuotaEnabled()).toBe(true);
      process.env.NODE_ENV = "production";
      expect(isOpenAiFallbackOnVertexQuotaEnabled()).toBe(false);
    } finally {
      if (prevFb === undefined) delete process.env.MOCKUP_VERTEX_QUOTA_OPENAI_FALLBACK;
      else process.env.MOCKUP_VERTEX_QUOTA_OPENAI_FALLBACK = prevFb;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });
});

describe("isOpenAiFallbackOnVertexTimeoutEnabled", () => {
  it("when unset: true in non-production, false in production", () => {
    const prevFb = process.env.MOCKUP_VERTEX_TIMEOUT_OPENAI_FALLBACK;
    const prevNode = process.env.NODE_ENV;
    try {
      delete process.env.MOCKUP_VERTEX_TIMEOUT_OPENAI_FALLBACK;
      process.env.NODE_ENV = "development";
      expect(isOpenAiFallbackOnVertexTimeoutEnabled()).toBe(true);
      process.env.NODE_ENV = "production";
      expect(isOpenAiFallbackOnVertexTimeoutEnabled()).toBe(false);
    } finally {
      if (prevFb === undefined) delete process.env.MOCKUP_VERTEX_TIMEOUT_OPENAI_FALLBACK;
      else process.env.MOCKUP_VERTEX_TIMEOUT_OPENAI_FALLBACK = prevFb;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });
});

describe("isVertexGoogleUserAuthFailureMessage", () => {
  it("detects invalid_rapt / invalid_grant / reauth from Vertex error text", () => {
    expect(
      isVertexGoogleUserAuthFailureMessage(
        'Vertex mockup: {"error":"invalid_grant","error_subtype":"invalid_rapt"}',
      ),
    ).toBe(true);
    expect(isVertexGoogleUserAuthFailureMessage("reauth related error")).toBe(true);
    expect(isVertexGoogleUserAuthFailureMessage("Vertex blocked")).toBe(false);
  });
});

describe("isOpenAiFallbackOnVertexAuthErrorEnabled", () => {
  it("when unset: true in non-production, false in production", () => {
    const prevFb = process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK;
    const prevNode = process.env.NODE_ENV;
    try {
      delete process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK;
      process.env.NODE_ENV = "development";
      expect(isOpenAiFallbackOnVertexAuthErrorEnabled()).toBe(true);
      process.env.NODE_ENV = "test";
      expect(isOpenAiFallbackOnVertexAuthErrorEnabled()).toBe(true);
      process.env.NODE_ENV = "production";
      expect(isOpenAiFallbackOnVertexAuthErrorEnabled()).toBe(false);
    } finally {
      if (prevFb === undefined) delete process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK;
      else process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK = prevFb;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it("explicit 1/true enables in production", () => {
    const prevFb = process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK;
    const prevNode = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK = "1";
      expect(isOpenAiFallbackOnVertexAuthErrorEnabled()).toBe(true);
    } finally {
      if (prevFb === undefined) delete process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK;
      else process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK = prevFb;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  it("explicit 0/false disables in development", () => {
    const prevFb = process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK;
    const prevNode = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "development";
      process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK = "0";
      expect(isOpenAiFallbackOnVertexAuthErrorEnabled()).toBe(false);
    } finally {
      if (prevFb === undefined) delete process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK;
      else process.env.MOCKUP_VERTEX_AUTH_OPENAI_FALLBACK = prevFb;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });
});
