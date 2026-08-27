import { AppShell } from "@/components/shell/app-shell";

export default function ExamsLayout({ children }: LayoutProps<"/exams">) {
  return <AppShell section="Exams">{children}</AppShell>;
}
