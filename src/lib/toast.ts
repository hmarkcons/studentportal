// A confirmation for an action whose button is gone by the time it is done.
//
// "Saved." belongs beside the button that saved (see ActionStatus). But a
// delete removes the row its button sat in, and a submit that moves to another
// page takes the button with it — there is nowhere left to say it. So those
// say it here, in a toast the root layout keeps mounted across navigation.
//
// A module-level store rather than a React context, so that anything can raise
// one — a hook, a plain handler — without being inside a provider, and so the
// toast survives the component that raised it unmounting, which for a delete
// is the normal case rather than the edge one. Pure apart from the timers, so
// the queue rules are unit-tested (scripts/toast-test.mjs).

export type ToastTone = "success" | "danger";
export type Toast = { id: number; message: string; tone: ToastTone };

/** Long enough to read two short sentences; short enough not to pile up. */
export const TOAST_MS = 4000;

/** More than this and the oldest go: a burst of deletes is one message's worth of news. */
export const MAX_TOASTS = 3;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<(toasts: Toast[]) => void>();

function publish() {
  for (const listener of listeners) listener(toasts);
}

export function dismissToast(id: number) {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) publish();
}

/** Shows a message for TOAST_MS. The same message already showing is restarted, not stacked. */
export function toast(message: string, tone: ToastTone = "success"): number {
  const text = message.trim();
  if (!text) return 0;
  toasts = toasts.filter((t) => !(t.message === text && t.tone === tone));
  const id = nextId++;
  toasts = [...toasts, { id, message: text, tone }].slice(-MAX_TOASTS);
  publish();
  if (typeof setTimeout === "function") setTimeout(() => dismissToast(id), TOAST_MS);
  return id;
}

export function subscribeToasts(listener: (toasts: Toast[]) => void): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

export function currentToasts(): Toast[] {
  return toasts;
}
