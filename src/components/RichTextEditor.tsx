"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { useEffect } from "react";

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium ${
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
    extensions: [StarterKit, Table.configure({ resizable: false }), TableRow, TableHeader, TableCell],
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

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 rounded-t-md border border-border bg-bg p-1.5">
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
          title="Insert the itemized payment chart — auto-filled with this student's actual fee, installments, and discount at generation time. Use this instead of typing your own fee table."
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertContent({ type: "paragraph", content: [{ type: "text", text: "{{fee_table}}" }] })
              .run()
          }
        >
          + Payment Chart
        </ToolbarButton>
        <ToolbarButton
          title="Insert table"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          + Table
        </ToolbarButton>
        <ToolbarButton title="Add row" onClick={() => editor.chain().focus().addRowAfter().run()}>
          +Row
        </ToolbarButton>
        <ToolbarButton title="Add column" onClick={() => editor.chain().focus().addColumnAfter().run()}>
          +Col
        </ToolbarButton>
        <ToolbarButton title="Delete row" onClick={() => editor.chain().focus().deleteRow().run()}>
          −Row
        </ToolbarButton>
        <ToolbarButton title="Delete column" onClick={() => editor.chain().focus().deleteColumn().run()}>
          −Col
        </ToolbarButton>
        <ToolbarButton title="Delete table" onClick={() => editor.chain().focus().deleteTable().run()}>
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
