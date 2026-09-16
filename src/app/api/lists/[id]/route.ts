import { z } from "zod";
import { deleteList, getList, removeLeadFromList, updateList } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const patchSchema = z.object({
  name: z.string().optional(),
  removeLeadId: z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withCommand(async () => getList(await getRuntime(), id));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withCommand(async () => {
    const input = patchSchema.parse(await req.json());
    const ctx = await getRuntime();
    if (input.removeLeadId) return removeLeadFromList(ctx, id, input.removeLeadId);
    if (input.name !== undefined) return updateList(ctx, id, { name: input.name });
    return getList(ctx, id);
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withCommand(async () => deleteList(await getRuntime(), id));
}
