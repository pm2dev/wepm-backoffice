import { AppShell } from "@/components/layout/app-shell";

/** Every app page: navigation, environment banner, data provider. */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
