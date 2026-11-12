"use client";

import { useActionState, useState } from "react";
import { deleteContentBlock, saveContentBlock } from "@/lib/actions/emailBlocks";
import { useButtonAction } from "@/components/useButtonAction";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";

/** A block's editor: name, HTML, and a live look at it. New when `block` is null. */
export function BlockForm({ block, canManage }: { block: { id: string; key: string; name: string; html: string } | null; canManage: boolean }) {
  const [state, action, pending] = useActionState(saveContentBlock.bind(null, block?.id ?? null), undefined);
  const [html, setHtml] = useState(block?.html ?? "");
  const del = useButtonAction();
  return (
    <form action={action} className="flex flex-col gap-3" data-block-form={block?.key ?? "new"}>
      <fieldset disabled={!canManage} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Name
            <Input name="name" defaultValue={block?.name ?? ""} required maxLength={80} placeholder="e.g. Footer with social icons" />
          </label>
          {block ? (
            <p className="text-xs text-muted">
              Put it in a template with <code className="rounded bg-bg px-1 text-ink">{`{{block:${block.key}}}`}</code>
            </p>
          ) : (
            <label className="flex flex-col gap-1 text-xs text-muted">
              Key <span className="text-[10px]">(optional — made from the name; what a template writes, as {"{{block:key}}"})</span>
              <Input name="key" maxLength={40} placeholder="footer" />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted">
            HTML
            <Textarea name="html" rows={10} value={html} onChange={(e) => setHtml(e.target.value)} required className="font-mono text-xs" />
          </label>
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted">
          How it looks
          <iframe title="Block preview" sandbox="" srcDoc={html} className="h-64 w-full rounded-md border border-border bg-white" />
        </div>
      </fieldset>
      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" variant="primary" pending={pending} status={{ state, label: state && "success" in state ? state.message : "Saved." }}>
            {block ? "Save block" : "Add block"}
          </Button>
          {state && "error" in state && <p className="text-xs text-danger">{state.error}</p>}
          {block && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              pending={del.pending}
              status={{ state: del.state, label: "Deleted.", showError: true }}
              onClick={async () => {
                if (confirm(`Delete the block? Templates that use {{block:${block.key}}} will show the tag instead, and campaigns using it will not send.`)) await del.run(() => deleteContentBlock(block.id));
              }}
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
