import type { Metadata } from "next";
import { PaymentHistoryPage } from "@/components/payroll/payment-history";

export const metadata: Metadata = { title: "Payment history" };

export default function Page() {
  return <PaymentHistoryPage />;
}
