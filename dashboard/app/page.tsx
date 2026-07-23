import {
  PEOPLE,
  RATE_SGD_PER_HALF_HOUR,
  formatNight,
  formatSGT,
  loadDashboardData,
} from "@/lib/data";

// Always render on request so the numbers are fresh.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BEDTIME_LABELS: Record<(typeof PEOPLE)[number], string> = {
  sample: "10:00 PM",
  tiffany: "11:30 PM",
  sophia: "1:00 AM",
  yipin: "2:00 AM",
};

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
          Latest activity past bedtime, rounded up to the nearest half hour.
        </p>
        <p className="bedtimes">
          Bedtimes:{" "}
          {PEOPLE.map((p, i) => (
            <span key={p}>
              {i > 0 && " · "}
              <strong>{p}</strong> {BEDTIME_LABELS[p]}
            </span>
          ))}
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
                  <td>{formatNight(row.night)}</td>
                  {PEOPLE.map((p) => {
                    const cell = row.cells[p];
                    if (cell.roundedMs !== null) {
                      return (
                        <td key={p} className="time overdue">
                          {formatSGT(cell.roundedMs)}
                        </td>
                      );
                    }
                    return (
                      <td key={p} className="time muted">
                        —
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
