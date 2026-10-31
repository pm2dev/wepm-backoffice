import { SectionTabs } from "@/components/ui/section-tabs";
import { routes } from "@/lib/routes";

export function ProjectsTabs() {
  return (
    <SectionTabs
      label="Projects & billing"
      tabs={[
        { href: routes.billing, label: "Ready to invoice" },
        { href: routes.projectList, label: "All projects" },
        { href: routes.invoiced, label: "Invoiced" },
      ]}
    />
  );
}
