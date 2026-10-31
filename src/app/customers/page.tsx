import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return <ComingSoon title="Customers" summary="Manually maintained customer records and their projects." />;
}
