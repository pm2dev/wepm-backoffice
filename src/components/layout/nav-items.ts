import { Banknote, Briefcase, Building2, CalendarClock, Gauge, Receipt, Settings, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; ready: boolean };

/** `ready: false` destinations render the “Coming soon” page. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: Gauge, ready: false },
  { href: "/payroll", label: "Payroll", icon: Banknote, ready: true },
  { href: "/contractors", label: "Contractors", icon: Users, ready: true },
  { href: "/bills", label: "Bills & subscriptions", icon: Receipt, ready: true },
  { href: "/customers", label: "Customers", icon: Building2, ready: true },
  { href: "/projects", label: "Projects & billing", icon: Briefcase, ready: true },
  { href: "/cash-flow", label: "Cash flow", icon: CalendarClock, ready: false },
  { href: "/settings", label: "Settings", icon: Settings, ready: false },
];

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
