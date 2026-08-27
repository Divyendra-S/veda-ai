import { Clipboard, FileText, LayoutGrid, PieChart } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { ClassroomIcon } from "@/components/brand/classroom-icon";

export type NavItem = {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Only Exams is a real destination. The rest are present but inert. */
  href?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: LayoutGrid },
  { label: "My Classroom", icon: ClassroomIcon },
  { label: "Assignments", icon: FileText },
  { label: "Exams", icon: Clipboard, href: "/exams" },
  { label: "My Library", icon: PieChart },
];
