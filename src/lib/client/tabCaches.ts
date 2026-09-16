"use client";

import { useEffect, useState } from "react";

function createTabCache<T>(load: () => Promise<T>, fallbackError: string) {
  let data: T | null = null;
  let inflight: Promise<void> | null = null;
  let error: string | null = null;
  let settled = false;
  const listeners = new Set<() => void>();

  function emit() {
    for (const fn of listeners) fn();
  }

  function subscribe(fn: () => void) {
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }

  function ensure() {
    if (data || inflight) return inflight ?? Promise.resolve();
    inflight = load()
      .then((value) => {
        data = value;
        error = null;
        settled = true;
        inflight = null;
        emit();
      })
      .catch((err: unknown) => {
        inflight = null;
        settled = true;
        error = err instanceof Error ? err.message : fallbackError;
        emit();
      });
    return inflight;
  }

  function set(value: T) {
    data = value;
    error = null;
    settled = true;
    emit();
  }

  function use() {
    const [value, setValue] = useState<T | null>(data);
    const [err, setError] = useState<string | null>(error);
    const [ready, setReady] = useState(settled);
    useEffect(() => {
      void ensure();
      return subscribe(() => {
        setValue(data);
        setError(error);
        setReady(settled);
      });
    }, []);
    return { data: value, loaded: ready, error: err, set };
  }

  return { ensure, set, get: () => data, use };
}

export type InboxMessage = {
  id: string;
  channel: string;
  direction: string;
  body: string;
  subject: string | null;
  enrollmentId: string;
  createdAt: string;
  enrollmentStatus?: string | null;
  lead: {
    fullName: string;
    email: string | null;
    linkedinUrl: string | null;
    linkedinUrlNormalized?: string | null;
  } | null;
};

export type AnalyticsBoard = {
  totals: {
    runs: number;
    enrolled: number;
    sent: number;
    skipped: number;
    failed: number;
    replies: number;
    replyRate: number;
    restricted: number;
  };
  runs: Array<{
    id: string;
    name: string;
    status: string;
    enrolled: number;
    sent: number;
    skipped: number;
    failed: number;
    pending: number;
    replies: number;
    replyRate: number;
    restricted: boolean;
    throttled?: boolean;
    lastActivity: string | null;
    steps: Array<{
      stepIndex: number;
      action: string;
      channel: string;
      sent: number;
      skipped: number;
      failed: number;
      replies: number;
      replyRate: number;
      skipReasons: Record<string, number>;
    }>;
    insights: string[];
  }>;
};

export type SettingsSnapshot = {
  sandbox: number | boolean;
  killSwitch: number | boolean;
  liveKeys?: boolean;
  senders: Array<{
    id: string;
    channel: string;
    status: string;
    displayName: string;
    unipileAccountId?: string | null;
    lastError?: string | null;
  }>;
  workspace?: {
    timezone: string;
    sandbox: number;
    killSwitch: number;
    mcpApiKey: string;
  };
};

export type SettingsBundle = {
  settings: SettingsSnapshot;
  audit: Array<{ id: string; action: string; createdAt: string }>;
};

const inbox = createTabCache<InboxMessage[]>(async () => {
  const res = await fetch("/api/inbox");
  const body = await res.json();
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load inbox");
  return Array.isArray(body) ? body : [];
}, "Could not load inbox");

const analytics = createTabCache<AnalyticsBoard>(async () => {
  const res = await fetch("/api/analytics");
  const body = await res.json();
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load analytics");
  return body as AnalyticsBoard;
}, "Could not load analytics");

const settings = createTabCache<SettingsBundle>(async () => {
  const [res, auditRes] = await Promise.all([fetch("/api/settings"), fetch("/api/audit")]);
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Could not load settings");
  const auditJson = await auditRes.json();
  return {
    settings: json as SettingsSnapshot,
    audit: Array.isArray(auditJson) ? auditJson : [],
  };
}, "Could not load settings");

export const ensureInboxCache = inbox.ensure;
export const setInboxCache = inbox.set;
export const useInbox = inbox.use;

export const ensureAnalyticsCache = analytics.ensure;
export const setAnalyticsCache = analytics.set;
export const useAnalytics = analytics.use;

export const ensureSettingsCache = settings.ensure;
export const setSettingsCache = settings.set;
export const useSettings = settings.use;
