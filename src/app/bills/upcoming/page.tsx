import type { Metadata } from "next";
import { UpcomingPage } from "@/components/bills/upcoming";

export const metadata: Metadata = { title: "Upcoming bills" };

export default function Page() {
  return <UpcomingPage />;
}
