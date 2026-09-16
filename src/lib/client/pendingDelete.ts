export type PendingKind = "list" | "campaign";

export type PendingDelete = {
  kind: PendingKind;
  id: string;
  name: string;
};

export const UNDO_MS = 8000;

export type PendingDeleteEvent = {
  pending: PendingDelete | null;
  hidden: PendingDelete[];
  error: string | null;
  committed: PendingDelete | null;
};

type Listener = (event: PendingDeleteEvent) => void;

let pending: PendingDelete | null = null;
let hidden: PendingDelete[] = [];
let error: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();
let chain: Promise<void> = Promise.resolve();
let unloadBound = false;

function emit(committed: PendingDelete | null = null) {
  const event: PendingDeleteEvent = { pending, hidden, error, committed };
  for (const fn of listeners) fn(event);
}

function endpoint(item: PendingDelete) {
  return item.kind === "list" ? `/api/lists/${item.id}` : `/api/campaigns/${item.id}`;
}

async function commit(item: PendingDelete) {
  const res = await fetch(endpoint(item), { method: "DELETE", keepalive: true });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not delete");
  }
}

function bindUnload() {
  if (unloadBound || typeof window === "undefined") return;
  unloadBound = true;
  window.addEventListener("pagehide", () => {
    const items = hidden;
    pending = null;
    hidden = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    for (const item of items) {
      void fetch(endpoint(item), { method: "DELETE", keepalive: true });
    }
  });
}

export function getPending() {
  return pending;
}

export function subscribePendingDelete(fn: Listener) {
  bindUnload();
  listeners.add(fn);
  fn({ pending, hidden, error, committed: null });
  return () => {
    listeners.delete(fn);
  };
}

function enqueueCommit(item: PendingDelete) {
  chain = chain.then(() => commit(item)).then(
    () => {
      hidden = hidden.filter((row) => row.id !== item.id);
      emit(item);
    },
    (err: unknown) => {
      hidden = hidden.filter((row) => row.id !== item.id);
      error = err instanceof Error ? err.message : "Could not delete";
      emit();
    },
  );
}

export function scheduleDelete(next: PendingDelete) {
  bindUnload();
  error = null;
  const previous = pending;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pending = next;
  if (!hidden.some((row) => row.id === next.id)) hidden = [...hidden, next];
  timer = setTimeout(() => {
    void flushPendingDelete();
  }, UNDO_MS);
  emit();
  if (previous && previous.id !== next.id) enqueueCommit(previous);
}

export function undoDelete() {
  if (!pending) return;
  if (timer) clearTimeout(timer);
  timer = null;
  hidden = hidden.filter((row) => row.id !== pending?.id);
  pending = null;
  error = null;
  emit();
}

export async function flushPendingDelete() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const current = pending;
  pending = null;
  emit();
  if (!current) return;
  enqueueCommit(current);
  await chain;
}
