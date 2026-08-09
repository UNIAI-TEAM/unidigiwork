import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Mail, MapPin, Phone, Briefcase, CalendarDays, UserCog } from "lucide-react";
import { AppSidebar, useSidebarState } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { getPerson, removePerson } from "@/lib/api/people.functions";

export const Route = createFileRoute("/_authenticated/people/$id")({
  component: PersonDetailPage,
  head: () => ({
    meta: [
      { title: "Hồ sơ nhân sự — UNIWORK" },
      { name: "description", content: "Xem hồ sơ nhân sự: phòng ban, kỹ năng, liên hệ và vai trò trong tổ chức." },
      { property: "og:title", content: "Hồ sơ nhân sự — UNIWORK" },
      { property: "og:description", content: "Thông tin phòng ban, kỹ năng và vai trò của nhân sự trong workspace." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const avatar = (seed: string) =>
  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;

function PersonDetailPage() {
  const { id } = Route.useParams();
  const [open, setOpen] = useSidebarState();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchPerson = useServerFn(getPerson);
  const removeMember = useServerFn(removePerson);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["people", id],
    queryFn: () => fetchPerson({ data: { userId: id } }),
  });

  const del = useMutation({
    mutationFn: () => removeMember({ data: { userId: id } }),
    onSuccess: () => {
      toast.success("Đã gỡ nhân sự khỏi tổ chức");
      qc.invalidateQueries({ queryKey: ["people"] });
      navigate({ to: "/people" });
    },
    onError: (e: Error) => toast.error(e.message || "Không gỡ được nhân sự"),
  });

  const person = data?.person;

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-foreground">
      <AppSidebar active="people" open={open} onClose={() => setOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
          <Link
            to="/people"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Danh bạ nhân sự
          </Link>

          {isPending ? (
            <div className="rounded-xl border border-border bg-surface/40 py-16 text-center text-sm text-muted-foreground">
              Đang tải hồ sơ…
            </div>
          ) : isError || !person ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-destructive/40 bg-surface/40 py-16 text-sm text-destructive">
              Không tìm thấy hồ sơ nhân sự.
              <button
                onClick={() => refetch()}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-2"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-6">
              <header className="flex flex-wrap items-start gap-4 rounded-xl border border-border bg-surface p-6">
                <img
                  src={avatar(person.seed)}
                  alt={person.name}
                  className="h-20 w-20 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold tracking-tight">{person.name}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {person.title || "—"} · {person.department || "—"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded border border-border bg-surface-2 px-2 py-0.5">
                      {person.role}
                    </span>
                    <span className="rounded border border-border bg-surface-2 px-2 py-0.5">
                      {person.memberStatus}
                    </span>
                  </div>
                </div>
                {data.canManage && !person.isSelf && (
                  <button
                    onClick={() => del.mutate()}
                    disabled={del.isPending}
                    className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
                  >
                    {del.isPending ? "Đang gỡ…" : "Gỡ khỏi tổ chức"}
                  </button>
                )}
              </header>

              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoCard title="Liên hệ">
                  <InfoRow icon={<Mail className="h-4 w-4" />} value={person.email || "—"} />
                  <InfoRow icon={<Phone className="h-4 w-4" />} value={person.phone || "—"} />
                  <InfoRow icon={<MapPin className="h-4 w-4" />} value={person.location || "—"} />
                </InfoCard>
                <InfoCard title="Công việc">
                  <InfoRow icon={<Briefcase className="h-4 w-4" />} value={person.team || "—"} />
                  <InfoRow
                    icon={<UserCog className="h-4 w-4" />}
                    value={person.reportsTo || "Chưa có quản lý trực tiếp"}
                  />
                  <InfoRow
                    icon={<CalendarDays className="h-4 w-4" />}
                    value={person.joinDate || "—"}
                  />
                </InfoCard>
              </section>

              <section className="rounded-xl border border-border bg-surface p-5">
                <h2 className="mb-3 text-sm font-semibold">Kỹ năng</h2>
                {person.skills.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa cập nhật kỹ năng.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {person.skills.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-border bg-surface p-5">
                <h2 className="mb-3 text-sm font-semibold">Giới thiệu</h2>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {person.about || "Chưa có mô tả."}
                </p>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function InfoRow({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {icon}
      <span className="truncate">{value}</span>
    </div>
  );
}
