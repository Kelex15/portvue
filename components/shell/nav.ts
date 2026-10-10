import { Activity, Briefcase, House, Layers, Lightbulb, type LucideIcon } from "lucide-react";

export const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/exposure", label: "Exposure", icon: Layers },
  { href: "/intelligence", label: "Intelligence", icon: Lightbulb },
  { href: "/events", label: "Events", icon: Activity },
];

export const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
