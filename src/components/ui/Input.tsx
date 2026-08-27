import { forwardRef } from "react";

const baseClass = "w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-primary disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = "", ...rest },
  ref
) {
  return <input ref={ref} className={`${baseClass} ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className = "", ...rest },
  ref
) {
  return <textarea ref={ref} className={`${baseClass} ${className}`} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = "", ...rest },
  ref
) {
  return <select ref={ref} className={`${baseClass} ${className}`} {...rest} />;
});
