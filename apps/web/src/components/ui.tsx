"use client";

import { Children, Fragment, forwardRef, isValidElement, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Loader2 } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ---------- Buttons ----------
type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover border border-accent",
  secondary: "bg-surface text-ink border border-line hover:border-ink/30",
  ghost: "text-ink hover:bg-sunk border border-transparent",
  danger: "bg-surface text-bad border border-line hover:border-bad hover:bg-bad-soft",
};
const base =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 h-10 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; size?: "sm" | "md" }
>(function Button({ variant = "primary", loading, size = "md", className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} className={cx(base, variants[variant], size === "sm" && "h-8 px-2.5 text-[13px]", className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function ButtonLink({ href, variant = "primary", className, children, size = "md" }: { href: string; variant?: Variant; className?: string; children: React.ReactNode; size?: "sm" | "md" }) {
  return (
    <Link href={href} className={cx(base, variants[variant], size === "sm" && "h-8 px-2.5 text-[13px]", className)}>
      {children}
    </Link>
  );
}

// ---------- Form fields ----------
const inputCls =
  "w-full h-10 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-sunk";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputCls, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputCls, "h-auto min-h-20 py-2", className)} {...rest} />;
});

interface SelectOption {
  value: string;
  label: React.ReactNode;
  text: string; // for type-ahead
  disabled?: boolean;
  style?: React.CSSProperties;
}

function optionsFrom(children: React.ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as React.ReactElement<any>;
    if (el.type === Fragment) return void out.push(...optionsFrom(el.props.children));
    if (el.type !== "option") return;
    const label = el.props.children;
    out.push({
      value: String(el.props.value ?? (typeof label === "string" ? label : "")),
      label,
      text: Children.toArray(label).join("").toLowerCase(),
      disabled: el.props.disabled,
      style: el.props.style,
    });
  });
  return out;
}

/**
 * Styled dropdown with the same API as a native <select> (value, onChange(e.target.value),
 * <option> children), so every form keeps working. Keyboard: arrows, Home/End, Enter,
 * Escape and type-ahead. Opens upwards when there's no room below.
 */
export function Select({
  className, children, value, onChange, id, disabled, style, trigger, ...rest
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> & {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (e: any) => void;
  trigger?: React.ReactNode; // custom closed-state content (e.g. the business switcher card)
}) {
  const options = optionsFrom(children);
  const current = String(value ?? "");
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === current));
  const selected = options[selectedIndex];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex);
  const [up, setUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const autoId = useId();
  const listId = `${id ?? autoId}-list`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function show() {
    if (disabled) return;
    const r = root.current?.getBoundingClientRect();
    setUp(!!r && window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom);
    setActive(selectedIndex);
    setOpen(true);
  }
  function choose(i: number) {
    const o = options[i];
    if (!o || o.disabled) return;
    setOpen(false);
    if (o.value !== current) onChange?.({ target: { value: o.value } });
  }
  function step(from: number, by: number) {
    let i = from;
    for (let n = 0; n < options.length; n++) {
      i = (i + by + options.length) % options.length;
      if (!options[i].disabled) return i;
    }
    return from;
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") return setOpen(false);
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => step(a, 1)));
    else if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => step(a, -1)));
    else if (e.key === "Home") (e.preventDefault(), setActive(step(-1, 1)));
    else if (e.key === "End") (e.preventDefault(), setActive(step(options.length, -1)));
    else if (e.key === "Enter" || e.key === " ") (e.preventDefault(), choose(active));
    else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const i = options.findIndex((o) => !o.disabled && o.text.startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <div ref={root} className={trigger ? "contents" : cx("relative", className?.includes("w-auto") ? "inline-block w-auto" : "w-full")}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-label={rest["aria-label"]}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={
          trigger
            ? "absolute inset-0 rounded-lg"
            : cx(inputCls, "group flex items-center justify-between gap-2 pr-2.5 text-left transition-colors hover:border-ink/30", open && "border-accent ring-2 ring-accent/20", className)
        }
        style={trigger ? undefined : style}
      >
        {!trigger && (
          <>
            <span className={cx("min-w-0 truncate", current === "" && "text-faint")} style={selected?.style}>{selected?.label ?? "Choose…"}</span>
            <ChevronDown className={cx("size-4 shrink-0 text-muted transition-transform duration-150", open && "rotate-180 text-accent")} aria-hidden />
          </>
        )}
      </button>
      {trigger}
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-labelledby={id}
          className={cx(
            "absolute left-0 z-50 max-h-72 min-w-full overflow-auto rounded-lg border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgba(20,32,27,0.25)] [scrollbar-width:thin]",
            up ? "bottom-full mb-1.5" : "top-full mt-1.5",
            !!trigger && "w-full",
          )}
        >
          {options.map((o, i) => {
            const isSel = o.value === current;
            return (
              <li
                key={o.value + i}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSel}
                aria-disabled={o.disabled || undefined}
                onMouseEnter={() => !o.disabled && setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className={cx(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm whitespace-nowrap",
                  i === active && !o.disabled && "bg-accent-soft text-accent",
                  isSel && "font-medium",
                  o.disabled && "cursor-not-allowed opacity-40",
                )}
              >
                <span className="min-w-0 flex-1 truncate" style={o.style}>{o.label}</span>
                <Check className={cx("size-4 shrink-0 text-accent", !isSel && "invisible")} aria-hidden />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children, className }: { label: string; htmlFor?: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? <p className="text-[13px] text-bad">{error}</p> : hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx("relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", checked ? "bg-accent" : "bg-line")}
    >
      <span className={cx("inline-block size-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
      {message}
    </p>
  );
}

// ---------- Layout bits ----------
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cx("rounded-lg border border-line bg-surface", className)}>{children}</section>;
}

export function CardHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, action, back }: { title: string; description?: React.ReactNode; action?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-block text-[13px] text-muted hover:text-ink">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </header>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-muted", className)} aria-label="Loading" />;
}

export function LoadingBlock() {
  return (
    <div className="grid min-h-40 place-items-center">
      <Spinner />
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-3 px-6 py-14 text-center">
      {icon && <div className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

// ---------- Status ----------
const statusStyles: Record<string, { cls: string; label: string }> = {
  active: { cls: "bg-good-soft text-good", label: "Active" },
  inactive: { cls: "bg-sunk text-muted", label: "Inactive" },
  expired: { cls: "bg-warn-soft text-warn", label: "Expired" },
  suspended: { cls: "bg-bad-soft text-bad", label: "Suspended" },
  published: { cls: "bg-good-soft text-good", label: "Published" },
  draft: { cls: "bg-sunk text-muted", label: "Draft" },
};

export function StatusPill({ status }: { status: string }) {
  const s = statusStyles[status] ?? { cls: "bg-sunk text-muted", label: status };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", s.cls)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {s.label}
    </span>
  );
}
