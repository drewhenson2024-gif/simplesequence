import { getAppDb, migrate, seedWorkspace } from "./client";

async function main() {
  const { client, db } = await getAppDb();
  await migrate(client);
  await seedWorkspace(db);
  console.log("migrated");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
