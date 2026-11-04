import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Descubridor de productos digitales",
  description: "Descubrí productos digitales anunciados en Meta a partir de evidencia comercial observable.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
