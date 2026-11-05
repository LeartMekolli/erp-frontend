import { cn } from "@/lib/utils";

/** One of a ship dialog's ways to ship: a radio shown as a bordered choice, 44 px tall. */
export function ShipChoice<T extends string>({
  name,
  value,
  label,
  choice,
  onChoose,
}: {
  name: string;
  value: T;
  label: string;
  choice: T;
  onChoose: (choice: T) => void;
}) {
  const checked = choice === value;
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 text-sm font-medium has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-violet",
        checked ? "border-ink bg-ink/4 text-ink" : "border-line text-ink-2",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChoose(value)}
        className="size-4 accent-ink"
      />
      {label}
    </label>
  );
}
