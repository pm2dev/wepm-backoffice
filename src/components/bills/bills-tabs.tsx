import { SectionTabs } from "@/components/ui/section-tabs";

export function BillsTabs() {
  return (
    <SectionTabs
      label="Bills & subscriptions"
      tabs={[
        { href: "/bills", label: "Monthly review" },
        { href: "/bills/upcoming", label: "Upcoming & spending" },
        { href: "/bills/recurring", label: "Bills & subscriptions" },
        { href: "/bills/accounts", label: "Cards & accounts" },
      ]}
    />
  );
}
