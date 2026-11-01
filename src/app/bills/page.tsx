import type { Metadata } from "next";
import { MonthlyReviewPage } from "@/components/bills/monthly-review";

export const metadata: Metadata = { title: "Bills & subscriptions" };

export default function Page() {
  return <MonthlyReviewPage />;
}
