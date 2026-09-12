"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";

type Lead = {
  id: string;
  fullName: string;
  company: string;
  title: string;
  email: string | null;
  linkedinUrlNormalized: string | null;
};

export default function ListDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{ name: string; leads: Lead[] } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/lists/${params.id}`);
      setData(await res.json());
    })();
  }, [params.id]);

  if (!data) {
    return (
      <AppShell>
        <p>Loading…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-3xl">{data.name}</h1>
      <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b border-(--line) text-(--muted)">
            <th className="py-2 pr-4">Name</th>
            <th className="pr-4">Company</th>
            <th className="pr-4">Title</th>
            <th className="pr-4">Email</th>
            <th>LinkedIn</th>
          </tr>
        </thead>
        <tbody>
          {data.leads.map((lead) => (
            <tr key={lead.id} className="border-b border-(--line)">
              <td className="py-2 pr-4">{lead.fullName}</td>
              <td className="pr-4">{lead.company}</td>
              <td className="pr-4">{lead.title}</td>
              <td className="pr-4">{lead.email}</td>
              <td className="max-w-48 truncate">{lead.linkedinUrlNormalized}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </AppShell>
  );
}
