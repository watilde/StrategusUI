import type { ReactNode } from "react";

export function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  nullable,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  nullable?: boolean;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      min={min}
      placeholder={nullable ? "none" : undefined}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(nullable ? null : 0);
        const n = Number.parseInt(raw, 10);
        if (!Number.isNaN(n)) onChange(n);
      }}
    />
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[] | { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
