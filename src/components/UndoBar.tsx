"use client";

import { useEffect, useState } from "react";
import {
  subscribePendingDelete,
  undoDelete,
  type PendingDelete,
} from "@/lib/client/pendingDelete";

export function UndoBar() {
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribePendingDelete(({ pending: next, error: nextError }) => {
      setPending(next);
      setError(nextError);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  if (error) {
    return <div className="card mb-4 px-4 py-3 text-sm text-(--danger)">{error}</div>;
  }

  if (!pending) return null;

  return (
    <div className="card mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <p className="text-sm">
        <span className="font-medium">{pending.name}</span> deleted.
      </p>
      <button type="button" className="btn btn-sm btn-primary" onClick={undoDelete}>
        Undo
      </button>
    </div>
  );
}
