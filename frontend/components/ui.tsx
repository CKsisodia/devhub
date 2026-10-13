"use client";

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Loader2, X, type LucideIcon } from "lucide-react";
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { initials, PROJECT_STATUS_LABEL, PROJECT_STATUS_STYLE, STATUS_LABEL, STATUS_STYLE } from "@/lib/format";
import type { ProjectStatus, WorkStatus } from "@/lib/types";
import { EASE } from "./motion";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// ---------- Button ----------
type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "s" | "m" | "l";
  icon?: LucideIcon;
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "m", icon: Icon, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        "focus-ring inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 ease-out-soft active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        size === "s" && "h-8 px-3",
        size === "m" && "h-9 px-3.5",
        size === "l" && "h-11 px-5",
        variant === "primary" && "bg-ai text-white shadow-xs hover:shadow-ai-glow hover:brightness-110 active:brightness-95",
        variant === "secondary" && "border border-line/80 bg-surface/80 text-ink shadow-xs hover:border-line-strong hover:bg-surface active:bg-subtle",
        variant === "ghost" && "text-secondary hover:bg-subtle hover:text-ink",
        variant === "destructive" && "bg-[var(--danger-solid)] text-white hover:brightness-110",
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" strokeWidth={1.75} /> : null}
      {children}
    </button>
  );
});

export function IconButton({ icon: Icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn("focus-ring inline-flex size-8 items-center justify-center rounded-md text-secondary transition hover:bg-subtle hover:text-ink active:scale-95", className)} {...rest}>
      <Icon className="size-4" strokeWidth={1.75} />
    </button>
  );
}

// ---------- Form controls ----------
const control =
  "focus-ring w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink shadow-xs placeholder:text-muted transition focus-visible:outline-accent-500 disabled:bg-subtle disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={cn(control, "h-9", invalid && "border-red-600 bg-red-50", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(control, "min-h-24 py-2 leading-5", className)} {...rest} />;
});

