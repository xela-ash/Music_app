import * as demo from "../../demo/store";
import { formatDateTime, formatMoney, titleCase } from "../../lib/format";
import { useNav } from "../../nav/context";
import { Card, PageHeader, Stat } from "../../ui/display";
import { Async, EmptyState, PreviewNotice } from "../../ui/feedback";
import { useAsync } from "../../ui/hooks";

// PAY07 — figures come from Escrow/Payments, never computed from screens.
export function EarningsScreen() {
  const nav = useNav();
  const earnings = useAsync(() => demo.getEarnings(), "earnings");
  const txns = useAsync(() => demo.listTransactions(), "transactions");
  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "profile" })} eyebrow="Payments" title="Earnings & transactions" />
      <PreviewNotice>Earnings and transactions run on preview data.</PreviewNotice>
      <Async state={earnings.state} onRetry={earnings.reload} loadingLabel="Loading earnings…">
        {(e) => (
          <>
            <div className="stat-row">
              <Stat label="Total earned" value={formatMoney(e.total_earned)} />
              <Stat label="Pending / held" value={formatMoney(e.pending)} />
              <Stat label="Released" value={formatMoney(e.released)} />
              <Stat label="Paid out" value={formatMoney(e.paid_out)} />
            </div>
            {e.rows.length === 0 ? (
              <EmptyState title="No earnings yet.">Funds appear here once a buyer funds one of your projects.</EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Project</th>
                      <th scope="col">Milestone</th>
                      <th scope="col">Amount</th>
                      <th scope="col">Release</th>
                      <th scope="col">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.rows.map((r) => (
                      <tr key={`${r.project_id}-${r.milestone_no}`}>
                        <td>{r.project_title}</td>
                        <td>
                          {r.milestone_no}. {r.milestone_title}
                        </td>
                        <td>{formatMoney(r.amount)}</td>
                        <td>{titleCase(r.release_status)}</td>
                        <td>{titleCase(r.payout_status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Async>
      <Card title="All transactions">
        <Async state={txns.state} onRetry={txns.reload}>
          {(list) =>
            list.length === 0 ? (
              <p className="section-subcopy">No transactions yet.</p>
            ) : (
              <ul className="plain-list">
                {list.map((t) => (
                  <li key={t.id} className="plain-list-item">
                    <button type="button" className="link-button" onClick={() => nav.go({ name: "transaction", transactionId: t.id })}>
                      {titleCase(t.type)} · {t.project_title}
                    </button>
                    <span>{formatMoney(t.amount, t.currency)}</span>
                    <span className="muted">{formatDateTime(t.at)}</span>
                  </li>
                ))}
              </ul>
            )
          }
        </Async>
      </Card>
    </div>
  );
}
