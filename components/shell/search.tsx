"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchItem = { label: string; sub: string; href: string };

export function Search({ items }: { items: SearchItem[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return items.filter((i) => `${i.label} ${i.sub}`.toLowerCase().includes(term)).slice(0, 8);
  }, [q, items]);

  const go = (item: SearchItem) => {
    setQ("");
    setOpen(false);
    inputRef.current?.blur();
    router.push(item.href);
  };

  return (
    <div className="relative w-full max-w-sm">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && results[active]) go(results[active]);
          else if (e.key === "Escape") inputRef.current?.blur();
        }}
        placeholder="Search holdings and companies"
        aria-label="Search holdings and companies"
        className="h-9 w-full rounded-lg border bg-card pr-3 pl-9 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/60"
      />
      {open && q.trim() && (
        <div className="absolute inset-x-0 top-11 z-30 overflow-hidden rounded-lg border bg-popover shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-[13px] text-muted-foreground">No holdings or companies match “{q}”.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.href + r.label}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(r)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px]", i === active && "bg-accent")}
              >
                <span className="font-medium">{r.label}</span>
                <span className="truncate text-xs text-muted-foreground">{r.sub}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
