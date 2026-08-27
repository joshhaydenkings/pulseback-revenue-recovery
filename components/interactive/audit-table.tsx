"use client";

import { useState } from "react";
import { ChevronDown, Filter, Search } from "lucide-react";

type AuditRow = {
  id: string;
  timestamp: string;
  actor: string;
  caseId: string;
  event: string;
  outcome: string;
  message: string;
  metadata: unknown;
};

export function AuditTable({ events }: { events: AuditRow[] }) {
  const [actor, setActor] = useState("ALL");
  const [query, setQuery] = useState("");
  const rows = events.filter(
    (event) =>
      (actor === "ALL" || event.actor === actor) &&
      `${event.event} ${event.caseId} ${event.message}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  return (
    <section className="panel audit-table">
      <div className="filterbar">
        <label>
          <Search size={15} />
          <span className="sr-only">Search audit events</span>
          <input
            aria-label="Search audit events"
            placeholder="Search audit events"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="filter-select">
          <Filter size={14} />
          <select
            aria-label="Filter audit events by actor"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
          >
            <option value="ALL">All actors</option>
            {[...new Set(events.map((event) => event.actor))].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
        <span className="row-count">{rows.length} events</span>
      </div>
      <div className="audit-row audit-header">
        <span>Timestamp</span><span>Actor</span><span>Case</span>
        <span>Decision / Action</span><span>Outcome</span>
      </div>
      {rows.map((event) => {
        const timestamp = new Date(event.timestamp);
        return (
          <details className="audit-row-wrap" key={event.id}>
            <summary className="audit-row">
              <span>
                <b>{timestamp.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</b>
                <small>{timestamp.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</small>
              </span>
              <span><em className={`actor actor-${event.actor.toLowerCase()}`}>{event.actor.replaceAll("_", " ")}</em></span>
              <span>{event.caseId ? <a href={`/recoveries/${event.caseId}`}>{event.caseId}</a> : "—"}</span>
              <span><b>{event.event}</b><small>{event.message}</small></span>
              <span>{event.outcome}</span>
            </summary>
            <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
          </details>
        );
      })}
      {!rows.length && (
        <div className="empty-state">
          {events.length ? "No audit events match these filters." : "No audit events yet."}
        </div>
      )}
    </section>
  );
}
