"use client";

import { useEffect, useState } from "react";
import { subscribePendingDelete } from "@/lib/client/pendingDelete";

export type SequenceRow = {
  id: string;
  name: string;
  status: string;
  enrollmentCount: number;
};

let rows: SequenceRow[] | null = null;
let details = new Map<string, Record<string, unknown>>();
let inflight: Promise<void> | null = null;
let loadError: string | null = null;
let deletesBound = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function bindDeletes() {
  if (deletesBound) return;
  deletesBound = true;
  subscribePendingDelete(({ committed }) => {
    if (committed?.kind === "campaign") removeSequence(committed.id);
  });
}

function asRow(body: Partial<SequenceRow> & { id: string }): SequenceRow {
  return {
    id: body.id,
    name: body.name ?? "",
    status: body.status ?? "draft",
    enrollmentCount: body.enrollmentCount ?? 0,
  };
}

export function getSequenceDetail<T = Record<string, unknown>>(id: string): T | null {
  return (details.get(id) as T | undefined) ?? null;
}

export function setSequenceDetail(body: Record<string, unknown> & { id: string }) {
  details.set(body.id, body);
  upsertSequence({
    id: body.id,
    name: typeof body.name === "string" ? body.name : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    enrollmentCount: Array.isArray(body.enrollments)
      ? body.enrollments.length
      : typeof body.enrollmentCount === "number"
        ? body.enrollmentCount
        : undefined,
  });
}

export async function refreshSequence(id: string) {
  const res = await fetch(`/api/campaigns/${id}`);
  const body = await res.json();
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load sequence");
  setSequenceDetail(body);
  return body;
}

export function getSequences() {
  return rows;
}

export function getSequencesError() {
  return loadError;
}

export function subscribeSequences(fn: () => void) {
  listeners.add(fn);
  fn();
  return () => {
    listeners.delete(fn);
  };
}

export function ensureSequencesCache() {
  bindDeletes();
  if (rows || inflight) return inflight ?? Promise.resolve();
  inflight = (async () => {
    const res = await fetch("/api/campaigns");
    const body = await res.json();
    if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load sequences");
    rows = Array.isArray(body) ? body.map((row: SequenceRow) => asRow(row)) : [];
    loadError = null;
    inflight = null;
    emit();
    await Promise.all((rows ?? []).map((row) => refreshSequence(row.id).catch(() => undefined)));
  })().catch((err: unknown) => {
    inflight = null;
    rows = [];
    loadError = err instanceof Error ? err.message : "Could not load sequences";
    emit();
  });
  return inflight;
}

export function upsertSequence(input: Partial<SequenceRow> & { id: string }) {
  const next = asRow(input);
  if (!rows) {
    rows = [next];
  } else if (rows.some((row) => row.id === next.id)) {
    rows = rows.map((row) => (row.id === next.id ? { ...row, ...next } : row));
  } else {
    rows = [next, ...rows];
  }
  emit();
}

export function removeSequence(id: string) {
  if (!rows) return;
  rows = rows.filter((row) => row.id !== id);
  details.delete(id);
  emit();
}

export function useSequences() {
  const [list, setList] = useState<SequenceRow[] | null>(getSequences);
  const [error, setError] = useState<string | null>(getSequencesError);
  useEffect(() => {
    void ensureSequencesCache();
    return subscribeSequences(() => {
      setList(getSequences());
      setError(getSequencesError());
    });
  }, []);
  return { sequences: list ?? [], loaded: list !== null, error };
}

export function useSequenceDetail<T = Record<string, unknown>>(id: string) {
  const [detail, setDetail] = useState<T | null>(() => getSequenceDetail<T>(id));
  const [loaded, setLoaded] = useState(() => getSequenceDetail(id) !== null || getSequences() !== null);
  const [error, setError] = useState<string | null>(getSequencesError);
  useEffect(() => {
    void ensureSequencesCache();
    if (!getSequenceDetail(id)) void refreshSequence(id).catch(() => undefined);
    return subscribeSequences(() => {
      setDetail(getSequenceDetail<T>(id));
      setLoaded(getSequenceDetail(id) !== null || getSequences() !== null);
      setError(getSequencesError());
    });
  }, [id]);
  return { detail, loaded, error };
}
