import { Badge } from "@/components/ui/badge";
import type { SampleHotel, SampleUser } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  user?: SampleUser;
  hotel?: SampleHotel;
}

interface ContinuousProps {
  label: string;
  value: number;
  max: number;
  format?: (v: number) => string;
}

function Continuous({ label, value, max, format }: ContinuousProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CategoricalRow({
  label,
  badges,
  className,
}: {
  label: string;
  badges: { text: string; muted?: boolean; warning?: boolean }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 text-[11px]",
        className,
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <div className="flex flex-wrap justify-end gap-1">
        {badges.map((b) => (
          <Badge
            key={b.text}
            variant={b.warning ? "warning" : b.muted ? "outline" : "secondary"}
          >
            {b.text}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function FeatureDisplay({ user, hotel }: Props) {
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <header className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          User
        </header>
        {user ? (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Continuous
              label="age"
              value={user.age}
              max={75}
              format={(v) => v.toString()}
            />
            <Continuous label="preference_luxury" value={user.preference_luxury} max={1} />
            <Continuous
              label="preference_proximity"
              value={user.preference_proximity}
              max={1}
            />
            <Continuous
              label="historical_bookings"
              value={user.historical_bookings_count}
              max={50}
              format={(v) => v.toString()}
            />
            <CategoricalRow
              label="country"
              badges={[{ text: user.country }]}
            />
            <CategoricalRow
              label="business traveler"
              badges={[
                user.is_business_traveler
                  ? { text: "yes" }
                  : { text: "no", muted: true },
              ]}
            />
            <CategoricalRow
              label="lookup status"
              badges={[
                user.precomputed_in_lookup
                  ? { text: "precomputed" }
                  : { text: "not precomputed", warning: true },
              ]}
            />
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-[11px] text-muted-foreground">
            Pick a user.
          </div>
        )}
      </section>

      <section className="space-y-2">
        <header className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Hotel
        </header>
        {hotel ? (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Continuous
              label="rating"
              value={hotel.rating}
              max={5}
              format={(v) => `${v.toFixed(1)} ★`}
            />
            <Continuous
              label="price_per_night"
              value={hotel.price_per_night}
              max={500}
              format={(v) => `$${v.toFixed(0)}`}
            />
            <Continuous
              label="distance_to_center_km"
              value={hotel.distance_to_center_km}
              max={25}
              format={(v) => `${v.toFixed(1)} km`}
            />
            <CategoricalRow label="city" badges={[{ text: hotel.city }]} />
            <CategoricalRow
              label="amenities"
              badges={[
                ...(hotel.has_pool ? [{ text: "pool" }] : []),
                ...(hotel.has_spa ? [{ text: "spa" }] : []),
                ...(hotel.is_business_friendly ? [{ text: "biz" }] : []),
                ...(hotel.is_family_friendly ? [{ text: "family" }] : []),
              ].length
                ? [
                    ...(hotel.has_pool ? [{ text: "pool" }] : []),
                    ...(hotel.has_spa ? [{ text: "spa" }] : []),
                    ...(hotel.is_business_friendly ? [{ text: "biz" }] : []),
                    ...(hotel.is_family_friendly ? [{ text: "family" }] : []),
                  ]
                : [{ text: "none", muted: true }]}
            />
          </div>
        ) : (
          <div className="rounded-md border border-dashed p-3 text-[11px] text-muted-foreground">
            Pick a hotel.
          </div>
        )}
      </section>
    </div>
  );
}
