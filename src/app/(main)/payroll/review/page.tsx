import type { Metadata } from "next";
import { DraftReviewRoute } from "@/components/payroll/draft-review";

export const metadata: Metadata = { title: "Review payroll" };

export default function Page() {
  return <DraftReviewRoute />;
}
