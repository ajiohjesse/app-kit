"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, ArrowUpRight, X } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { docs, categories } from "@/lib/docs";
import { ThemeToggle } from "./theme-toggle";

const SidebarContext = createContext<{
  open: boolean;
  toggle: () => void;
  close: () => void;
}>({ open: false, toggle: () => {}, close: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SidebarContext.Provider
      value={{
        open,
        toggle: () => setOpen((current) => !current),
        close: () => setOpen(false),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

function useSidebar() {
  return useContext(SidebarContext);
}
export function Header() {
  const { open, toggle } = useSidebar();
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark">+</span>
        <span>app-kit</span>
      </Link>
      <div className="top-actions">
        <button
          className="search-trigger"
          onClick={() => window.dispatchEvent(new Event("open-search"))}
        >
          <Search size={14} /> Search <kbd>⌘ K</kbd>
        </button>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="github-link"
        >
          GitHub <ArrowUpRight size={13} />
        </a>
        <ThemeToggle />
      </div>
      <button
        className="mobile-menu-button icon-button"
        aria-label="Toggle navigation"
        aria-expanded={open}
        onClick={toggle}
      >
        <Menu size={16} />
      </button>
    </header>
  );
}
export function Sidebar() {
  const pathname = usePathname();
  const { open, close } = useSidebar();
  return (
    <>
      <button
        className={`sidebar-scrim ${open ? "is-visible" : ""}`}
        aria-label="Close navigation"
        onClick={close}
      />
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">Components</span>
          <button
            className="sidebar-close icon-button"
            aria-label="Close navigation"
            onClick={close}
          >
            <X size={15} />
          </button>
        </div>
        {categories.map((category) => (
          <section key={category} className="nav-group">
            <p className="nav-label">{category}</p>
            {docs
              .filter((doc) => doc.category === category)
              .map((doc) => (
                <Link
                  key={doc.slug}
                  href={`/docs/${doc.slug}`}
                  className={`nav-link ${pathname === `/docs/${doc.slug}` ? "active" : ""}`}
                  onClick={close}
                >
                  <span className="nav-number">
                    {String(doc.number).padStart(2, "0")}
                  </span>
                  {doc.shortTitle}
                </Link>
              ))}
          </section>
        ))}
      </aside>
    </>
  );
}
export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const openSearch = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("open-search", openSearch);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("open-search", openSearch);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  if (!open) return null;
  const results = docs.filter((doc) =>
    `${doc.title} ${doc.category}`.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Search documentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="search-panel">
        <div className="search-input-row">
          <Search size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search components..."
          />
          <button
            className="icon-button"
            onClick={() => setOpen(false)}
            aria-label="Close search"
          >
            <X size={15} />
          </button>
        </div>
        <div className="search-results">
          {results.map((doc) => (
            <Link
              href={`/docs/${doc.slug}`}
              key={doc.slug}
              onClick={() => setOpen(false)}
            >
              <span className="mono">
                {String(doc.number).padStart(2, "0")}
              </span>
              <span>{doc.title}</span>
              <small>{doc.category}</small>
            </Link>
          ))}
          {results.length === 0 && (
            <p className="search-empty">No components found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
