import type { Metadata } from "next";
import { CustomersPage } from "@/components/customers/customers";

export const metadata: Metadata = { title: "Customers" };

export default function Page() {
  return <CustomersPage />;
}
