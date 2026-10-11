import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { ToastProvider } from "@/context/ToastContext";

export const metadata: Metadata = {
  title: "Espada Workspace",
  description: "Внутренний инструмент команды Espada",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" data-theme="light" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body>
        <AppProvider><ToastProvider>{children}</ToastProvider></AppProvider>
      </body>
    </html>
  );
}
