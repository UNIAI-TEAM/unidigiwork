import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { openUniCopilot } from "@/components/ai/uni-copilot";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Settings, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { getMyIsAdmin } from "@/lib/api/admin.functions";
import { MOBILE_MORE_ITEMS, NAV_GROUPS, isNavItemVisible } from "@/config/navigation";

export const Route = createFileRoute("/_authenticated/m/more")({
  head: () => ({
    meta: [
      { title: "Thêm · UNIWORK" },
      { name: "description", content: "Truy cập nhanh các tính năng khác trên UNIWORK mobile." },
      { property: "og:title", content: "Thêm · UNIWORK" },
      {
        property: "og:description",
        content: "Truy cập nhanh các tính năng khác trên UNIWORK mobile.",
      },
    ],
  }),
  component: MorePage,
});

function MorePage() {
  const { t } = useI18n();
  const { data } = useQuery({
    queryKey: ["admin", "isAdmin"],
    queryFn: () => getMyIsAdmin(),
    staleTime: 5 * 60_000,
  });
  const isAdmin = data?.isAdmin === true;

  const groups = NAV_GROUPS.map((group) => ({
    group,
    items: MOBILE_MORE_ITEMS.filter((i) => i.group === group.id && isNavItemVisible(i, { isAdmin })),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-full flex-col gap-5 p-4 pb-28">
      <h1 className="text-lg font-semibold">{t("nav.more")}</h1>

      <button
        type="button"
        onClick={() => openUniCopilot()}
        className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface px-4 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Hỏi UNI</span>
          <span className="block text-xs text-muted-foreground">
            Trợ lý công việc — trả lời kèm nguồn, chỉ đọc dữ liệu bạn được xem
          </span>
        </span>
      </button>

      {groups.map(({ group, items }) => (
        <section key={group.id} className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t(group.labelKey)}
          </h2>
          <ul className="grid gap-2">
            {items.map((item) => (
              <li key={item.id}>
                <Row to={item.mobile!.href} label={t(item.labelKey)} icon={item.icon} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("nav.settings")}
        </h2>
        <ul className="grid gap-2">
          <li>
            <Row to="/settings" label={t("nav.settings")} icon={Settings} />
          </li>
          <li>
            <Row to="/help" label={t("nav.help")} icon={HelpCircle} />
          </li>
        </ul>
      </section>
    </div>
  );
}

function Row({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:bg-surface-2"
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-primary",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
