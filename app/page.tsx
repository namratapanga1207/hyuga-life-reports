"use client";

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import type { SummaryRow } from "@/app/api/summary/route";
import type { TicketRow } from "@/app/api/tickets/route";

type Tab = "summary" | "tickets";

function defaultRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportXlsx(rows: Record<string, unknown>[], sheetName: string, filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  downloadBlob(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}

export default function HomePage() {
  const defaults = defaultRange();
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [tab, setTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setConfigured(Boolean(d.metabase)))
      .catch(() => setConfigured(false));
  }, []);

  const qs = `start_date=${startDate}&end_date=${endDate}`;

  const runReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, ticketsRes] = await Promise.all([
        fetch(`/api/summary?${qs}`),
        fetch(`/api/tickets?${qs}`),
      ]);

      const summaryJson = await summaryRes.json();
      const ticketsJson = await ticketsRes.json();

      if (!summaryRes.ok) throw new Error(summaryJson.error ?? "Summary failed");
      if (!ticketsRes.ok) throw new Error(ticketsJson.error ?? "Ticket dump failed");

      setSummary(summaryJson.rows ?? []);
      setTickets(ticketsJson.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  const exportCurrent = () => {
    const stamp = `${startDate}_to_${endDate}`;
    if (tab === "summary") {
      exportXlsx(
        summary.map((r) => ({
          Month: r.month,
          "Chat with Nutritionist Clicks": r.chat_with_nutritionist_clicks,
          "Entry Point 1": r.entry_point_1,
          "Entry Point 2": r.entry_point_2,
        })),
        "Summary",
        `hyuga_nutritionist_summary_${stamp}.xlsx`,
      );
    } else {
      exportXlsx(
        tickets.map((r) => ({
          Month: r.month,
          "Phone Number": r.phone_number,
          "Ticket Link": r.ticket_link,
          "Ticket ID": r.ticket_id,
          "First Message": r.first_message,
          "Inbox ID": r.inbox_id,
          "Entry Point": r.entry_point,
          "Level 1 Tags": r.level_1_tags,
          "Level 2 Tags": r.level_2_tags,
          "System Tags": r.system_tags,
          "Clicked Chat with Nutritionist": "Yes",
        })),
        "Tickets",
        `hyuga_nutritionist_tickets_${stamp}.xlsx`,
      );
    }
  };

  return (
    <main className="page">
      <header className="hero">
        <h1>Hyuga Life — Nutritionist Reports</h1>
        <p>
          Date-range reports matching the Colab workflow: monthly summary and ticket dump
          (January-style sheet).
        </p>
      </header>

      {configured === false && (
        <div className="status error">
          Metabase env vars are not set. Add <code>METABASE_API_KEY</code> in Vercel (or{" "}
          <code>.env.local</code>) then redeploy.
        </div>
      )}

      <section className="card">
        <div className="filters">
          <div className="field">
            <label htmlFor="start">Start date</label>
            <input
              id="start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="end">End date</label>
            <input
              id="end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading}
              onClick={runReport}
            >
              {loading ? "Generating…" : "Generate reports"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loading || (tab === "summary" ? !summary.length : !tickets.length)}
              onClick={exportCurrent}
            >
              Download Excel
            </button>
          </div>
        </div>
      </section>

      {error && <div className="status error">{error}</div>}

      <section className="card">
        <div className="tabs">
          <button
            type="button"
            className={`tab ${tab === "summary" ? "active" : ""}`}
            onClick={() => setTab("summary")}
          >
            Summary
          </button>
          <button
            type="button"
            className={`tab ${tab === "tickets" ? "active" : ""}`}
            onClick={() => setTab("tickets")}
          >
            Ticket dump
          </button>
        </div>

        {tab === "summary" && (
          <>
            <p className="meta">
              Monthly chat clicks and entry-point counts for {startDate} → {endDate}
              {summary.length ? ` · ${summary.length} month(s)` : ""}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Chat with Nutritionist</th>
                    <th>Entry Point 1</th>
                    <th>Entry Point 2</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Run generate to load summary.</td>
                    </tr>
                  ) : (
                    summary.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{row.chat_with_nutritionist_clicks}</td>
                        <td>{row.entry_point_1}</td>
                        <td>{row.entry_point_2}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "tickets" && (
          <>
            <p className="meta">
              EP1/EP2 tickets with nutritionist chat click · {tickets.length} row(s)
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Phone</th>
                    <th>Ticket</th>
                    <th>Entry</th>
                    <th>First message</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Run generate to load ticket dump.</td>
                    </tr>
                  ) : (
                    tickets.map((row) => (
                      <tr key={`${row.ticket_id}-${row.month}`}>
                        <td>{row.month}</td>
                        <td>{row.phone_number}</td>
                        <td>
                          <a href={row.ticket_link} target="_blank" rel="noreferrer">
                            #{row.ticket_id}
                          </a>
                        </td>
                        <td>{row.entry_point}</td>
                        <td className="message-cell">{row.first_message}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
