export const MCP_URL = "https://simplesequence-three.vercel.app/mcp";

export function mcpServerConfig(apiKey: string) {
  return {
    url: MCP_URL,
    headers: { "X-API-Key": apiKey },
  };
}

/** Config block pasted into Cursor or Claude. */
export function mcpClientConfigJson(apiKey: string) {
  return JSON.stringify({ mcpServers: { simplesequence: mcpServerConfig(apiKey) } }, null, 2);
}

/** Opens Cursor's install confirm. Config is the server object only; the name is a separate parameter. */
export function cursorMcpInstallHref(apiKey: string) {
  const encoded = btoa(JSON.stringify(mcpServerConfig(apiKey)));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=simplesequence&config=${encodeURIComponent(encoded)}`;
}
