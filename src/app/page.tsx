export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Veda AI</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Scaffold ready. Visit{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 dark:bg-neutral-800">
            /api/health
          </code>{" "}
          to verify Supabase and Gemini connectivity.
        </p>
      </div>
    </main>
  );
}
