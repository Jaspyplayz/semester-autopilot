// Small shared pieces, so the three steps look the same.

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  const look =
    variant === "primary"
      ? "bg-indigo-700 text-white hover:bg-indigo-800 disabled:bg-stone-300"
      : "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100 disabled:text-stone-400";
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${look} ${className}`}
      {...props}
    />
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-5 rounded-lg border border-stone-200 bg-white p-4 sm:p-5">
      {title && <h2 className="mb-3 font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

export const INPUT = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm";

export const COLUMNS = ["When", "Course", "What", "Worth", "Covers"] as const;
