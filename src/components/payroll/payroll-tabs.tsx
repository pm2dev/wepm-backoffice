import { SectionTabs } from "@/components/ui/section-tabs";

export function PayrollTabs() {
  return (
    <SectionTabs
      label="Payroll"
      tabs={[
        { href: "/payroll", label: "What’s due" },
        { href: "/payroll/history", label: "Payment history" },
      ]}
    />
  );
}
