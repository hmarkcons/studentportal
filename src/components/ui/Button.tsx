import { forwardRef } from "react";

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

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    pending?: boolean;
  }
>(function Button({ variant = "outline", size = "md", pending = false, disabled, className = "", children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || pending}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {pending ? "…" : children}
    </button>
  );
});
