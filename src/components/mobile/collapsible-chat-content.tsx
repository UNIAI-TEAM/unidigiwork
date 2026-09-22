import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const LONG_CONTENT_LENGTH = 520;
const LONG_CONTENT_LINES = 10;

export function CollapsibleChatContent({
  content,
  children,
  className,
}: {
  content: string;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const isLong =
    content.length > LONG_CONTENT_LENGTH || content.split(/\r?\n/).length > LONG_CONTENT_LINES;

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className={cn(
          "relative min-w-0 overflow-hidden",
          isLong && !expanded && "max-h-72",
        )}
      >
        {children}
        {isLong && !expanded ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent"
          />
        ) : null}
      </div>
      {isLong ? (
        <Button
          type="button"
          variant="ghost"
          className="mt-1 min-h-11 px-2 text-xs text-muted-foreground"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
          {t(expanded ? "m.ai.collapse" : "m.ai.expand")}
        </Button>
      ) : null}
    </div>
  );
}