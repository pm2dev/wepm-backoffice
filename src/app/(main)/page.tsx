import type { Metadata } from "next";
import { OverviewPage } from "@/components/financials/rollups";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <OverviewPage />;
}
