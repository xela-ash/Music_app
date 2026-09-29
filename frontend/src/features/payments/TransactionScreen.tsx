import * as demo from "../../demo/store";
import { formatDateTime, formatMoney, titleCase } from "../../lib/format";
import { useNav } from "../../nav/context";
import { Card, KeyValue, PageHeader } from "../../ui/display";
import { Async } from "../../ui/feedback";
import { useAsync } from "../../ui/hooks";

// PAY08
export function TransactionScreen({ transactionId }: { transactionId: string }) {
  const nav = useNav();
  const txn = useAsync(() => demo.getTransaction(transactionId), `txn-${transactionId}`);
  return (
    <div>
      <PageHeader onBack={() => nav.back({ name: "earnings" })} eyebrow="Transaction" title="Transaction detail" />
      <Async state={txn.state} onRetry={txn.reload}>
        {(t) => (
          <Card>
            <KeyValue
              rows={[
                ["Project", t.project_title],
                ["Milestone", t.milestone_no === null ? "Whole project" : `${t.milestone_no}. ${t.milestone_title}`],
                ["Type", titleCase(t.type)],
                ["Amount", formatMoney(t.amount, t.currency)],
                ["Currency", t.currency],
                ["Status", titleCase(t.status)],
                ["Date", formatDateTime(t.at)],
                ["Reference", t.reference],
              ]}
            />
            <button type="button" className="btn btn-secondary" onClick={() => nav.go({ name: "project", projectId: t.project_id, tab: "overview" })}>
              Open project
            </button>
          </Card>
        )}
      </Async>
    </div>
  );
}
