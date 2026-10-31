import { SectionTabs } from "@/components/ui/section-tabs";
import { routes } from "@/lib/routes";

export function CashFlowTabs() {
  return (
    <SectionTabs
      label="Cash flow"
      tabs={[
        { href: routes.cashFlow, label: "Payments received" },
        { href: routes.invoices, label: "Invoices" },
      ]}
    />
  );
}
