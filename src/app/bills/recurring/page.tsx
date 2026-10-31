import type { Metadata } from "next";
import { RecurringPage } from "@/components/bills/recurring";

export const metadata: Metadata = { title: "Bills & subscriptions" };

export default function Page() {
  return <RecurringPage />;
}
