import { createUnipilePort } from "../unipile/port";
import { getAppDb } from "../db/client";
import { DEFAULT_WORKSPACE_ID } from "../ids";
import { defaultClock, type AppContext } from "./commands";

export async function getRuntime(): Promise<AppContext> {
  const { db, client } = await getAppDb();
  return {
    db,
    client,
    unipile: createUnipilePort(),
    clock: defaultClock(),
    actor: "user_default",
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
}
