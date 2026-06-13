import { useEffect, useState } from "react";
import { NavLink, Link, Outlet, useLocation } from "react-router-dom";
import { Menu, X, ArrowRight, FileSignature } from "lucide-react";

// Same-host link: under GH Pages the app lives at <base>/app, locally just /app.
// Avoids hardcoding a hosting provider so we can swap Netlify → Pages cleanly.
export const APP_URL = (() => {
  if (typeof window === "undefined") return "/app/";
  const path = window.location.pathname.replace(/\/$/, "");
  // strip "/index.html" etc but keep repo base
  const base = path.split("/").slice(0, -1).join("/") || "";
  return (base || "") + "/app/";
})();

export function Logo() {
  return (
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink">
      <FileSignature size={16} className="text-brass" />
    </span>
  );
}

const LINKS = [
  ["Features", "/features"],
  ["Pricing", "/pricing"],
  ["About", "/about"],
  ["Changelog", "/changelog"],
];

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 30);
    on();
    window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4">
      <nav
        className={
          "flex w-full max-w-6xl items-center justify-between rounded-full px-5 py-2.5 transition-all duration-500 " +
          (scrolled ? "glass shadow-card" : "bg-transparent")
        }
      >
        <Link to="/" className="flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-[15px] font-extrabold tracking-tightest text-ink">Letterhead Studio</span>
        </Link>
        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map(([l, h]) => (
            <NavLink
              key={l}
              to={h}
              className={({ isActive }) =>
                "text-sm font-medium transition " + (isActive ? "text-ink" : "text-ink/60 hover:text-ink")
              }
            >
              {l}
            </NavLink>
          ))}
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <a href={APP_URL} className="btn-ghost text-sm">Sign in</a>
          <a href={APP_URL} className="btn-primary text-sm">Start free <ArrowRight size={16} /></a>
        </div>
        <button className="md:hidden text-ink" onClick={() => setOpen(true)} aria-label="Menu"><Menu /></button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 grain-dark text-paper md:hidden">
          <div className="flex items-center justify-between px-6 pt-6">
            <span className="font-display font-bold">Letterhead Studio</span>
            <button onClick={() => setOpen(false)} aria-label="Close"><X /></button>
          </div>
          <div className="mt-16 flex flex-col items-center gap-7">
            {LINKS.map(([l, h]) => (
              <Link key={l} to={h} className="font-display text-3xl">{l}</Link>
            ))}
            <a href={APP_URL} className="btn-primary mt-4 bg-brass text-deep">Start free <ArrowRight size={16} /></a>
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-hairline bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5"><Logo /><span className="font-display text-[15px] font-extrabold text-ink">Letterhead Studio</span></div>
          <p className="mt-3 max-w-sm text-sm text-ink/60">Print-ready business documents on your own letterhead. Type or speak — AI writes; you sign. Built in Dubai for SMBs that move fast.</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-ink/45">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> All systems normal
          </div>
        </div>
        <FooterCol title="Product" links={[["Features","/features"],["Pricing","/pricing"],["Changelog","/changelog"],["Open the app", APP_URL]]} />
        <FooterCol title="Company" links={[["About","/about"],["Contact","/contact"]]} />
        <FooterCol title="Legal" links={[["Privacy","/privacy"],["Terms","/terms"]]} />
      </div>
      <div className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-2 px-5 py-5 text-xs text-ink/45 sm:flex-row">
          <span>© {new Date().getFullYear()} Letterhead Studio · Built by Faiz Mustafa</span>
          <span>Dubai, U.A.E ·
            <a href="https://wa.me/971502925963" target="_blank" rel="noopener noreferrer" className="ml-1 hover:text-ink">WhatsApp +971 50 292 5963</a>
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }) {
  return (
    <div>
      <div className="label mb-3 text-ink/50">{title}</div>
      <ul className="space-y-2 text-sm text-ink/65">
        {links.map(([l, h]) => (
          <li key={l}>
            {h.startsWith("http") ? (
              <a href={h} className="hover:text-ink">{l}</a>
            ) : (
              <Link to={h} className="hover:text-ink">{l}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Layout() {
  return (
    <div className="font-sans">
      <Nav />
      <main className="min-h-[60vh]">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
