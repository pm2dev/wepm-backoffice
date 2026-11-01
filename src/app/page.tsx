import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <ComingSoon title="Overview" summary="The overview will be designed once its contents are defined. Start with Payroll to see what you owe contractors." />;
}
