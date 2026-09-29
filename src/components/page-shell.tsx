import type { ComponentType } from "react";
import { AppSidebar, AppTopbar, useSidebarState } from "@/components/app-shell";

/** Bọc một trang nội bộ bằng menu chính + thanh trên cùng. */
export function withAppShell<P extends object>(Page: ComponentType<P>) {
  function Shelled(props: P) {
    const [open, setOpen] = useSidebarState();
    return (
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <AppSidebar open={open} onClose={() => setOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppTopbar variant="documents" onOpenSidebar={() => setOpen(true)} />
          <main className="min-h-0 flex-1 overflow-y-auto">
            <Page {...props} />
          </main>
        </div>
      </div>
    );
  }
  return Shelled;
}
