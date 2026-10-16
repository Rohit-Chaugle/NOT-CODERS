/** Top HUD navigation (no sidebar in the Living Campus shell). */

export type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Overview", end: true },
  { to: "/twin", label: "Twin" },
  { to: "/vision", label: "Vision" },
  { to: "/issues", label: "Issues" },
  { to: "/energy", label: "Energy" },
  { to: "/water", label: "Water" },
  { to: "/waste", label: "Waste" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Ops" },
];
