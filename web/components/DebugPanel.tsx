"use client";
import { useEffect, useState } from "react";
import { verifyAll, getLogs, captureLogs, debugEnabled, type VerifyRow } from "@/lib/audio/debug";

/** ?debug overlay: on-page console logs + a pitch-verification table (intended vs re-detected
 *  output). Only renders when the URL has ?debug. Functional, not pretty. */
export function DebugPanel() {
  const [rows, setRows] = useState<VerifyRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!debugEnabled()) return;
    captureLogs();
    setOn(true);
    const t = setInterval(() => setLogs([...getLogs()]), 800); // live-ish log mirror
    return () => clearInterval(t);
  }, []);

  if (!on) return null;

  async function run() {
    setBusy(true);
    const r = await verifyAll();
    setRows(r);
    setBusy(false);
  }

  const centsColor = (c: number | null) =>
    c == null ? "#888" : Math.abs(c) <= 10 ? "#5f5" : Math.abs(c) <= 35 ? "#fd5" : "#f55";

  return (
    <div className="debug-panel">
      <div className="debug-head">
        <strong>pitch debug</strong>
        <button onClick={run} disabled={busy}>
          {busy ? "checking…" : "Run pitch check"}
        </button>
        <span style={{ opacity: 0.6 }}>(generate + play first, then run)</span>
      </div>
      {rows.length > 0 && (
        <table className="debug-table">
          <thead>
            <tr>
              <th>layer</th>
              <th>source</th>
              <th>conf</th>
              <th>target</th>
              <th>output (re-detected)</th>
              <th>cents</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.label}</td>
                <td>{r.source}</td>
                <td>{r.conf.toFixed(2)}</td>
                <td>{r.target}</td>
                <td>{r.output}</td>
                <td style={{ color: centsColor(r.cents) }}>
                  {r.cents == null ? "?" : `${r.cents > 0 ? "+" : ""}${r.cents}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="debug-logs">
        {logs.length === 0 ? <div style={{ opacity: 0.5 }}>(no logs yet — generate a scape)</div> : null}
        {logs.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
