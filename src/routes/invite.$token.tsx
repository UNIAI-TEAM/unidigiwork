import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAcceptInvitation } from "@/features/tenants/hooks";
import { Loader2, Mail, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Chấp nhận lời mời — UNIWORK" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InviteAcceptPage,
});

function InviteAcceptPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [autoStarted, setAutoStarted] = useState(false);
  const accept = useAcceptInvitation();
  const idempotencyKey = useMemo(() => `invite-${token.slice(0, 12)}`, [token]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  const onAccept = async () => {
    setAutoStarted(true);
    try {
      await accept.mutateAsync({ token, idempotencyKey });
      toast.success("Đã tham gia tổ chức");
      // Force server to pick this tenant if it becomes the only membership.
      window.location.assign("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Không thể chấp nhận lời mời";
      const friendly =
        msg === "TENANT_INVITATION_EXPIRED"
          ? "Lời mời đã hết hạn."
          : msg === "TENANT_INVITATION_REVOKED"
            ? "Lời mời đã bị thu hồi."
            : msg === "TENANT_INVITATION_ALREADY_ACCEPTED"
              ? "Lời mời đã được sử dụng."
              : msg === "TENANT_INVITATION_NOT_FOUND"
                ? "Lời mời không hợp lệ."
                : msg === "AUTHENTICATION_REQUIRED"
                  ? "Bạn cần đăng nhập trước."
                  : msg === "TENANT_INVITATION_EMAIL_MISMATCH"
                    ? "Email đăng nhập không khớp với email được mời. Vui lòng đăng nhập bằng đúng email đã nhận lời mời."
                    : msg;
      toast.error(friendly);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold">Lời mời tham gia</div>
            <div className="text-xs text-muted-foreground">
              Bạn được mời tham gia một tổ chức trên UNIWORK
            </div>
          </div>
        </div>
        <div className="mb-5 rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Token được xác thực server-side khi bạn chấp nhận.
          </div>
        </div>

        {signedIn === false && (
          <div className="space-y-3">
            <p className="text-sm">
              Vui lòng đăng nhập bằng email được mời trước khi chấp nhận.
            </p>
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem("uniwork_invite_redirect", `/invite/${token}`);
                navigate({ to: "/auth" });
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Đăng nhập <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {signedIn === true && (
          <button
            type="button"
            onClick={onAccept}
            disabled={accept.isPending || autoStarted}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {accept.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Đang xử lý…
              </>
            ) : (
              <>
                Chấp nhận lời mời <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        )}

        {signedIn === null && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra phiên đăng nhập…
          </div>
        )}
      </div>
    </div>
  );
}