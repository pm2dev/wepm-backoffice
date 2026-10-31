import type { Metadata } from "next";
import { ContractorProfileRoute } from "@/components/contractors/contractor-profile";

export const metadata: Metadata = { title: "Contractor" };

export default function Page() {
  return <ContractorProfileRoute />;
}
