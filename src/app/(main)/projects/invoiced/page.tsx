import type { Metadata } from "next";
import { InvoicedPage } from "@/components/projects/invoiced";

export const metadata: Metadata = { title: "Invoiced" };

export default function Page() {
  return <InvoicedPage />;
}
