/**
 * Button — atomic. Renders a real <button> (or <a> when it navigates).
 * Props carry semantics + behaviour; appearance comes from CSS variants
 * (`button.primary` in components.css). No className / style props.
 */
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Common {
  variant?: Variant;
  /** Shows a CSS spinner via [aria-busy] and blocks double submits. */
  busy?: boolean;
  children: ReactNode;
}

type AsButton = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "children"> & { href?: never };
type AsLink = Common & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "style" | "children"> & { href: string };

export function Button(props: AsButton | AsLink) {
  const { variant = "secondary", busy = false, children, ...rest } = props;
  const cls = variant === "secondary" ? undefined : variant;

  if ("href" in rest && rest.href !== undefined) {
    // Links go places: keep it an <a>, styled like a button.
    const link = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a {...link} className={["button", cls].filter(Boolean).join(" ")}>
        {children}
      </a>
    );
  }
  const { type = "button", ...button } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button {...button} type={type} className={cls} aria-busy={busy || undefined} aria-disabled={busy || undefined}>
      {children}
    </button>
  );
}
