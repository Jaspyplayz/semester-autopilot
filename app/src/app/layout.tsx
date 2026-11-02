import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Semester Autopilot",
  description: "Turn your syllabuses into one confirmed list of every test and deadline, plus a calendar file.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
