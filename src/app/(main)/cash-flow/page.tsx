import type { Metadata } from "next";
import { ReceiptsPage } from "@/components/cashflow/receipts";

export const metadata: Metadata = { title: "Cash flow" };

export default function Page() {
  return <ReceiptsPage />;
}
