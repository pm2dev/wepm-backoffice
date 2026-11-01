import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Bills & subscriptions" };

export default function Page() {
  return <ComingSoon title="Bills & subscriptions" summary="Manual bills and subscriptions, recurring charges, estimates, and month-end verification by card or account." />;
}
