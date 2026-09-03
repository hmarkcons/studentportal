"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { useEffect } from "react";

// Matches INDENT_STEP_PX in src/lib/pdf/templateWording.ts, which reads this
// same margin-left back out when converting wording to PDF blocks.
const INDENT_STEP_PX = 24;
const MAX_INDENT = 8;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      /** Increase the current paragraph/heading's left margin one step. */
      indent: () => ReturnType;
      /** Decrease the current paragraph/heading's left margin one step. */
      outdent: () => ReturnType;
    };
  }
}

// Word-style "Increase/Decrease Indent" for a whole paragraph or heading —
// distinct from list nesting (sinkListItem/liftListItem below), which moves
// a list item into/out of a sub-list instead of just shifting its margin.
const Indent = Extension.create({
  name: "indent",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element: HTMLElement) => {
              const level = Math.round(parseInt(element.style.marginLeft || "0", 10) / INDENT_STEP_PX);
              return Number.isFinite(level) && level > 0 ? level : 0;
            },
            renderHTML: (attributes: { indent?: number }) =>
              attributes.indent ? { style: `margin-left: ${attributes.indent * INDENT_STEP_PX}px` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      indent:
        () =>
        ({ editor, chain }) => {
          const type = ["paragraph", "heading"].find((t) => editor.isActive(t));
          if (!type) return false;
          const current = Number(editor.getAttributes(type).indent ?? 0);
          if (current >= MAX_INDENT) return false;
          return chain().updateAttributes(type, { indent: current + 1 }).run();
        },
      outdent:
        () =>
        ({ editor, chain }) => {
          const type = ["paragraph", "heading"].find((t) => editor.isActive(t));
          if (!type) return false;
          const current = Number(editor.getAttributes(type).indent ?? 0);
          if (current <= 0) return false;
          return chain().updateAttributes(type, { indent: current - 1 }).run();
        },
    };
  },
  addKeyboardShortcuts() {
    return {
      // Inside a list, Tab/Shift-Tab nests the item into/out of a sub-list
      // (same as MS Word); otherwise they shift the whole paragraph's margin.
      Tab: () => (this.editor.isActive("listItem") ? this.editor.commands.sinkListItem("listItem") : this.editor.commands.indent()),
      "Shift-Tab": () => (this.editor.isActive("listItem") ? this.editor.commands.liftListItem("listItem") : this.editor.commands.outdent()),
    };
  },
});

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-primary text-primary-ink" : "border border-border text-ink hover:bg-bg"
      }`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({
  name,
  content,
  onChangeHtml,
}: {
  name: string;
  content: string;
  onChangeHtml?: (html: string) => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Table.configure({ resizable: false }), TableRow, TableHeader, TableCell, Indent],
    content,
    editorProps: {
      attributes: {
        class: "prose-agreement min-h-[220px] rounded-b-md border border-t-0 border-border bg-card p-3 text-sm text-ink focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => onChangeHtml?.(editor.getHTML()),
  });

  // The wording can be replaced wholesale (e.g. a .docx re-upload) after the
  // editor already mounted — sync it in without recreating the editor.
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) return null;

  // Inserted content can land outside the currently visible area (e.g. the
  // cursor was left scrolled off-screen) — without this, clicking a toolbar
  // button can look like it did nothing even though it worked.
  function insertAndReveal(run: () => boolean) {
    run();
    requestAnimationFrame(() => editor!.commands.scrollIntoView());
  }

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-t-md border border-border bg-bg p-1.5">
        <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          B
        </ToolbarButton>
        <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          I
        </ToolbarButton>
        <ToolbarButton title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          U
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          title="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolbarButton>
        <ToolbarButton
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <ToolbarButton title="Paragraph" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>
          P
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          title="Bulleted list — press Tab on an item to make it a sub-bullet, Shift+Tab to bring it back out"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list — press Tab on an item to make it a sub-item, Shift+Tab to bring it back out"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </ToolbarButton>
        <ToolbarButton
          title="Decrease indent"
          disabled={!editor.can().outdent()}
          onClick={() => editor.chain().focus().outdent().run()}
        >
          ← Indent
        </ToolbarButton>
        <ToolbarButton
          title="Increase indent"
          disabled={!editor.can().indent()}
          onClick={() => editor.chain().focus().indent().run()}
        >
          → Indent
        </ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
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
        <ToolbarButton
          title="Insert table"
          onClick={() => insertAndReveal(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
        >
          + Table
        </ToolbarButton>
        <ToolbarButton title="Add row" disabled={!editor.can().addRowAfter()} onClick={() => editor.chain().focus().addRowAfter().run()}>
          +Row
        </ToolbarButton>
        <ToolbarButton title="Add column" disabled={!editor.can().addColumnAfter()} onClick={() => editor.chain().focus().addColumnAfter().run()}>
          +Col
        </ToolbarButton>
        <ToolbarButton title="Delete row" disabled={!editor.can().deleteRow()} onClick={() => editor.chain().focus().deleteRow().run()}>
          −Row
        </ToolbarButton>
        <ToolbarButton title="Delete column" disabled={!editor.can().deleteColumn()} onClick={() => editor.chain().focus().deleteColumn().run()}>
          −Col
        </ToolbarButton>
        <ToolbarButton title="Delete table" disabled={!editor.can().deleteTable()} onClick={() => editor.chain().focus().deleteTable().run()}>
          −Table
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
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
