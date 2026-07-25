import {
  PEOPLE,
  RATE_SGD_PER_HALF_HOUR,
  bedtimeSummary,
  formatNight,
  formatSGT,
  loadDashboardData,
} from "@/lib/data";
import RefreshButton from "./RefreshButton";

// Always render on request so the numbers are fresh.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const data = await loadDashboardData();

  const formatSgd = (n: number) =>
    new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: "SGD",
      minimumFractionDigits: 2,
    }).format(n);

  return (
    <main>
      <header>
        <h1>Sleep accountability</h1>
        <p className="subtitle">
          Latest activity each night, rounded up to the nearest half hour.
          Times past bedtime are highlighted. Hit{" "}
          <span className="refresh inline" aria-hidden>
            <span className="refresh-icon">↻</span>
          </span>{" "}
          beside a date to recompute it from the raw events.
        </p>
        <p className="bedtimes">
          Bedtimes:{" "}
          {PEOPLE.map((p, i) => {
            const { main, exceptions } = bedtimeSummary(p);
            return (
              <span key={p}>
                {i > 0 && " · "}
                <strong>{p}</strong> {main}
                {exceptions.length > 0 && (
                  <>
                    {" ("}
                    {exceptions.map((e, j) => (
                      <span key={e.day}>
                        {j > 0 && ", "}
                        {e.day} {e.label}
                      </span>
                    ))}
                    {")"}
                  </>
                )}
              </span>
            );
          })}
        </p>
      </header>

      {data.error && <div className="error">{data.error}</div>}

      <div className="card">
        {data.rows.length === 0 ? (
          <div className="empty">
            No activity events yet. Once the tracker logs some events,
            they&rsquo;ll show up here.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {PEOPLE.map((p) => (
                  <th key={p}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.night}>
                  <td>
                    <span className="night-label">
                      {formatNight(row.night)}
                    </span>
                    <RefreshButton
                      night={row.night}
                      refreshedAt={row.refreshedAt}
                    />
                  </td>
                  {PEOPLE.map((p) => {
                    const cell = row.cells[p];
                    if (cell.roundedMs === null) {
                      return (
                        <td key={p} className="time muted">
                          —
                        </td>
                      );
                    }
                    return (
                      <td
                        key={p}
                        className={`time${cell.overdue ? " overdue" : ""}`}
                      >
                        {formatSGT(cell.roundedMs)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="totals">
                <th>Total half-hours</th>
                {PEOPLE.map((p) => (
                  <td key={p} className="time">
                    {data.totals[p]}
                  </td>
                ))}
              </tr>
              <tr className="owed">
                <th>Owed (SGD)</th>
                {PEOPLE.map((p) => (
                  <td key={p} className="time">
                    {formatSgd(data.totals[p] * RATE_SGD_PER_HALF_HOUR)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <footer>
        Updated {new Date(data.fetchedAt).toLocaleString("en-SG", {
          timeZone: "Asia/Singapore",
        })}{" "}
        · rate {formatSgd(RATE_SGD_PER_HALF_HOUR)} / half-hour
      </footer>
    </main>
  );
}
