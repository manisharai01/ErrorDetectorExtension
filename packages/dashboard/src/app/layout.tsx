import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Invisible Errors — Dashboard',
  description: 'Org-wide static-analysis findings, quality scores, and governance.'
};

const NAV: [string, string][] = [
  ['/', 'Overview'],
  ['/repos', 'Repos'],
  ['/rules', 'Rules'],
  ['/teams', 'Teams'],
  ['/policies', 'Policies'],
  ['/settings', 'Settings']
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <span className="brand">🔍 Invisible Errors</span>
          <nav>
            {NAV.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
