"use client";

import {
  BULLET_LABELS,
  BULLET_SHAPES,
  FONT_CHOICES,
  FONT_SIZES,
  LINE_SPACINGS,
  NUMBER_FORMATS,
  NUMBER_LABELS,
  PAGE_MARGINS,
  PALETTE,
  REFERENCE_THEME,
  cssFontFamily,
  type FeeRowLabel,
  type HeadingStyle,
  type Theme,
} from "@/lib/pdf/agreementTheme";

// ------------------------------------------------------------ small controls

const field = "h-8 rounded-md border border-border bg-card px-2 text-sm text-ink outline-none focus:border-primary";

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span>
        {label}
        {hint && <span className="ml-1 text-muted/80">— {hint}</span>}
      </span>
      <span className="flex flex-wrap items-center gap-2">{children}</span>
    </label>
  );
}

function ColorField({ value, onChange, label, allowNone }: { value: string | null; onChange: (v: string | null) => void; label: string; allowNone?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="color"
        aria-label={label}
        list="agreement-palette"
        value={value ?? "#ffffff"}
        disabled={allowNone && value === null}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded-md border border-border bg-card disabled:cursor-not-allowed disabled:opacity-40"
      />
      <code className="text-[11px] text-muted">{value ?? "none"}</code>
      {allowNone && (
        <label className="flex items-center gap-1 text-[11px] text-muted">
          <input type="checkbox" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : "#52be96")} />
          none
        </label>
      )}
    </span>
  );
}

function FontSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={`${field} w-48`} style={{ fontFamily: cssFontFamily(value) }}>
      {FONT_CHOICES.map((f) => (
        <option key={f.key} value={f.key} style={{ fontFamily: cssFontFamily(f.key) }}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

function SizeSelect({ value, onChange, label, sizes = FONT_SIZES }: { value: number; onChange: (v: number) => void; label: string; sizes?: number[] }) {
  const all = sizes.includes(value) ? sizes : [...sizes, value].sort((a, b) => a - b);
  return (
    <select aria-label={label} value={String(value)} onChange={(e) => onChange(Number(e.target.value))} className={`${field} w-20`}>
      {all.map((s) => (
        <option key={s} value={String(s)}>
          {s} pt
        </option>
      ))}
    </select>
  );
}

function PointsInput({ value, onChange, label, max = 48 }: { value: number; onChange: (v: number) => void; label: string; max?: number }) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        aria-label={label}
        min={0}
        max={max}
        // "any", not 0.5: the reference letterhead rule is 2.25pt, and a value
        // off the step makes the field invalid — which silently stops the whole
        // form submitting while this panel is on its hidden tab.
        step="any"
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
        className={`${field} w-16`}
      />
      <span className="text-[11px]">pt</span>
    </span>
  );
}

function TextInput({ value, onChange, label, placeholder, wide }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; wide?: boolean }) {
  return (
    <input
      type="text"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${field} ${wide ? "w-full min-w-[260px] flex-1" : "w-56"}`}
    />
  );
}

function Section({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group rounded-md border border-border bg-card" open={open}>
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-ink">{title}</summary>
      <div className="flex flex-col gap-3 border-t border-border px-3 py-3">{children}</div>
    </details>
  );
}

// ------------------------------------------------------------ the panel

/**
 * The template's look: Classic (as every agreement printed before, not
 * adjustable) or a theme, set group by group. Writes the theme as JSON into a
 * hidden `design` field for the form's server action, which checks every value
 * again (normalizeTheme) before storing it.
 */
export function DesignPanel({
  value,
  onChange,
  kind,
  name = "design",
}: {
  value: Theme | null;
  onChange: (theme: Theme | null) => void;
  kind: "student" | "staff";
  name?: string;
}) {
  const t = value;
  const set = (patch: (draft: Theme) => void) => {
    if (!t) return;
    const next = structuredClone(t);
    patch(next);
    next.base = "custom";
    onChange(next);
  };
  const reference = () => {
    const next = structuredClone(REFERENCE_THEME);
    // A staff agreement's letterhead names its template, not "Retainer Agreement".
    if (kind === "staff") next.header.title = "";
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <datalist id="agreement-palette">
        {PALETTE.map((c) => (
          <option key={c.value} value={c.value} />
        ))}
      </datalist>
      <input type="hidden" name={name} value={t ? JSON.stringify(t) : ""} readOnly />

      <div className="flex flex-col gap-2 rounded-md border border-border bg-bg p-3">
        <p className="text-sm font-medium text-ink">Look</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-pressed={!t}
            className={`rounded-md border px-3 py-2 text-left text-xs ${!t ? "border-primary bg-card ring-1 ring-primary" : "border-border bg-card hover:bg-bg"}`}
          >
            <span className="block text-sm font-medium text-ink">Classic</span>
            <span className="text-muted">Exactly as agreements have always printed. Not adjustable.</span>
          </button>
          <button
            type="button"
            onClick={() => (t ? undefined : reference())}
            aria-pressed={!!t}
            className={`rounded-md border px-3 py-2 text-left text-xs ${t ? "border-primary bg-card ring-1 ring-primary" : "border-border bg-card hover:bg-bg"}`}
          >
            <span className="block text-sm font-medium text-ink">Designed</span>
            <span className="text-muted">Fonts, colours, headings, bullets, tables and the payment chart, set below.</span>
          </button>
        </div>
        {t && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <button
              type="button"
              onClick={() => {
                if (t.base === "reference" || confirm("Replace every setting below with the HMARK Reference style?")) reference();
              }}
              className="rounded-md border border-border bg-card px-2 py-1 text-ink hover:bg-bg"
            >
              Reset to the HMARK Reference style
            </button>
            <span>
              {t.base === "reference" ? "Using the HMARK Reference style, as in the reference contract." : "Customised."} Existing agreements
              change only when their PDF is regenerated.
            </span>
          </div>
        )}
      </div>

      {t && (
        <>
          <Section title="Page" open>
            <div className="flex flex-wrap gap-4">
              <Row label="Paper size">
                <select
                  aria-label="Paper size"
                  value={t.page.size}
                  onChange={(e) => set((d) => void (d.page.size = e.target.value as Theme["page"]["size"]))}
                  className={`${field} w-56`}
                >
                  <option value="A4">A4 (210 × 297 mm)</option>
                  <option value="LETTER">US Letter (8.5 × 11 in)</option>
                </select>
              </Row>
              <Row label="Side margins">
                <select
                  aria-label="Side margins"
                  value={String(t.page.margin)}
                  onChange={(e) => set((d) => void (d.page.margin = Number(e.target.value)))}
                  className={`${field} w-52`}
                >
                  {PAGE_MARGINS.map((m) => (
                    <option key={m.value} value={String(m.value)}>
                      {m.label}
                    </option>
                  ))}
                  {!PAGE_MARGINS.some((m) => m.value === t.page.margin) && <option value={String(t.page.margin)}>{t.page.margin} pt</option>}
                </select>
              </Row>
            </div>
          </Section>

          <Section title="Body text" open>
            <div className="flex flex-wrap gap-4">
              <Row label="Font">
                <FontSelect label="Body font" value={t.body.font} onChange={(v) => set((d) => void (d.body.font = v))} />
              </Row>
              <Row label="Size">
                <SizeSelect label="Body size" value={t.body.size} onChange={(v) => set((d) => void (d.body.size = v))} sizes={FONT_SIZES.filter((s) => s <= 16)} />
              </Row>
              <Row label="Colour">
                <ColorField label="Body colour" value={t.body.color} onChange={(v) => set((d) => void (d.body.color = v ?? "#000000"))} />
              </Row>
              <Row label="Line spacing">
                <select
                  aria-label="Line spacing"
                  value={String(t.body.lineHeight)}
                  onChange={(e) => set((d) => void (d.body.lineHeight = Number(e.target.value)))}
                  className={`${field} w-40`}
                >
                  {LINE_SPACINGS.map((s) => (
                    <option key={s.value} value={String(s.value)}>
                      {s.label}
                    </option>
                  ))}
                  {!LINE_SPACINGS.some((s) => s.value === t.body.lineHeight) && <option value={String(t.body.lineHeight)}>{t.body.lineHeight}</option>}
                </select>
              </Row>
              <Row label="Alignment">
                <select
                  aria-label="Alignment"
                  value={t.body.align}
                  onChange={(e) => set((d) => void (d.body.align = e.target.value as Theme["body"]["align"]))}
                  className={`${field} w-36`}
                >
                  <option value="justify">Justified</option>
                  <option value="left">Left</option>
                </select>
              </Row>
              <Row label="Space after a paragraph">
                <PointsInput label="Space after a paragraph" value={t.body.spaceAfter} onChange={(v) => set((d) => void (d.body.spaceAfter = v))} max={36} />
              </Row>
            </div>
          </Section>

          <Section title="Headings">
            {t.headings.map((h, i) => (
              <HeadingRow key={i} level={i + 1} value={h} onChange={(next) => set((d) => void (d.headings[i] = next))} />
            ))}
            <p className="text-xs text-muted">
              Choose Heading 1, 2 or 3 from the style menu in the editor&apos;s toolbar; each prints like this. In the reference contract,
              Heading 1 is the numbered green section title and Heading 2 the grey sub-heading.
            </p>
          </Section>

          <Section title="Bullets and numbering">
            <div className="flex flex-wrap gap-4">
              <Row label="Bullet">
                <select
                  aria-label="Bullet"
                  value={t.list.bullet}
                  onChange={(e) => set((d) => void (d.list.bullet = e.target.value as Theme["list"]["bullet"]))}
                  className={`${field} w-36`}
                >
                  {BULLET_SHAPES.map((b) => (
                    <option key={b} value={b}>
                      {BULLET_LABELS[b]}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Colour">
                <ColorField label="Bullet colour" value={t.list.color} onChange={(v) => set((d) => void (d.list.color = v ?? "#000000"))} />
              </Row>
              <Row label="Numbering">
                <select
                  aria-label="Numbering"
                  value={t.list.numbering}
                  onChange={(e) => set((d) => void (d.list.numbering = e.target.value as Theme["list"]["numbering"]))}
                  className={`${field} w-32`}
                >
                  {NUMBER_FORMATS.map((n) => (
                    <option key={n} value={n}>
                      {NUMBER_LABELS[n]}
                    </option>
                  ))}
                </select>
              </Row>
              <Row label="Space between items">
                <PointsInput label="Space between items" value={t.list.spaceAfter} onChange={(v) => set((d) => void (d.list.spaceAfter = v))} max={36} />
              </Row>
            </div>
            <p className="text-xs text-muted">A single list can still have its own bullet or colour, from the toolbar.</p>
          </Section>

          <Section title={kind === "student" ? "Tables and the payment chart" : "Tables"}>
            <div className="flex flex-wrap gap-4">
              <Row label="Lines">
                <ColorField label="Table line colour" value={t.table.border} onChange={(v) => set((d) => void (d.table.border = v ?? "#726f73"))} />
              </Row>
              <Row label="Header row fill">
                <ColorField label="Header row fill" allowNone value={t.table.headerFill} onChange={(v) => set((d) => void (d.table.headerFill = v))} />
              </Row>
              <Row label="Header row text">
                <ColorField label="Header row text" value={t.table.headerText} onChange={(v) => set((d) => void (d.table.headerText = v ?? "#ffffff"))} />
              </Row>
              {kind === "student" && (
                <Row label="Total row fill">
                  <ColorField label="Total row fill" allowNone value={t.table.totalFill} onChange={(v) => set((d) => void (d.table.totalFill = v))} />
                </Row>
              )}
            </div>
            {kind === "student" && <FeeWording theme={t} set={set} />}
          </Section>

          <Section title="Letterhead">
            <div className="flex flex-wrap gap-4">
              <Row label="Title under “HMARK Consultants”" hint={kind === "staff" ? "blank uses the template's name" : undefined}>
                <TextInput
                  label="Letterhead title"
                  value={t.header.title}
                  placeholder={kind === "staff" ? "The template's name" : "Retainer Agreement"}
                  onChange={(v) => set((d) => void (d.header.title = v))}
                />
              </Row>
              <Row label="Title">
                <ColorField label="Title colour" value={t.header.titleColor} onChange={(v) => set((d) => void (d.header.titleColor = v ?? "#000000"))} />
                <SizeSelect label="Title size" value={t.header.titleSize} onChange={(v) => set((d) => void (d.header.titleSize = v))} sizes={FONT_SIZES.filter((s) => s >= 7 && s <= 20)} />
              </Row>
              <Row label="Rule under the letterhead">
                <ColorField label="Letterhead rule colour" value={t.header.ruleColor} onChange={(v) => set((d) => void (d.header.ruleColor = v ?? "#808080"))} />
                <PointsInput label="Letterhead rule thickness" value={t.header.ruleWidth} onChange={(v) => set((d) => void (d.header.ruleWidth = v))} max={6} />
              </Row>
              <Row label="Page number">
                <ColorField label="Page number colour" value={t.header.pageNumberColor} onChange={(v) => set((d) => void (d.header.pageNumberColor = v ?? "#4f81bd"))} />
                <SizeSelect label="Page number size" value={t.header.pageNumberSize} onChange={(v) => set((d) => void (d.header.pageNumberSize = v))} sizes={FONT_SIZES.filter((s) => s >= 7 && s <= 28)} />
              </Row>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function HeadingRow({ level, value, onChange }: { level: number; value: HeadingStyle; onChange: (h: HeadingStyle) => void }) {
  const patch = (p: Partial<HeadingStyle>) => onChange({ ...value, ...p });
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
      <p
        className="text-sm"
        style={{
          fontFamily: cssFontFamily(value.font),
          fontSize: `${Math.min(value.size, 16)}pt`,
          color: value.color,
          fontWeight: value.bold ? 700 : 400,
          fontStyle: value.italic ? "italic" : "normal",
          borderBottom: value.rule ? `1px solid ${value.rule}` : undefined,
          background: "#ffffff",
          padding: "2px 6px",
        }}
      >
        Heading {level} — sample
      </p>
      <div className="flex flex-wrap gap-4">
        <Row label="Font">
          <FontSelect label={`Heading ${level} font`} value={value.font} onChange={(font) => patch({ font })} />
        </Row>
        <Row label="Size">
          <SizeSelect label={`Heading ${level} size`} value={value.size} onChange={(size) => patch({ size })} />
        </Row>
        <Row label="Colour">
          <ColorField label={`Heading ${level} colour`} value={value.color} onChange={(color) => patch({ color: color ?? "#000000" })} />
        </Row>
        <Row label="Style">
          <label className="flex items-center gap-1 text-xs text-ink">
            <input type="checkbox" checked={value.bold} onChange={(e) => patch({ bold: e.target.checked })} /> Bold
          </label>
          <label className="flex items-center gap-1 text-xs text-ink">
            <input type="checkbox" checked={value.italic} onChange={(e) => patch({ italic: e.target.checked })} /> Italic
          </label>
        </Row>
        <Row label="Rule underneath">
          <ColorField label={`Heading ${level} rule`} allowNone value={value.rule} onChange={(rule) => patch({ rule })} />
        </Row>
        <Row label="Space above / below">
          <PointsInput label={`Heading ${level} space above`} value={value.spaceBefore} onChange={(spaceBefore) => patch({ spaceBefore })} />
          <PointsInput label={`Heading ${level} space below`} value={value.spaceAfter} onChange={(spaceAfter) => patch({ spaceAfter })} />
        </Row>
      </div>
    </div>
  );
}

function FeeWording({ theme: t, set }: { theme: Theme; set: (patch: (d: Theme) => void) => void }) {
  const label = (title: string, value: FeeRowLabel, apply: (d: Theme, v: FeeRowLabel) => void) => (
    <div className="flex flex-wrap items-end gap-2">
      <Row label={title}>
        <TextInput label={title} wide value={value.label} onChange={(v) => set((d) => apply(d, { ...value, label: v }))} />
      </Row>
      <Row label="Note under it (optional)">
        <TextInput label={`${title} — note`} value={value.note} onChange={(v) => set((d) => apply(d, { ...value, note: v }))} />
      </Row>
    </div>
  );
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-2">
      <p className="text-sm font-medium text-ink">Payment chart</p>
      <p className="text-xs text-muted">
        The figures are always the student&apos;s own; this is only how the chart words and lays them out. The rows it prints depend on the
        agreement — the fee whole, or in two or three installments.
      </p>
      <div className="flex flex-wrap gap-4">
        <Row label="Header row">
          <label className="flex items-center gap-1 text-xs text-ink">
            <input type="checkbox" checked={t.fee.headerRow} onChange={(e) => set((d) => void (d.fee.headerRow = e.target.checked))} /> Show
          </label>
          <TextInput label="Header — payment column" value={t.fee.paymentLabel} onChange={(v) => set((d) => void (d.fee.paymentLabel = v))} />
          <TextInput label="Header — amount column" value={t.fee.amountLabel} onChange={(v) => set((d) => void (d.fee.amountLabel = v))} />
        </Row>
        <Row label="Amounts">
          <select
            aria-label="Amount format"
            value={`${t.fee.amount.symbol}|${t.fee.amount.decimals}`}
            onChange={(e) => {
              const [symbol, decimals] = e.target.value.split("|") as [Theme["fee"]["amount"]["symbol"], Theme["fee"]["amount"]["decimals"]];
              set((d) => void (d.fee.amount = { symbol, decimals }));
            }}
            className={`${field} w-56`}
          >
            <option value="before|always">€2,100.00</option>
            <option value="before|when-needed">€2,100 (cents only when there are some)</option>
            <option value="after|always">2,100.00 €</option>
            <option value="after|when-needed">2,100 € (cents only when there are some)</option>
          </select>
        </Row>
      </div>
      {label("Administrative charge", t.fee.admin, (d, v) => void (d.fee.admin = v))}
      {label("Fee paid in one go", t.fee.single, (d, v) => void (d.fee.single = v))}
      <p className="text-xs font-medium text-ink">Fee in two installments</p>
      {label("First of two", t.fee.two[0], (d, v) => void (d.fee.two[0] = v))}
      {label("Second of two", t.fee.two[1], (d, v) => void (d.fee.two[1] = v))}
      <p className="text-xs font-medium text-ink">Fee in three installments</p>
      {label("First of three", t.fee.three[0], (d, v) => void (d.fee.three[0] = v))}
      {label("Second of three", t.fee.three[1], (d, v) => void (d.fee.three[1] = v))}
      {label("Third of three", t.fee.three[2], (d, v) => void (d.fee.three[2] = v))}
      {label("Visa documentation fee (visa-service agreements, paid in one go)", t.fee.visa, (d, v) => void (d.fee.visa = v))}
      <Row label="Total row">
        <TextInput label="Total row" value={t.fee.total} onChange={(v) => set((d) => void (d.fee.total = v))} />
      </Row>
    </div>
  );
}
