import { describe, expect, it } from "vitest";
import { cursorMcpInstallHref, mcpClientConfigJson, MCP_URL } from "@/lib/domain/mcpInstall";

describe("cursor MCP install", () => {
  it("opens Cursor's install confirm with the URL and key", () => {
    const href = cursorMcpInstallHref("dev-mcp-key");
    const parsed = new URL(href);
    expect(parsed.protocol).toBe("cursor:");
    expect(parsed.hostname).toBe("anysphere.cursor-deeplink");
    expect(parsed.pathname).toBe("/mcp/install");
    expect(parsed.searchParams.get("name")).toBe("simplesequence");
    const config = JSON.parse(atob(parsed.searchParams.get("config") ?? ""));
    expect(config).toEqual({
      url: MCP_URL,
      headers: { "X-API-Key": "dev-mcp-key" },
    });
  });

  it("copies the same server for a manual paste", () => {
    const pasted = JSON.parse(mcpClientConfigJson("dev-mcp-key"));
    expect(pasted.mcpServers.simplesequence.url).toBe(MCP_URL);
    expect(pasted.mcpServers.simplesequence.headers["X-API-Key"]).toBe("dev-mcp-key");
  });
});
