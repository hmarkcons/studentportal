import { forwardRef } from "react";
import { ActionStatus } from "@/components/ActionStatus";
import type { ActionResultLike } from "@/lib/actionStatus";

export const VARIANT_CLASSES = {
  primary: "border border-transparent bg-primary text-primary-ink hover:opacity-90",
  outline: "border border-border text-ink hover:bg-bg",
  "outline-primary": "border border-primary text-primary hover:bg-primary/10",
  danger: "border border-danger text-danger hover:bg-danger-bg",
  success: "border border-success text-success hover:bg-success-bg",
  ghost: "border border-transparent text-muted hover:bg-bg",
} as const;

export const SIZE_CLASSES = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
  lg: "px-4 py-2 text-sm",
} as const;

export type ButtonVariant = keyof typeof VARIANT_CLASSES;
export type ButtonSize = keyof typeof SIZE_CLASSES;

/** What happened when this button was last used, said beside it. */
export type ButtonStatus = {
  state: ActionResultLike;
  /** Past tense: "Saved.", "Sent.", "Approved.". */
  label?: string;
  /**
   * Also say the error beside the button. Off by default because most forms
   * already show their error above the fields it concerns, and two copies of
   * one error is noise; on for a button with nowhere else to say it.
   */
  showError?: boolean;
};

/**
 * A width the caller chose on purpose. Anything else gets `w-fit`.
 *
 * `w-fit` is what keeps a button the width of its text. The stretching came
 * from its container, never from the button: a flex column or a grid cell
 * stretches whatever it holds unless that thing has a width of its own — which
 * is why the Save button on a student's profile ran the width of the page, and
 * why a `justify-self-start` on it did nothing (that is a grid property, and
 * the form was a flex column). A width on the button beats the stretch in both,
 * and unlike `self-start` it does not move the button on the cross axis, so a
 * row of inputs and a button aligned to their bottom edge stays aligned.
 */
const CHOSEN_WIDTH = /(^|\s)(w-|min-w-|flex-1|flex-auto|grow|basis-)/;

function Spinner() {
  return (
    <svg className="absolute h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The button, and — when given a `status` — what it last did, beside it.
 *
 * While `pending` the label is hidden behind a spinner rather than replaced:
 * the button keeps exactly its width, so nothing beside it jumps, and the
 * label stays in the accessibility tree (opacity, not visibility), so a screen
 * reader still announces "Save, busy" rather than an unnamed button.
 */
export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    pending?: boolean;
    status?: ButtonStatus;
    /** Classes for the wrapper that holds the button and its status, when there is one. */
    wrapperClassName?: string;
  }
>(function Button(
  { variant = "outline", size = "md", pending = false, disabled, className = "", children, status, wrapperClassName = "", ...rest },
  ref
) {
  const width = CHOSEN_WIDTH.test(className) ? "" : "w-fit";
  const button = (
    <button
      ref={ref}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${width} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {/* Wrapped only while busy: a button that lays out its own children —
          a label and a chevron pushed apart with justify-between — needs them
          as its direct flex items the rest of the time. */}
      {pending ? (
        <>
          <Spinner />
          <span className="inline-flex items-center gap-1.5 opacity-0">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );

  if (!status) return button;
  return (
    <span className={`inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 ${wrapperClassName}`}>
      {button}
      <ActionStatus state={status.state} pending={pending} label={status.label} showError={status.showError} />
    </span>
  );
});
