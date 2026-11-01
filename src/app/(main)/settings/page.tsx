import type { Metadata } from "next";
import { IntegrationsPage } from "@/components/settings/integrations";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <IntegrationsPage />;
}
