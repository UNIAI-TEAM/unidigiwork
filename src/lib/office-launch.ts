// GO-2C — khởi chạy UniWork Office từ PWA.
// Token khởi chạy chỉ nằm trong bộ nhớ của lần gọi này: không lưu localStorage/sessionStorage,
// không ghi log, không gửi analytics.
import { supabase } from "@/integrations/supabase/client";

export type OfficeLaunchState =
  | "READY"
  | "OPENING"
  | "OFFICE_NOT_INSTALLED"
  | "SESSION_FAILED"
  | "UNSUPPORTED_FORMAT"
  | "PERMISSION_DENIED";

function stateFor(status: number, code: string): OfficeLaunchState {
  if (code === "UNSUPPORTED_FORMAT" || status === 415) return "UNSUPPORTED_FORMAT";
  if (code === "PERMISSION_DENIED" || status === 403 || status === 401) return "PERMISSION_DENIED";
  return "SESSION_FAILED";
}

export async function openInUniworkOffice(documentId: string): Promise<OfficeLaunchState> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return "PERMISSION_DENIED";

  let launchUrl: string;
  try {
    const res = await fetch("/api/office/sessions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ documentId }),
    });
    const body = (await res.json().catch(() => ({}))) as { launchUrl?: string; error?: string };
    if (!res.ok || !body.launchUrl) return stateFor(res.status, body.error ?? "");
    launchUrl = body.launchUrl;
  } catch {
    return "SESSION_FAILED";
  }

  // Nếu trình duyệt không có ứng dụng đăng ký uniwork://, cửa sổ vẫn ở lại.
  let launched = false;
  const onBlur = () => {
    launched = true;
  };
  window.addEventListener("blur", onBlur, { once: true });
  window.location.href = launchUrl;
  launchUrl = "";

  await new Promise((r) => setTimeout(r, 1500));
  window.removeEventListener("blur", onBlur);
  return launched || document.visibilityState === "hidden" ? "OPENING" : "OFFICE_NOT_INSTALLED";
}
