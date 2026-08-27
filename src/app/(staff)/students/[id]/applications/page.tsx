import Link from "next/link";
import { getStaffSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BoardingPassTracker } from "@/components/ui/BoardingPassTracker";
import { DeleteApplicationButton } from "./DeleteApplicationButton";
import { FinalizeApplicationButton } from "./FinalizeApplicationButton";

function one<T>(v: T | T[] | null) {
  return Array.isArray(v) ? v[0] ?? null : v;
}

export default async function StudentApplicationsTab(props: PageProps<"/students/[id]/applications">) {
  const { id } = await props.params;
  const { supabase, staff: staffRow } = await getStaffSession();
  const canDelete = staffRow?.role === "super_admin" || staffRow?.role === "management";

  const { data: applications } = await supabase
    .from("applications")
    .select(
      `id, current_stage, intake, deadline, is_finalized,
       university:universities(name, destination:destinations(display_name, country_code, pipeline_stages)),
       program:programs(name)`
    )
    .eq("student_id", id)
    .order("created_at", { ascending: true });

  const revalidateTo = `/students/${id}/applications`;

  const byCountry = new Map<string, typeof applications>();
  for (const a of applications ?? []) {
    const uni = one(a.university as never) as { destination?: unknown } | null;
    const dest = uni?.destination ? (one(uni.destination as never) as { display_name?: string } | null) : null;
    const country = dest?.display_name ?? "Unassigned";
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country)!.push(a);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{applications?.length ?? 0} applications</p>
        <Link href={`/students/${id}/applications/new`} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-ink">
          + Add application
        </Link>
      </div>

      {(!applications || applications.length === 0) && (
        <Card>
          <EmptyState>No applications yet.</EmptyState>
        </Card>
      )}

      {Array.from(byCountry.entries()).map(([country, apps]) => (
        <div key={country} className="mb-6">
          <h3 className="mb-3 text-sm font-medium text-ink">Applications — {country}</h3>
          <div className="flex flex-col gap-4">
            {(apps ?? []).map((a) => {
              const uni = one(a.university as never) as { name?: string; destination?: unknown } | null;
              const dest = uni?.destination
                ? (one(uni.destination as never) as { pipeline_stages?: string[]; country_code?: string } | null)
                : null;
              const program = one(a.program as never) as { name?: string } | null;
              const isItaly = dest?.country_code === "IT";
              return (
                <div key={a.id}>
                  <Link href={`/students/${id}/applications/${a.id}`} className="block">
                    <BoardingPassTracker
                      universityName={uni?.name ?? "University"}
                      programName={program?.name}
                      intake={a.intake}
                      currentStage={a.current_stage}
                      pipelineStages={dest?.pipeline_stages ?? []}
                    />
                  </Link>
                  <div className="mt-1 flex items-center justify-between px-1">
                    <span className="text-xs text-muted">
                      {a.deadline ? `Deadline: ${new Date(a.deadline).toLocaleDateString()}` : "No deadline set"}
                      {" · "}
                      <Badge tone="info">{a.current_stage.replace(/_/g, " ")}</Badge>
                      {a.is_finalized && (
                        <>
                          {" · "}
                          <Badge tone="success">{isItaly ? "Pre-Enrolled" : "Finalized for visa"}</Badge>
                        </>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <FinalizeApplicationButton
                        applicationId={a.id}
                        studentId={id}
                        revalidateTo={revalidateTo}
                        isFinalized={a.is_finalized}
                        countryCode={dest?.country_code}
                      />
                      {canDelete && (
                        <DeleteApplicationButton applicationId={a.id} revalidateTo={revalidateTo} label={uni?.name ?? "this university"} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
