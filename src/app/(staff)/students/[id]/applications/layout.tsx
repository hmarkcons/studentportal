import { ProcessingTabGuard } from "@/components/ProcessingTabGuard";

// Processing's tab: a counsellor with no processing role is refused it once
// the student is registered — see src/lib/auth/studentAccess.ts.
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProcessingTabGuard studentId={id}>{children}</ProcessingTabGuard>;
}
