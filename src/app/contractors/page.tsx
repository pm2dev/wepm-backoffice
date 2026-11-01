import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Contractors" };

export default function Page() {
  return <ComingSoon title="Contractors" summary="Profiles, start dates, rate history, schedules, lifetime hours and earnings, payment history, and historical Harvest imports." />;
}
