import type { Metadata } from "next";
import { CustomerProfileRoute } from "@/components/customers/customers";

export const metadata: Metadata = { title: "Customer" };

export default function Page() {
  return <CustomerProfileRoute />;
}
