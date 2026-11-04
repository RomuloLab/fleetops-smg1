import { schedulingStatus, SCHEDULING_STATUS_LABELS } from "@/lib/scheduling";
export default function SchedulingStatusBadge({ status }: { status: string }) {
  const value = schedulingStatus(status);
  return <span className={`status-badge ${value}`}><span/>{SCHEDULING_STATUS_LABELS[value]}</span>;
}