export function Select({ className, invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cn(control, "h-9 cursor-pointer appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2371717A%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[right_8px_center] bg-no-repeat pr-8", invalid && "border-amber-500 bg-amber-50", className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, htmlFor, helper, error, children, className }: { label: string; htmlFor?: string; helper?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-secondary">
        {label}
      </label>
      {children}
      {error ? <p className="text-[13px] text-red-600">{error}</p> : helper ? <p className="text-[13px] text-muted">{helper}</p> : null}
    </div>
  );
}

// ---------- Display ----------
/** Frosted glass card (translucent white over the aurora background). */
export function Card({ className, children, onClick, as = "div", interactive }: { className?: string; children: ReactNode; onClick?: () => void; as?: "div" | "section"; interactive?: boolean }) {
  const Tag = as;
  return (
    <Tag onClick={onClick} className={cn("glass-card rounded-xl p-5", (onClick || interactive) && "lift cursor-pointer", className)}>
      {children}
    </Tag>
  );
}

export function Pill({ bg, text, dot, children, className }: { bg: string; text: string; dot?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium", className)} style={{ background: bg, color: text }}>
      {dot && <span className="size-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}

export const StatusPill = ({ status }: { status: WorkStatus }) => <Pill {...STATUS_STYLE[status]}>{STATUS_LABEL[status]}</Pill>;
export const ProjectStatusPill = ({ status }: { status: ProjectStatus }) => <Pill {...PROJECT_STATUS_STYLE[status]}>{PROJECT_STATUS_LABEL[status]}</Pill>;

export function Chip({ children, selected, onClick, onRemove, className }: { children: ReactNode; selected?: boolean; onClick?: () => void; onRemove?: () => void; className?: string }) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? selected : undefined}
      className={cn(
        "focus-ring inline-flex h-6 shrink-0 items-center gap-1 rounded-sm px-2 text-xs font-medium transition",
        selected ? "bg-accent-50 text-accent-600 ring-1 ring-accent-100" : "bg-subtle text-secondary",
        onClick && !selected && "hover:bg-zinc-200/70",
        className,
      )}
    >
      {children}
      {onRemove && (
        <span role="button" tabIndex={0} aria-label="Remove" onClick={(e) => (e.stopPropagation(), onRemove())} onKeyDown={(e) => e.key === "Enter" && onRemove()} className="-mr-0.5 rounded hover:text-ink">
          <X className="size-3" />
        </span>
      )}
    </Comp>
  );
}

const AVATAR_TONES = ["accent", "cyan", "success", "warning", "rose", "info", "orange"];
const AVATAR_TINTS = AVATAR_TONES.map((t) => `var(--tone-${t}-bg)`);
const AVATAR_TEXT = AVATAR_TONES.map((t) => `var(--tone-${t}-fg)`);
function hashIndex(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % AVATAR_TINTS.length;
}

export function Avatar({ name, size = 32, inactive, className }: { name: string; size?: 24 | 32 | 40; inactive?: boolean; className?: string }) {
  const i = hashIndex(name);
  return (
    <span
      title={name}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-2 ring-surface", inactive && "grayscale opacity-60", className)}
      style={{ width: size, height: size, fontSize: size === 24 ? 10 : size === 32 ? 12 : 14, background: AVATAR_TINTS[i], color: AVATAR_TEXT[i] }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarGroup({ users, max = 3 }: { users: { id: string; name: string; active?: boolean }[]; max?: number }) {
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((u) => (
        <Avatar key={u.id} name={u.name} size={24} inactive={u.active === false} />
      ))}
      {extra > 0 && <span className="inline-flex size-6 items-center justify-center rounded-full bg-subtle text-[10px] font-semibold text-secondary ring-2 ring-surface">+{extra}</span>}
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-subtle", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className="bg-ai h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, Math.max(0, value))}%` }} transition={{ duration: 0.8, ease: EASE }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="relative mb-5 inline-flex">
        <span aria-hidden className="bg-ai absolute inset-0 -z-10 scale-150 rounded-full opacity-20 blur-xl" />
        <span className="animate-float inline-flex size-14 items-center justify-center rounded-2xl border border-line/70 bg-surface/80 text-accent-600 shadow-ai-glow">
          <Icon className="size-6" strokeWidth={1.5} />
        </span>
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}

export const Skeleton = ({ className }: { className?: string }) => <div className={cn("skeleton h-4", className)} />;

export function PageHeader({ title, subtitle, actions, icon: Icon, tint }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: LucideIcon; tint?: { bg: string; fg: string } }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line/70 shadow-sm" style={{ background: tint?.bg ?? "var(--tone-accent-bg)", color: tint?.fg ?? "var(--tone-accent-fg)" }}>
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.015em]">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, id = "seg" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: LucideIcon; count?: number }[]; label: string; id?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg bg-zinc-100/80 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("focus-ring relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors", value === o.value ? "text-ink" : "text-secondary hover:text-ink")}
        >
          {value === o.value && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-md bg-surface shadow-xs" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative inline-flex items-center gap-1.5">
            {o.icon && <o.icon className="size-4" strokeWidth={1.75} />}
            {o.label}
            {o.count !== undefined && <span className="tabular text-xs text-muted">{o.count}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="mb-6 flex gap-6 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn("focus-ring relative -mb-px flex h-10 items-center gap-1.5 whitespace-nowrap text-sm font-medium transition-colors", value === t.value ? "text-ink" : "text-muted hover:text-ink")}
        >
          {t.label}
          {t.count !== undefined && <span className="tabular rounded-full bg-subtle px-1.5 text-xs text-secondary">{t.count}</span>}
          {value === t.value && <motion.span layoutId="tab-underline" className="bg-ai absolute inset-x-0 -bottom-px h-0.5 rounded-full" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
        </button>
      ))}
    </div>
  );
}

// ---------- Overlays ----------
function useEscape(onClose: () => void, open: boolean) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target only exists after mount
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEscape(onClose, open);
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            key="modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--scrim)] backdrop-blur-[2px] sm:items-center sm:p-6"
            onMouseDown={(e) => e.target === e.currentTarget && onClose()}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === "string" ? title : undefined}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: EASE }}
              className={cn("glass flex max-h-[92vh] w-full flex-col rounded-t-2xl shadow-lg sm:rounded-2xl", wide ? "sm:max-w-3xl" : "sm:max-w-[560px]")}
            >
              <div className="flex items-center justify-between px-6 pb-2 pt-5">
                <h2 className="text-base font-semibold">{title}</h2>
                <IconButton icon={X} label="Close" onClick={onClose} />
              </div>
              <div className="overflow-y-auto px-6 py-3">{children}</div>
              {footer && <div className="flex justify-end gap-2 px-6 pb-5 pt-3">{footer}</div>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

export function ConfirmModal({ open, title, text, confirmLabel = "Delete", onConfirm, onClose, loading }: { open: boolean; title: string; text: ReactNode; confirmLabel?: string; onConfirm: () => void; onClose: () => void; loading?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-secondary">{text}</p>
    </Modal>
  );
}

/** Small "⋯" dropdown menu (admin actions). */
export function Menu({ trigger, items, align = "right" }: { trigger: (props: { onClick: () => void; "aria-expanded": boolean }) => ReactNode; items: { label: string; icon?: LucideIcon; onClick: () => void; danger?: boolean }[]; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), "aria-expanded": open })}
      <AnimatePresence>
      {open && (
        <motion.div
          role="menu"
          initial={{ opacity: 0, y: -4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.97 }}
          transition={{ duration: 0.14, ease: EASE }}
          className={cn("glass absolute z-40 mt-1 min-w-44 origin-top-right rounded-xl p-1 shadow-md", align === "right" ? "right-0" : "left-0")}
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={cn("focus-ring flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-subtle", it.danger ? "text-red-600" : "text-ink")}
            >
              {it.icon && <it.icon className="size-4" strokeWidth={1.75} />}
              {it.label}
            </button>
          ))}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

export function Banner({ tone = "info", children, icon: Icon }: { tone?: "info" | "warning" | "error" | "success"; children: ReactNode; icon?: LucideIcon }) {
  const tones = {
    info: "bg-blue-50 text-blue-900 border-blue-100",
    warning: "bg-amber-50 text-amber-900 border-amber-100",
    error: "bg-red-50 text-red-900 border-red-100",
    success: "bg-green-50 text-green-900 border-green-100",
  };
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm", tones[tone])}>
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Comma/enter separated tag editor (admin forms). */
export function TagInput({ value, onChange, placeholder = "Add tag and press Enter", id }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; id?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim().replace(/,$/, "");
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div className={cn(control, "flex min-h-9 flex-wrap items-center gap-1.5 py-1.5")}>
      {value.map((t) => (
        <Chip key={t} onRemove={() => onChange(value.filter((x) => x !== t))}>
          {t}
        </Chip>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="min-w-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
      />
    </div>
  );
}
