/**
 * How to write a staff agreement template, on the tab where it is done.
 *
 * Short on purpose, and paired with the sample template: the sample shows
 * what a finished one looks like, this says the few rules that are not
 * visible from looking at it — above all that a placeholder with nothing on
 * the staff member's record stops generation, and where each value comes from.
 */
export function StaffTemplateGuide() {
  return (
    <details className="mb-6 rounded-lg border border-border bg-card p-4 text-sm" data-staff-template-guide>
      <summary className="cursor-pointer font-medium text-ink">How to write a staff agreement template</summary>
      <ol className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-muted">
        <li>
          <strong className="text-ink">Start from the sample.</strong> Press <em>Duplicate</em> beside{" "}
          <em>Sample — Employment Agreement</em>, rename the copy, and change what you need. Leave the sample as it is, so
          there is always a clean one to copy.
        </li>
        <li>
          <strong className="text-ink">Write the wording once, for everyone.</strong> Wherever something differs per
          person, type a placeholder in double curly braces — <code>{"{{staff_name}}"}</code>,{" "}
          <code>{"{{monthly_salary}}"}</code>, <code>{"{{entry_time}}"}</code>. Each is replaced from the staff
          member&apos;s record when the agreement is generated. The full list is under <em>Available merge fields</em>{" "}
          below the editor; type them exactly as shown.
        </li>
        <li>
          <strong className="text-ink">Know where each value comes from.</strong> Name, designation, CNIC, address and
          contact details come from their Staff Management record; salary and allowance from its pay section; entry and
          exit times and working days from their own hours, or the office&apos;s under Setup → Attendance policy if they
          have none; the grace period always from the attendance policy.
        </li>
        <li>
          <strong className="text-ink">A missing value stops generation, on purpose.</strong> If the wording uses{" "}
          <code>{"{{monthly_salary}}"}</code> and their record has no salary, the agreement is not generated — you are
          told what to fill in first. So only use placeholders every person you&apos;ll issue it to will have. A
          student placeholder such as <code>{"{{student_name}}"}</code> is refused when you save.
        </li>
        <li>
          <strong className="text-ink">Format it with the toolbar.</strong> Headings for clause titles, numbered and
          bulleted lists, bold, and tables all carry into the PDF. You can also import a Word .docx — its formatting is
          kept — and then swap the names and figures in it for placeholders.
        </li>
        <li>
          <strong className="text-ink">Don&apos;t type the parts the PDF adds itself.</strong> The HMARK letterhead, the
          table of the staff member&apos;s details at the top, both signature lines and the page footer are added to every
          agreement automatically. Write only the terms.
        </li>
        <li>
          <strong className="text-ink">Check it before anyone signs.</strong> Generate it for one person and open the PDF
          before sending it. Changing a template later changes only agreements generated afterwards; a draft can be
          regenerated to pick the change up, a signed one never changes.
        </li>
      </ol>
    </details>
  );
}
