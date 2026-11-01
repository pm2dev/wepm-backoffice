import type { Metadata } from "next";
import { WhatsDuePage } from "@/components/payroll/whats-due";

export const metadata: Metadata = { title: "Payroll" };

export default function Page() {
  return <WhatsDuePage />;
}
