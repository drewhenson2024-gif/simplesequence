"use client";

import { useEffect, useState } from "react";
import { subscribePendingDelete } from "@/lib/client/pendingDelete";

export type PeopleLead = {
  id: string;
  fullName: string;
  company?: string | null;
  title?: string | null;
  openingLine?: string | null;
  linkedinUrlNormalized: string | null;
  linkedinUrl?: string | null;
};

export type PeopleList = {
  id: string;
  name: string;
  leadCount: number;
  leads: PeopleLead[];
};

let lists: PeopleList[] | null = null;
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
    if (committed?.kind === "list") removePeopleList(committed.id);
  });
}

function asPeopleList(body: { id: string; name: string; leads?: PeopleLead[]; leadCount?: number }): PeopleList {
  const leads = body.leads ?? [];
  return { id: body.id, name: body.name, leads, leadCount: body.leadCount ?? leads.length };
}

export function getPeopleLists() {
  return lists;
}

export function getPeopleList(id: string) {
  return lists?.find((list) => list.id === id) ?? null;
}

export function getPeopleError() {
  return loadError;
}

export function subscribePeople(fn: () => void) {
  listeners.add(fn);
  fn();
  return () => {
    listeners.delete(fn);
  };
}

export function ensurePeopleCache() {
  bindDeletes();
  if (lists || inflight) return inflight ?? Promise.resolve();
  inflight = (async () => {
    const res = await fetch("/api/lists");
    const body = await res.json();
    if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load people");
    lists = Array.isArray(body) ? body.map((row: PeopleList) => asPeopleList(row)) : [];
    loadError = null;
    inflight = null;
    emit();
    await Promise.all((lists ?? []).map((list) => refreshPeopleList(list.id).catch(() => undefined)));
  })().catch((err: unknown) => {
    inflight = null;
    lists = [];
    loadError = err instanceof Error ? err.message : "Could not load people";
    emit();
  });
  return inflight;
}

export function upsertPeopleList(input: { id: string; name: string; leads?: PeopleLead[]; leadCount?: number }) {
  const next = asPeopleList(input);
  if (!lists) {
    lists = [next];
  } else if (lists.some((list) => list.id === next.id)) {
    lists = lists.map((list) => (list.id === next.id ? { ...list, ...next } : list));
  } else {
    lists = [next, ...lists];
  }
  emit();
}

export function patchPeopleList(id: string, patch: Partial<Pick<PeopleList, "name" | "leads">>) {
  if (!lists) return;
  lists = lists.map((list) => {
    if (list.id !== id) return list;
    const leads = patch.leads ?? list.leads;
    return {
      ...list,
      name: patch.name ?? list.name,
      leads,
      leadCount: leads.length,
    };
  });
  emit();
}

export function removePeopleList(id: string) {
  if (!lists) return;
  lists = lists.filter((list) => list.id !== id);
  emit();
}

export async function refreshPeopleList(id: string) {
  const res = await fetch(`/api/lists/${id}`);
  const body = await res.json();
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load list");
  upsertPeopleList(body);
  return asPeopleList(body);
}

export function usePeopleLists() {
  const [rows, setRows] = useState<PeopleList[] | null>(getPeopleLists);
  const [error, setError] = useState<string | null>(getPeopleError);
  useEffect(() => {
    void ensurePeopleCache();
    return subscribePeople(() => {
      setRows(getPeopleLists());
      setError(getPeopleError());
    });
  }, []);
  return { lists: rows ?? [], loaded: rows !== null, error };
}

export function usePeopleList(id: string) {
  const [list, setList] = useState<PeopleList | null>(() => getPeopleList(id));
  const [loaded, setLoaded] = useState(() => getPeopleLists() !== null);
  const [error, setError] = useState<string | null>(getPeopleError);
  useEffect(() => {
    void ensurePeopleCache();
    return subscribePeople(() => {
      setList(getPeopleList(id));
      setLoaded(getPeopleLists() !== null);
      setError(getPeopleError());
    });
  }, [id]);
  return { list, loaded, error };
}
