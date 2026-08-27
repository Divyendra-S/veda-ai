import { ReviewScreen } from "@/components/exam/review-screen";

export default async function ExamPage({ params }: PageProps<"/exams/[id]">) {
  const { id } = await params;
  return <ReviewScreen examId={id} />;
}
