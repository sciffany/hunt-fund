import {
  PEOPLE,
  RATE_SGD_PER_HALF_HOUR,
  RATE_SGD_PER_STEP_BLOCK,
  STEP_BLOCK,
  TARGET_STEPS,
  bedtimeSummary,
  formatNight,
  formatSGT,
  loadDashboardData,
} from "@/lib/data";
import PruneButton from "./PruneButton";
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

  const formatSteps = (n: number) =>
    new Intl.NumberFormat("en-SG").format(n);

  return (
    <main>
      <header>
        <div className="header-row">
          <h1>Hunt Fund</h1>
          <PruneButton />
        </div>
        <p className="subtitle">
          Sleep and daily steps for the household. Miss a bedtime or the step
          target and the pot grows.
        </p>
      </header>

      {data.error && <div className="error">{data.error}</div>}

      <section className="section">
        <h2>Sleep</h2>
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
                        refreshable={row.refreshable}
                      />
                      {row.note && (
                        <div className="night-note">{row.note}</div>
                      )}
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
        <p className="section-foot">
          Rate {formatSgd(RATE_SGD_PER_HALF_HOUR)} / half-hour past bedtime
        </p>
      </section>

      <section className="section">
        <h2>Steps</h2>
        <p className="subtitle">
          Daily step counts from the phone. Target is{" "}
          {formatSteps(TARGET_STEPS)} for everyone; every{" "}
          {formatSteps(STEP_BLOCK)} steps below that costs{" "}
          {formatSgd(RATE_SGD_PER_STEP_BLOCK)} (partial blocks round up).
        </p>

        <div className="card">
          {data.stepRows.length === 0 ? (
            <div className="empty">
              No step totals yet. Once the Android app flushes a day at
              midnight (or you tap Send steps), they&rsquo;ll show up here.
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
                {data.stepRows.map((row) => (
                  <tr key={row.day}>
                    <td>
                      <span className="night-label">
                        {formatNight(row.day)}
                      </span>
                    </td>
                    {PEOPLE.map((p) => {
                      const cell = row.cells[p];
                      if (cell.steps === null) {
                        return (
                          <td key={p} className="time muted">
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          key={p}
                          className={`time${cell.below ? " overdue" : ""}`}
                        >
                          {formatSteps(cell.steps)}
                          {cell.below && cell.shortfallUnits > 0 && (
                            <span className="step-debt">
                              {" "}
                              (−{cell.shortfallUnits})
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="totals">
                  <th>Total blocks short</th>
                  {PEOPLE.map((p) => (
                    <td key={p} className="time">
                      {data.stepTotals[p]}
                    </td>
                  ))}
                </tr>
                <tr className="owed">
                  <th>Owed (SGD)</th>
                  {PEOPLE.map((p) => (
                    <td key={p} className="time">
                      {formatSgd(data.stepTotals[p] * RATE_SGD_PER_STEP_BLOCK)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <p className="section-foot">
          Target {formatSteps(TARGET_STEPS)} ·{" "}
          {formatSgd(RATE_SGD_PER_STEP_BLOCK)} / {formatSteps(STEP_BLOCK)}{" "}
          steps short
        </p>
      </section>

      <footer>
        Updated{" "}
        {new Date(data.fetchedAt).toLocaleString("en-SG", {
          timeZone: "Asia/Singapore",
        })}
      </footer>
    </main>
  );
}
