import { describe, expect, it } from "vitest";
import { classifyLinkedInProviderError } from "@/lib/domain/linkedinSafety";

describe("classifyLinkedInProviderError", () => {
  it("treats cannot_resend_yet as quota", () => {
    expect(classifyLinkedInProviderError("Unipile 422 cannot_resend_yet")).toBe("quota");
  });

  it("treats a bare 429 as throttle", () => {
    expect(classifyLinkedInProviderError("Unipile 429 provider/too_many_requests")).toBe("throttle");
    expect(classifyLinkedInProviderError("rate limit exceeded")).toBe("throttle");
  });

  it("lets hard restrict language win over a 429", () => {
    expect(classifyLinkedInProviderError("Unipile 429 account restricted")).toBe("restrict");
    expect(classifyLinkedInProviderError("checkpoint required")).toBe("restrict");
    expect(classifyLinkedInProviderError("captcha")).toBe("restrict");
  });

  it("ignores ordinary 404s", () => {
    expect(classifyLinkedInProviderError("Unipile 404 /api/v1/users/foo")).toBeNull();
  });
});
