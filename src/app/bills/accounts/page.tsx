import type { Metadata } from "next";
import { AccountsPage } from "@/components/bills/accounts";

export const metadata: Metadata = { title: "Cards & accounts" };

export default function Page() {
  return <AccountsPage />;
}
