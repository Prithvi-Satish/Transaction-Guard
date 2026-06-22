"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Landing" },
  { href: "/input", label: "Input" },
  { href: "/agent-flow", label: "Agent Flow" },
  { href: "/report", label: "Report" }
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="site-nav-wrap">
      <nav className="site-nav shell">
        <Link href="/" className="brand">
          <span className="brand-dot" />
          New Horizon
        </Link>
        <div className="nav-links">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              (link.href === "/agent-flow" && (pathname.startsWith("/agents/") || pathname.startsWith("/agent-flow")));
            return (
              <Link key={link.href} href={link.href} className={active ? "nav-link active" : "nav-link"}>
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
