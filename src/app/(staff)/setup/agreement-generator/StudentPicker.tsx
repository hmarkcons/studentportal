"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";

type Student = {
  id: string;
  full_name: string;
  email: string | null;
  passport_number: string | null;
  country_of_interest: string | null;
};

export function StudentPicker({ students, countries }: { students: Student[]; countries: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [countryStudentId, setCountryStudentId] = useState("");

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(
        (s) =>
          s.full_name.toLowerCase().includes(q) ||
          (s.email ?? "").toLowerCase().includes(q) ||
          (s.passport_number ?? "").toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [query, students]);

  const studentsInCountry = useMemo(() => {
    if (!country) return [];
    return students.filter((s) => (s.country_of_interest ?? "").includes(country));
  }, [country, students]);

  function goToStudent(id: string) {
    router.push(`/setup/agreement-generator?student=${id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Search by name, email, or passport number</label>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Start typing…"
          className="w-full"
        />
        {searchResults.length > 0 && (
          <div className="mt-2 flex flex-col divide-y divide-border rounded-md border border-border">
            {searchResults.map((s) => (
              <button
                key={s.id}
                onClick={() => goToStudent(s.id)}
                className="flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-bg"
              >
                <span className="text-ink">{s.full_name}</span>
                <span className="text-xs text-muted">
                  {s.email ?? "—"} {s.passport_number ? `· ${s.passport_number}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        or filter by country
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Country</label>
          <Select
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setCountryStudentId("");
            }}
          >
            <option value="">Choose country…</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        {country && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Registered student in {country}</label>
            <Select
              value={countryStudentId}
              onChange={(e) => setCountryStudentId(e.target.value)}
            >
              <option value="">Choose student…</option>
              {studentsInCountry.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {countryStudentId && (
          <Button onClick={() => goToStudent(countryStudentId)} variant="primary">
            Go
          </Button>
        )}
      </div>
    </div>
  );
}
