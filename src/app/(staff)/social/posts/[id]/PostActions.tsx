"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitForApproval, approvePost, rejectPost, duplicateSocialPost, deleteSocialPost } from "@/lib/actions/socialPosts";
import { Button } from "@/components/ui/Button";
import type { PostStatus } from "@/lib/social/types";

export function PostActions({ postId, status, canManage, canApprove }: { postId: string; status: PostStatus; canManage: boolean; canApprove: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string } | undefined>, after?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else (after ?? (() => router.refresh()))();
    });
  };

  const deletable = status === "draft" || status === "scheduled" || status === "failed";
  const buttons: React.ReactNode[] = [];

  if (status === "draft" && canManage) {
    buttons.push(<Button key="submit" type="button" variant="primary" size="sm" pending={pending} disabled={pending} onClick={() => run(() => submitForApproval(postId))}>Submit for approval</Button>);
  }
  if (status === "pending_approval" && canApprove) {
    buttons.push(<Button key="approve" type="button" variant="primary" size="sm" pending={pending} disabled={pending} onClick={() => run(() => approvePost(postId))}>Approve</Button>);
    buttons.push(
      <Button key="reject" type="button" variant="danger" size="sm" pending={pending} disabled={pending}
        onClick={() => { const reason = window.prompt("Send back to the author — reason:"); if (reason != null) run(() => rejectPost(postId, reason)); }}>
        Send back
      </Button>,
    );
  }
  if (canManage) {
    buttons.push(<Button key="dup" type="button" variant="outline" size="sm" pending={pending} disabled={pending} onClick={() => run(() => duplicateSocialPost(postId), () => router.refresh())}>Duplicate</Button>);
  }
  if (deletable && canManage) {
    buttons.push(
      <Button key="del" type="button" variant="outline" size="sm" pending={pending} disabled={pending}
        onClick={() => { if (window.confirm("Delete this post?")) run(() => deleteSocialPost(postId), () => router.push("/social/posts")); }}>
        Delete
      </Button>,
    );
  }

  if (buttons.length === 0 && !error) return null;

  return (
    <div className="flex flex-col gap-2" data-post-actions>
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {error && <p className="text-xs text-danger" data-action-error>{error}</p>}
    </div>
  );
}
