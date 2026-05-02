import { AlertTriangle, Dice5, Snowflake } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { SampleHotel, SampleUser } from "@/lib/types";

interface Props {
  users: SampleUser[];
  hotels: SampleHotel[];
  userId: number | null;
  hotelId: number | null;
  onUserChange: (userId: number) => void;
  onHotelChange: (hotelId: number) => void;
  onRandomize: () => void;
  onForceMiss: () => void;
}

export function InputSelector({
  users,
  hotels,
  userId,
  hotelId,
  onUserChange,
  onHotelChange,
  onRandomize,
  onForceMiss,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">User</label>
        <Select
          value={userId ?? ""}
          onChange={(e) => onUserChange(Number(e.target.value))}
        >
          {users.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {`#${u.user_id} — ${u.country}, age ${u.age}`}
              {u.precomputed_in_lookup ? "" : "  (not precomputed)"}
            </option>
          ))}
        </Select>
        {userId !== null &&
          users.find((u) => u.user_id === userId)?.precomputed_in_lookup === false && (
            <div className="flex items-center gap-1.5 text-[11px] text-warning dark:text-warning">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              This user is not in the lookup table — Lookup will miss.
            </div>
          )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Hotel</label>
        <Select
          value={hotelId ?? ""}
          onChange={(e) => onHotelChange(Number(e.target.value))}
        >
          {hotels.map((h) => (
            <option key={h.hotel_id} value={h.hotel_id}>
              {`#${h.hotel_id} — ${h.city}, ${h.rating.toFixed(1)}★, $${Math.round(h.price_per_night)}`}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onRandomize}>
          <Dice5 className="h-4 w-4" />
          Random input
        </Button>
        <Button variant="outline" size="sm" onClick={onForceMiss}>
          <Snowflake className="h-4 w-4" />
          Force lookup miss
        </Button>
      </div>
    </div>
  );
}
