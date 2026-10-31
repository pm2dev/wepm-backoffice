import type { Metadata } from "next";
import { ImportHoursRoute } from "@/components/contractors/import-hours";

export const metadata: Metadata = { title: "Import historical hours" };

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ImportHoursRoute params={params} />;
}
