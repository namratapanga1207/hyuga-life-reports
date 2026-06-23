"use client";

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import type { SummaryRow } from "@/app/api/summary/route";
import type { TicketRow } from "@/app/api/tickets/route";
import { SUMMARY_HEADERS, TICKET_HEADERS } from "@/lib/sheet-headers";

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
      const res = await fetch(`/api/report?${qs}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Report failed");

      setSummary(data.summary ?? []);
      setTickets(data.tickets ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load reports";
      setError(
        msg === "Failed to fetch"
          ? "Request timed out — large date ranges can take 1–2 minutes. Try again or use a shorter range."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }, [qs]);

  const exportCurrent = () => {
    const stamp = `${startDate}_to_${endDate}`;
    if (tab === "summary") {
      exportXlsx(
        summary.map((r) => ({
          [SUMMARY_HEADERS.month]: r.month,
          [SUMMARY_HEADERS.chatClicks]: r.chat_with_nutritionist_clicks,
          [SUMMARY_HEADERS.entryPoint1]: r.entry_point_1,
          [SUMMARY_HEADERS.entryPoint2]: r.entry_point_2,
        })),
        "Summary",
        `hyuga_nutritionist_summary_${stamp}.xlsx`,
      );
    } else {
      exportXlsx(
        tickets.map((r) => ({
          [TICKET_HEADERS.phoneNumber]: r.phone_number,
          [TICKET_HEADERS.ticketLink]: r.ticket_link,
          [TICKET_HEADERS.inbox]: r.inbox,
          [TICKET_HEADERS.firstMessage]: r.first_message,
          [TICKET_HEADERS.entryType]: r.entry_type,
          [TICKET_HEADERS.ticketId]: r.ticket_id,
          [TICKET_HEADERS.level1Tags]: r.level_1_tags,
          [TICKET_HEADERS.level2Tags]: r.level_2_tags,
          [TICKET_HEADERS.level3Tags]: r.level_3_tags,
          [TICKET_HEADERS.systemTags]: r.system_tags,
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
              {loading ? "Generating… (may take 1–2 min)" : "Generate reports"}
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
              {startDate} → {endDate}
              {summary.length ? ` · ${summary.length} month(s)` : ""}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{SUMMARY_HEADERS.month}</th>
                    <th>{SUMMARY_HEADERS.chatClicks}</th>
                    <th>{SUMMARY_HEADERS.entryPoint1}</th>
                    <th>{SUMMARY_HEADERS.entryPoint2}</th>
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
            <p className="meta">{tickets.length} row(s)</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{TICKET_HEADERS.phoneNumber}</th>
                    <th>{TICKET_HEADERS.ticketLink}</th>
                    <th>{TICKET_HEADERS.inbox}</th>
                    <th>{TICKET_HEADERS.firstMessage}</th>
                    <th>{TICKET_HEADERS.entryType}</th>
                    <th>{TICKET_HEADERS.ticketId}</th>
                    <th>{TICKET_HEADERS.level1Tags}</th>
                    <th>{TICKET_HEADERS.level2Tags}</th>
                    <th>{TICKET_HEADERS.level3Tags}</th>
                    <th>{TICKET_HEADERS.systemTags}</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 ? (
                    <tr>
                      <td colSpan={10}>Run generate to load ticket dump.</td>
                    </tr>
                  ) : (
                    tickets.map((row) => (
                      <tr key={row.ticket_id}>
                        <td>{row.phone_number}</td>
                        <td>
                          <a href={row.ticket_link} target="_blank" rel="noreferrer">
                            {row.ticket_link}
                          </a>
                        </td>
                        <td>{row.inbox}</td>
                        <td className="message-cell">{row.first_message}</td>
                        <td>{row.entry_type}</td>
                        <td>{row.ticket_id}</td>
                        <td>{row.level_1_tags}</td>
                        <td>{row.level_2_tags}</td>
                        <td>{row.level_3_tags}</td>
                        <td>{row.system_tags}</td>
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
