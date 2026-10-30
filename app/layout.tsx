import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import NavPaineis from "./components/NavPaineis";
import FaixaDemo from "./components/FaixaDemo";

const geistSans = localFont({
  src: "./fonts/Geist-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-latin.woff2",
  weight: "100 900",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Painel First Mile (demo)",
  description:
    "Demonstracao com dados ficticios de um painel de operacao de First Mile: atribuicao, scheduling, monitoramento de coletas e reports",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <FaixaDemo />
        <NavPaineis />
        {children}
      </body>
    </html>
  );
}
