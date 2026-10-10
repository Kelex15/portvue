import { cn } from "@/lib/utils";

// Two curves form the eye; the teal iris is the "insight" at the center. Kept simple so it reads at 16px.
export function LogoMark({ className, tile = false }: { className?: string; tile?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden="true">
      {tile && <rect width="32" height="32" rx="8" fill="#0b2d4a" />}
      <path d="M4 16.5C7.6 10.2 11.6 7.5 16 7.5s8.4 2.7 12 9" fill="none" stroke="#14b8a6" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M28 15.5c-3.6 6.3-7.6 9-12 9s-8.4-2.7-12-9" fill="none" stroke="#a7f3d0" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="4.6" fill="#14b8a6" />
      <circle cx="17.6" cy="14.4" r="1.4" fill="#071321" />
    </svg>
  );
}

export function Logo({ className, descriptor = false }: { className?: string; descriptor?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark tile className="size-9" />
      <span className="leading-none">
        <span className="block text-[19px] font-semibold tracking-tight">portvue</span>
        {descriptor && <span className="mt-0.5 block text-[10px] tracking-wide text-muted-foreground">Investment Intelligence</span>}
      </span>
    </span>
  );
}
