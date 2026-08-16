// Contextual Copilot entry — mở UNI Workspace Copilot với đúng ngữ cảnh gốc của trang.
// Mọi truy xuất dữ liệu đi qua AI Context Engine trong panel toàn cục (một kiến trúc duy nhất).
import { openUniCopilot, UniCopilotButton } from "@/components/ai/uni-copilot";
import type { AiContextEntityType } from "@/domain/ai-context/contracts";

export function AskUniPanel({
  rootEntity,
  workspaceId,
  title,
  label = "Hỏi UNI",
}: {
  rootEntity?: { type: AiContextEntityType; id: string };
  workspaceId?: string | null;
  /** Suggestions cũ được thay bằng gợi ý theo loại đối tượng trong Copilot. */
  suggestions?: string[];
  title?: string;
  label?: string;
}) {
  return (
    <UniCopilotButton
      root={rootEntity ? { ...rootEntity, title } : null}
      workspaceId={workspaceId ?? null}
      label={label}
    />
  );
}

export { openUniCopilot };
