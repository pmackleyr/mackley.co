import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset Complete",
  description: "Site reset in progress.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: "#000000" }}>
        {children}
      </body>
    </html>
  );
}
