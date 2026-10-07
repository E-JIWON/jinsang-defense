import { Angry, Frown, Laugh, Meh, Smile } from "lucide-react";
import type { CSSProperties, Ref } from "react";
import { moodColor } from "../lib/format";

const iconFor = (anger: number) => (anger < 20 ? Laugh : anger < 40 ? Smile : anger < 60 ? Meh : anger < 80 ? Frown : Angry);

export function Face({ anger, small, ref }: { anger: number; small?: boolean; ref?: Ref<HTMLDivElement> }) {
  const Icon = iconFor(anger);
  return (
    <div ref={ref} className={small ? "face sm" : "face"} style={{ "--mood": moodColor(anger) } as CSSProperties}>
      <Icon aria-hidden />
    </div>
  );
}
