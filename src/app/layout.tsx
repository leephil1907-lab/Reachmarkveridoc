import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Prooflayer — Every answer. Backed by evidence.", description: "Accuracy-first AI support for SaaS. Grounded answers, transparent citations, and safe escalation when documentation falls short." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }