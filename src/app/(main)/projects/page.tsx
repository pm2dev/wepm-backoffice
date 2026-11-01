import type { Metadata } from "next";
import { ReadyToInvoicePage } from "@/components/projects/ready-to-invoice";

export const metadata: Metadata = { title: "Projects & billing" };

export default function Page() {
  return <ReadyToInvoicePage />;
}
