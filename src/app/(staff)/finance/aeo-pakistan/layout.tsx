import { PageGuard } from "@/components/PageGuard";

// Super Admin and Finance only, and not grantable (0335).
export default function AeoPakistanLayout({ children }: { children: React.ReactNode }) {
  return <PageGuard path="/finance/aeo-pakistan">{children}</PageGuard>;
}
