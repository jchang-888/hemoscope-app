// Root layout: loads the three fonts and sets the page title.
// Fonts are variable fonts, so no "weight" option is needed (listing weights caused
// an intermittent next/font build error on Vercel).
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  fallback: ["system-ui", "sans-serif"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  fallback: ["system-ui", "sans-serif"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: "HemoScope | Astronaut Health Monitoring",
  description: "Health self-assessment demo for astronauts on long missions.",
};

// Runs before the first paint so the saved theme is applied without a flash. Light is the default: dark is used only when the saved choice is exactly "dark".
// The key must match THEME_KEY in app/ui.tsx.
const THEME_SCRIPT = `try{var t=localStorage.getItem("hemoscope-theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
