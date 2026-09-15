import { z } from "zod";
import { searchPeople } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  brief: z.string().min(1),
  limit: z.number().int().positive().optional(),
  listName: z.string().optional(),
});

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return searchPeople(await getRuntime(), input);
  });
}
