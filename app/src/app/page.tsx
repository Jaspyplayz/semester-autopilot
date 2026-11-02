import AutopilotApp from "@/components/AutopilotApp";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Semester Autopilot</h1>
        <p className="mt-1 text-stone-600">
          Turn your syllabuses into one checked list of every test and deadline, plus a calendar file.
        </p>
      </header>
      <AutopilotApp />
      <footer className="mt-10 border-t border-stone-200 pt-4 text-sm text-stone-500">
        Your syllabuses and deadlines stay in this browser. PDFs are read on the server to get their text and are not
        kept. This app never asks for your course site password and doesn&apos;t log in to your course site.
      </footer>
    </main>
  );
}
