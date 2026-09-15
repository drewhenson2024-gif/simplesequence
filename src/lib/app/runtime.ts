import { eq } from "drizzle-orm";
import { createUnipilePort } from "../unipile/port";
import { createDataPort } from "../data/apollo";
import { createGiftPort } from "../gift/port";
import { getAppDb } from "../db/client";
import { workspaces } from "../db/schema";
import { DEFAULT_WORKSPACE_ID } from "../ids";
import { defaultClock, type AppContext } from "./commands";

export async function getRuntime(): Promise<AppContext> {
  const { db, client } = await getAppDb();
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, DEFAULT_WORKSPACE_ID))
    .limit(1);
  const sandbox = Boolean(ws?.sandbox);
  const unipile = createUnipilePort(process.env, { sendEnabled: !sandbox });
  return {
    db,
    client,
    unipile,
    data: createDataPort(process.env, unipile),
    gift: createGiftPort(process.env, { sandbox }),
    clock: defaultClock(),
    actor: "user_default",
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
}
