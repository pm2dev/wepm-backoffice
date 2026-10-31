import type { Metadata } from "next";
import { ContractorsListPage } from "@/components/contractors/contractors-list";

export const metadata: Metadata = { title: "Contractors" };

export default function Page() {
  return <ContractorsListPage />;
}
