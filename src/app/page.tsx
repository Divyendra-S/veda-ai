import { redirect } from "next/navigation";

/** The app has one entry point. Exams is the only section that opens. */
export default function RootPage() {
  redirect("/exams");
}
