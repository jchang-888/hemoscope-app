"use client";

// The one Daily / Blood toggle. Health Checks, Today's Results and Health History all use it, so the buttons, spacing and
// position are identical on every page. The spacing comes from the page's `space-y-4` stack, so the toggle sets no margin of its own.

export type CheckType = "daily" | "blood";

const OPTIONS: { id: CheckType; label: string }[] = [
  { id: "daily", label: "Daily Check" },
  { id: "blood", label: "Blood Check" },
];

export function CheckTypeToggle({ value, onChange, label }: { value: CheckType; onChange: (t: CheckType) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} data-check-toggle className="flex flex-wrap gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.id} type="button" role="tab" aria-selected={value === o.id}
          className={`btn ${value === o.id ? "btn-primary" : ""}`} onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
