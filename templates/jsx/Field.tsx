/**
 * Field — molecular: label + control + hint + error, wired with ids.
 * Native constraint validation drives :user-invalid styling; the error text
 * is linked via aria-describedby and revealed by CSS (.field:has(:user-invalid)).
 */
import { type InputHTMLAttributes, type ReactNode, useId } from "react";

type InputType = "text" | "email" | "tel" | "url" | "password" | "search" | "number" | "date" | "time";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "style" | "type" | "id"> {
  label: ReactNode;
  type?: InputType;
  hint?: ReactNode;
  /** Message shown when the field is invalid (native or `invalid`). */
  error?: ReactNode;
  /** Server-side/cross-field invalid state → aria-invalid. */
  invalid?: boolean;
}

export function Field({ label, type = "text", hint, error, invalid, required, ...input }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required && <small> (required)</small>}
      </label>
      <input {...input} id={id} type={type} required={required} aria-invalid={invalid || undefined} aria-describedby={describedBy} />
      {hint && <small id={hintId}>{hint}</small>}
      {error && (
        <p id={errId} className="error">
          {error}
        </p>
      )}
    </div>
  );
}
