import type { Metadata } from "next";
import { ImportHoursRoute } from "@/components/contractors/import-hours";

export const metadata: Metadata = { title: "Import historical hours" };

export default function Page() {
  return <ImportHoursRoute />;
}
