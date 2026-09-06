import markAsset from "@/assets/uniwork-mark.png.asset.json";
import wordmarkAsset from "@/assets/uniwork-wordmark.png.asset.json";
import { cn } from "@/lib/utils";

/** Biểu tượng "w" của UNIWORK (nền trong suốt). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={markAsset.url}
      alt="UNIWORK"
      className={cn("h-9 w-9 shrink-0 object-contain", className)}
      loading="eager"
      decoding="async"
    />
  );
}

/** Logo chữ đầy đủ "uniwork". */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <img
      src={wordmarkAsset.url}
      alt="UNIWORK"
      className={cn("h-8 w-auto object-contain dark:brightness-0 dark:invert", className)}
      loading="eager"
      decoding="async"
    />
  );
}
