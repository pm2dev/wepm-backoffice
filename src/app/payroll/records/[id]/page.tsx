import type { Metadata } from "next";
import { RecordDetailRoute } from "@/components/payroll/record-detail";

export const metadata: Metadata = { title: "Payroll record" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <RecordDetailRoute params={params} />;
}
