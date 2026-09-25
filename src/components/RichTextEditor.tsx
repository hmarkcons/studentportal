"use client";

import { useEditor, useEditorState, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableRow } from "@tiptap/extension-table";
import { TextStyle, Color, BackgroundColor, FontFamily, FontSize } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useState } from "react";
import {
  BULLET_LABELS,
  BULLET_SHAPES,
  FONT_CHOICES,
  FONT_SIZES,
  LINE_SPACINGS,
  NUMBER_FORMATS,
  NUMBER_LABELS,
  cssFontFamily,
  fontChoice,
  normalizeColor,
  type Theme,
} from "@/lib/pdf/agreementTheme";
import { BRAND_LOGO_DATA_URI } from "@/lib/pdf/brandLogo";
import {
  BlockFormat,
  PageBreak,
  StyledBulletList,
  StyledOrderedList,
  StyledTable,
  StyledTableCell,
  StyledTableHeader,
} from "@/components/agreement-builder/extensions";
import { ColorMenu } from "@/components/agreement-builder/ColorMenu";
import { paperLook } from "@/components/agreement-builder/editorTheme";

const SPACINGS = [0, 2, 3, 4, 6, 8, 10, 12, 18, 24];

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
  wide,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      // Keeps the editor's selection: a mousedown on the button would otherwise blur it first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`h-7 rounded px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${wide ? "" : "min-w-7"} ${
        active ? "bg-primary text-primary-ink" : "border border-border text-ink hover:bg-bg"
      }`}
    >
      {children}
    </button>
  );
}

function ToolSelect({
  title,
  value,
  onChange,
  children,
  className = "",
  disabled,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      title={title}
      aria-label={title}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`h-7 rounded border border-border bg-card px-1 text-xs text-ink disabled:opacity-40 ${className}`}
    >
      {children}
    </select>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />;

// What the toolbar shows for the current selection.
function toolbarState(e: Editor) {
  const text = e.getAttributes("textStyle");
  const block = e.isActive("heading") ? e.getAttributes("heading") : e.getAttributes("paragraph");
  const inBullet = e.isActive("bulletList");
  const inOrdered = e.isActive("orderedList");
  const list = inOrdered ? e.getAttributes("orderedList") : inBullet ? e.getAttributes("bulletList") : {};
  const cell = e.isActive("tableHeader") ? e.getAttributes("tableHeader") : e.getAttributes("tableCell");
  const align = (["left", "center", "right", "justify"] as const).find((a) => e.isActive({ textAlign: a })) ?? null;
  return {
    bold: e.isActive("bold"),
    italic: e.isActive("italic"),
    underline: e.isActive("underline"),
    strike: e.isActive("strike"),
    style: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p",
    font: fontChoice(text.fontFamily as string | undefined)?.key ?? "",
    size: typeof text.fontSize === "string" ? String(parseFloat(text.fontSize)) : "",
    color: normalizeColor(text.color),
    highlight: normalizeColor(text.backgroundColor),
    align,
    lineHeight: block.lineHeight ? String(block.lineHeight) : "",
    spaceBefore: block.spaceBefore !== null && block.spaceBefore !== undefined ? String(block.spaceBefore) : "",
    spaceAfter: block.spaceAfter !== null && block.spaceAfter !== undefined ? String(block.spaceAfter) : "",
    rule: normalizeColor(block.rule),
    shade: normalizeColor(block.shade),
    inBullet,
    inOrdered,
    listStyle: inBullet ? `bullet:${list.bullet ?? ""}` : inOrdered ? `number:${list.numbering ?? ""}` : "",
    markerColor: normalizeColor(list.markerColor),
    inTable: e.isActive("table"),
    cellFill: normalizeColor(cell.fill),
    tableBorder: normalizeColor(e.getAttributes("table").border),
    canUndo: e.can().undo(),
    canRedo: e.can().redo(),
    canIndent: e.can().indent(),
    canOutdent: e.can().outdent(),
  };
}

// Read through useEditorState: TipTap v3 no longer re-renders the component on
// every transaction, so reading the editor during render goes stale. But the
// hook only hears of the editor at its first transaction — until then it says
// null — so the state is read directly meanwhile. Waiting on the hook alone
// drew no editor at all on a blank form, where nothing had happened yet.
function useToolbarState(editor: Editor | null) {
  const watched = useEditorState({ editor, selector: ({ editor: e }) => (e ? toolbarState(e) : null) });
  return watched ?? (editor ? toolbarState(editor) : null);
}

export function RichTextEditor({
  name,
  content,
  onChangeHtml,
  paymentChart = true,
  theme = null,
  mergeFields = [],
  headerTitle = "Retainer Agreement",
}: {
  name: string;
  content: string;
  onChangeHtml?: (html: string) => void;
  /** The "+ Payment Chart" button. Off for a staff agreement, which has no student fee table to place. */
  paymentChart?: boolean;
  /** The template's design, so the page is drawn in it; null is the Classic look. */
  theme?: Theme | null;
  /** Placeholders the "Insert field" menu offers. */
  mergeFields?: { key: string; label: string }[];
  /** What the letterhead at the top of the page says under "HMARK Consultants". */
  headerTitle?: string;
}) {
  const [zoom, setZoom] = useState("1");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, bulletList: false, orderedList: false, code: false, codeBlock: false, link: false }),
      StyledBulletList,
      StyledOrderedList,
      TextStyle,
      Color,
      BackgroundColor,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      StyledTable.configure({ resizable: true, cellMinWidth: 40 }),
      TableRow,
      StyledTableHeader,
      StyledTableCell,
      BlockFormat,
      PageBreak,
    ],
    content,
    editorProps: {
      attributes: {
        class: "prose-agreement agreement-paper-content min-h-[320px] focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChangeHtml?.(editor.getHTML()),
  });
  const state = useToolbarState(editor);

  // The wording can be replaced wholesale (e.g. a .docx re-upload) after the
  // editor already mounted — sync it in without recreating the editor.
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor || !state) return null;

  // Inserted content can land outside the currently visible area (e.g. the
  // cursor was left scrolled off-screen) — without this, clicking a toolbar
  // button can look like it did nothing even though it worked.
  function insertAndReveal(run: () => boolean) {
    run();
    requestAnimationFrame(() => editor!.commands.scrollIntoView());
  }

  const chain = () => editor.chain().focus();

  function setStyle(v: string) {
    if (v === "p") chain().setParagraph().run();
    else chain().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run();
  }

  function setListStyle(v: string) {
    if (v === "none") {
      if (state!.inBullet) chain().toggleBulletList().run();
      else if (state!.inOrdered) chain().toggleOrderedList().run();
      return;
    }
    const [kind, style] = v.split(":");
    if (kind === "bullet") {
      if (!state!.inBullet) chain().toggleBulletList().run();
      chain().updateAttributes("bulletList", { bullet: style || null }).run();
    } else {
      if (!state!.inOrdered) chain().toggleOrderedList().run();
      chain().updateAttributes("orderedList", { numbering: style || null }).run();
    }
  }

  function clearFormatting() {
    let c = chain().unsetAllMarks().unsetTextAlign();
    for (const attr of ["lineHeight", "spaceBefore", "spaceAfter", "rule", "shade"] as const) c = c.setBlockFormat(attr, null);
    c.run();
  }

  const look = paperLook(theme);

  return (
    <div className="agreement-builder rounded-md border border-border">
      <div className="sticky top-0 z-20 flex flex-col gap-1 rounded-t-md border-b border-border bg-bg p-1.5">
        {/* Row 1 — text */}
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton title="Undo (Ctrl+Z)" disabled={!state.canUndo} onClick={() => chain().undo().run()}>
            ↶
          </ToolbarButton>
          <ToolbarButton title="Redo (Ctrl+Y)" disabled={!state.canRedo} onClick={() => chain().redo().run()}>
            ↷
          </ToolbarButton>
          <Divider />
          <ToolSelect title="Paragraph style" value={state.style} onChange={setStyle} className="w-[7.5rem]">
            <option value="p">Normal text</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
          </ToolSelect>
          <ToolSelect
            title="Font"
            value={state.font}
            onChange={(v) => (v ? chain().setFontFamily(cssFontFamily(v)).run() : chain().unsetFontFamily().run())}
            className="w-[10.5rem]"
          >
            <option value="">Font: template default</option>
            {FONT_CHOICES.map((f) => (
              <option key={f.key} value={f.key} style={{ fontFamily: cssFontFamily(f.key) }}>
                {f.label}
              </option>
            ))}
          </ToolSelect>
          <ToolSelect
            title="Font size (points)"
            value={state.size}
            onChange={(v) => (v ? chain().setFontSize(`${v}pt`).run() : chain().unsetFontSize().run())}
            className="w-[4.5rem]"
          >
            <option value="">Size</option>
            {FONT_SIZES.map((s) => (
              <option key={s} value={String(s)}>
                {s}
              </option>
            ))}
            {state.size && !FONT_SIZES.includes(Number(state.size)) && <option value={state.size}>{state.size}</option>}
          </ToolSelect>
          <Divider />
          <ToolbarButton title="Bold (Ctrl+B)" active={state.bold} onClick={() => chain().toggleBold().run()}>
            <strong>B</strong>
          </ToolbarButton>
          <ToolbarButton title="Italic (Ctrl+I)" active={state.italic} onClick={() => chain().toggleItalic().run()}>
            <em>I</em>
          </ToolbarButton>
          <ToolbarButton title="Underline (Ctrl+U)" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
            <span className="underline">U</span>
          </ToolbarButton>
          <ToolbarButton title="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}>
            <span className="line-through">S</span>
          </ToolbarButton>
          <ColorMenu
            title="Text colour"
            label="A"
            swatch={state.color}
            clearLabel="Automatic (the template's colour)"
            onPick={(c) => (c ? chain().setColor(c).run() : chain().unsetColor().run())}
          />
          <ColorMenu
            title="Highlight"
            label={<span className="rounded-sm bg-yellow-200 px-0.5 text-black">ab</span>}
            swatch={state.highlight}
            clearLabel="No highlight"
            onPick={(c) => (c ? chain().setBackgroundColor(c).run() : chain().unsetBackgroundColor().run())}
          />
          <ToolbarButton title="Clear formatting from the selection" onClick={clearFormatting} wide>
            Clear
          </ToolbarButton>
          <Divider />
          {mergeFields.length > 0 && (
            <ToolSelect
              title="Insert a field filled in for each person"
              value=""
              onChange={(key) => key && insertAndReveal(() => editor.chain().focus().insertContent(`{{${key}}}`).run())}
              className="w-[8rem]"
            >
              <option value="">+ Insert field</option>
              {mergeFields.map((f) => (
                <option key={f.key} value={f.key} title={f.label}>
                  {`{{${f.key}}}`}
                </option>
              ))}
            </ToolSelect>
          )}
        </div>

        {/* Row 2 — paragraphs, lists, tables, page */}
        <div className="flex flex-wrap items-center gap-1">
          {(["left", "center", "right", "justify"] as const).map((a) => (
            <ToolbarButton
              key={a}
              title={`Align ${a}`}
              active={state.align === a}
              onClick={() => (state.align === a ? chain().unsetTextAlign().run() : chain().setTextAlign(a).run())}
            >
              <AlignIcon align={a} />
            </ToolbarButton>
          ))}
          <ToolSelect
            title="Line spacing"
            value={state.lineHeight}
            onChange={(v) => chain().setBlockFormat("lineHeight", v ? Number(v) : null).run()}
            className="w-[6.5rem]"
          >
            <option value="">Line spacing</option>
            {LINE_SPACINGS.map((s) => (
              <option key={s.value} value={String(s.value)}>
                {s.label}
              </option>
            ))}
          </ToolSelect>
          <ToolSelect
            title="Space above the paragraph (points)"
            value={state.spaceBefore}
            onChange={(v) => chain().setBlockFormat("spaceBefore", v === "" ? null : Number(v)).run()}
            className="w-[5.5rem]"
          >
            <option value="">Above</option>
            {SPACINGS.map((s) => (
              <option key={s} value={String(s)}>
                ↑ {s} pt
              </option>
            ))}
          </ToolSelect>
          <ToolSelect
            title="Space below the paragraph (points)"
            value={state.spaceAfter}
            onChange={(v) => chain().setBlockFormat("spaceAfter", v === "" ? null : Number(v)).run()}
            className="w-[5.5rem]"
          >
            <option value="">Below</option>
            {SPACINGS.map((s) => (
              <option key={s} value={String(s)}>
                ↓ {s} pt
              </option>
            ))}
          </ToolSelect>
          <ToolbarButton title="Decrease indent (Shift+Tab)" disabled={!state.canOutdent} onClick={() => chain().outdent().run()}>
            ⇤
          </ToolbarButton>
          <ToolbarButton title="Increase indent (Tab)" disabled={!state.canIndent} onClick={() => chain().indent().run()}>
            ⇥
          </ToolbarButton>
          <ColorMenu
            title="Rule under the paragraph"
            label="▁"
            swatch={state.rule}
            clearLabel="No rule (a heading keeps its theme rule)"
            onPick={(c) => chain().setBlockFormat("rule", c).run()}
          />
          <ColorMenu
            title="Paragraph shading"
            label="▦"
            swatch={state.shade}
            clearLabel="No shading"
            onPick={(c) => chain().setBlockFormat("shade", c).run()}
          />
          <Divider />
          <ToolSelect title="Bullets and numbering" value={state.listStyle || "none"} onChange={setListStyle} className="w-[8.5rem]">
            <option value="none">No list</option>
            <optgroup label="Bullets">
              <option value="bullet:">• Template bullet</option>
              {BULLET_SHAPES.map((b) => (
                <option key={b} value={`bullet:${b}`}>
                  {BULLET_LABELS[b]}
                </option>
              ))}
            </optgroup>
            <optgroup label="Numbering">
              <option value="number:">1. Template numbering</option>
              {NUMBER_FORMATS.map((n) => (
                <option key={n} value={`number:${n}`}>
                  {NUMBER_LABELS[n]}
                </option>
              ))}
            </optgroup>
          </ToolSelect>
          <ColorMenu
            title="Bullet or number colour"
            label="•"
            disabled={!state.inBullet && !state.inOrdered}
            swatch={state.markerColor}
            clearLabel="Template colour"
            onPick={(c) => chain().updateAttributes(state.inOrdered ? "orderedList" : "bulletList", { markerColor: c }).run()}
          />
          <Divider />
          {paymentChart && (
            <ToolbarButton
              wide
              title="Insert the itemized payment chart — auto-filled with this student's actual fee, installments, and discount at generation time. Use this instead of typing your own fee table."
              onClick={() =>
                insertAndReveal(() =>
                  editor
                    .chain()
                    .focus()
                    .insertContent({ type: "paragraph", content: [{ type: "text", text: "{{fee_table}}" }] })
                    .run()
                )
              }
            >
              + Payment Chart
            </ToolbarButton>
          )}
          <ToolbarButton
            wide
            title="Insert table"
            onClick={() => insertAndReveal(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
          >
            + Table
          </ToolbarButton>
          <ToolbarButton wide title="Horizontal line" onClick={() => insertAndReveal(() => editor.chain().focus().setHorizontalRule().run())}>
            ― Line
          </ToolbarButton>
          <ToolbarButton wide title="Start a new page here" onClick={() => insertAndReveal(() => editor.chain().focus().insertPageBreak().run())}>
            ⤓ Page break
          </ToolbarButton>
          <Divider />
          <ToolSelect title="Zoom" value={zoom} onChange={setZoom} className="w-[4.5rem]">
            <option value="1">100%</option>
            <option value="1.25">125%</option>
            <option value="1.5">150%</option>
          </ToolSelect>
        </div>

        {/* Row 3 — only inside a table */}
        {state.inTable && (
          <div className="flex flex-wrap items-center gap-1 border-t border-border pt-1">
            <span className="px-1 text-xs text-muted">Table:</span>
            <ToolbarButton wide title="Add a row above" onClick={() => chain().addRowBefore().run()}>
              + Row above
            </ToolbarButton>
            <ToolbarButton wide title="Add a row below" onClick={() => chain().addRowAfter().run()}>
              + Row below
            </ToolbarButton>
            <ToolbarButton wide title="Add a column to the left" onClick={() => chain().addColumnBefore().run()}>
              + Col left
            </ToolbarButton>
            <ToolbarButton wide title="Add a column to the right" onClick={() => chain().addColumnAfter().run()}>
              + Col right
            </ToolbarButton>
            <ToolbarButton wide title="Delete this row" onClick={() => chain().deleteRow().run()}>
              − Row
            </ToolbarButton>
            <ToolbarButton wide title="Delete this column" onClick={() => chain().deleteColumn().run()}>
              − Col
            </ToolbarButton>
            <ToolbarButton wide title="Make the first row a header row, or an ordinary one" onClick={() => chain().toggleHeaderRow().run()}>
              Header row
            </ToolbarButton>
            <ColorMenu
              title="Cell colour (the selected cells)"
              label="▦"
              swatch={state.cellFill}
              clearLabel="No cell colour"
              onPick={(c) => chain().setCellAttribute("fill", c).run()}
            />
            <ColorMenu
              title="Table line colour"
              label="▭"
              swatch={state.tableBorder}
              clearLabel="Template line colour"
              onPick={(c) => chain().updateAttributes("table", { border: c }).run()}
            />
            <ToolbarButton wide title="Delete the table" onClick={() => chain().deleteTable().run()}>
              Delete table
            </ToolbarButton>
            <span className="px-1 text-xs text-muted">Drag a column&apos;s edge to change its width.</span>
          </div>
        )}
      </div>

      {/* The page, in the template's look. */}
      <div className="agreement-desk overflow-x-auto rounded-b-md p-4">
        <div
          className="agreement-paper mx-auto"
          data-bullet={look.bullet}
          data-numbering={look.numbering}
          style={{ ...look.vars, width: look.pageWidthPx, padding: `${Math.round(look.marginPx * 0.7)}px ${look.marginPx}px`, zoom: Number(zoom) } as React.CSSProperties}
        >
          <div className="agreement-letterhead" aria-hidden style={theme ? { borderBottom: `${theme.header.ruleWidth}pt solid ${theme.header.ruleColor}` } : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND_LOGO_DATA_URI} alt="" />
            <span className="agreement-letterhead-title" style={theme ? { color: theme.header.titleColor, fontSize: `${theme.header.titleSize}pt` } : undefined}>
              HMARK Consultants
              <br />
              {theme?.header.title || headerTitle}
            </span>
            <span className="agreement-letterhead-page" style={theme ? { color: theme.header.pageNumberColor, fontSize: `${theme.header.pageNumberSize}pt` } : undefined}>
              1
            </span>
          </div>
          <p className="agreement-fixed-note" aria-hidden>
            The details chart, &ldquo;AND&rdquo; and the office address print here on every agreement.
          </p>
          <EditorContent editor={editor} />
          <p className="agreement-fixed-note" aria-hidden>
            The signature block, the date and the signature box on each page are added when the PDF is generated.
          </p>
        </div>
      </div>
      {/* Server actions read this hidden field's value as the submitted wording.
          Reads `content` (kept in sync via onUpdate/setContent below) rather than
          editor.getHTML() directly: tiptap v3's useEditor no longer re-renders on
          every transaction by default, so a content push that lands outside a
          keystroke (e.g. a .docx upload calling setContent in an effect) would
          otherwise never make it into this input. */}
      <input type="hidden" name={name} value={content} readOnly />
    </div>
  );
}

function AlignIcon({ align }: { align: "left" | "center" | "right" | "justify" }) {
  const lines = align === "justify" ? [12, 12, 12, 12] : [12, 8, 12, 8];
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      {lines.map((w, i) => {
        const x = align === "left" || align === "justify" ? 0 : align === "right" ? 12 - w : (12 - w) / 2;
        return <rect key={i} x={x} y={1 + i * 3} width={w} height="1.4" fill="currentColor" />;
      })}
    </svg>
  );
}
