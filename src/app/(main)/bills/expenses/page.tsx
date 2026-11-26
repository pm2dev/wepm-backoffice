import type { Metadata } from "next";
import { ExpensesPage } from "@/components/expenses/expenses-page";

export const metadata: Metadata = { title: "One-off expenses" };

export default function Page() {
  return <ExpensesPage />;
}
