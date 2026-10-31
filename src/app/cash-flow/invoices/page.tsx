import type { Metadata } from "next";
import { InvoicesPage } from "@/components/cashflow/invoices";

export const metadata: Metadata = { title: "Invoices" };

export default function Page() {
  return <InvoicesPage />;
}
