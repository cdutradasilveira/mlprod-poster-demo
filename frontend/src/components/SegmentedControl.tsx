import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  hint?: string; // tooltip / aria-label
}

interface Props<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: SegmentOption<T>[];
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  disabled = false,
}: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-flex h-9 items-center rounded-lg border border-input bg-muted/50 p-0.5",
        disabled && "opacity-50",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const isDisabled = disabled || opt.disabled;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={isDisabled}
            title={opt.hint}
            onClick={() => !isDisabled && onChange(opt.value)}
            className={cn(
              "h-full rounded-md px-3 text-xs font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              isDisabled && !active && "text-muted-foreground/40",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
