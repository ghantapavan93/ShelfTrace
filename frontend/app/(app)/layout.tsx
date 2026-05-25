import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ModeProvider } from "@/components/ModeProvider";
import { ToastProvider } from "@/components/Toast";

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ModeProvider>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </ModeProvider>
    </ErrorBoundary>
  );
}
