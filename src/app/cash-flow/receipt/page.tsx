import type { Metadata } from "next";
import { RecommendationRoute } from "@/components/cashflow/recommendation";

export const metadata: Metadata = { title: "Payment suggestions" };

export default function Page() {
  return <RecommendationRoute />;
}
