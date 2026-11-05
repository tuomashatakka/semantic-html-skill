/**
 * Dialog — layout view over the native <dialog>. Opening/closing is done by
 * the platform via invoker commands; no open state, no portal, no focus-trap
 * library, no motion library (enter/exit animates in components.css).
 *
 *   <DialogTrigger target="edit">Edit</DialogTrigger>
 *   <Dialog id="edit" title="Edit profile" onClose={(v) => v === "save" && save()}>…</Dialog>
 */
import { type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "./Button.tsx";

interface DialogProps {
  id: string;
  title: string;
  children: ReactNode;
  /** Footer actions; each submit button's `value` becomes the returnValue. */
  actions?: ReactNode;
  /** Light dismiss: "any" (click outside + Esc), "closerequest" (Esc), "none". */
  closedBy?: "any" | "closerequest" | "none";
  alert?: boolean;
  onClose?: (returnValue: string) => void;
}

export function Dialog({ id, title, children, actions, closedBy = "closerequest", alert = false, onClose }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el || !onClose) return;
    const handler = () => onClose(el.returnValue);
    el.addEventListener("close", handler);
    return () => el.removeEventListener("close", handler);
  }, [onClose]);

  return (
    <dialog ref={ref} id={id} aria-labelledby={titleId} role={alert ? "alertdialog" : undefined} {...{ closedby: closedBy }}>
      <form method="dialog">
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ghost" {...{ command: "close", commandfor: id }} aria-label="Close">
            ✕
          </button>
        </header>
        <div>{children}</div>
        {actions && <footer>{actions}</footer>}
      </form>
    </dialog>
  );
}

export function DialogTrigger({ target, children, variant }: { target: string; children: ReactNode; variant?: "primary" | "danger" }) {
  // `command`/`commandfor` are standard HTML attributes; spread them until React's DOM types include them.
  return (
    <Button variant={variant} {...{ command: "show-modal", commandfor: target }}>
      {children}
    </Button>
  );
}
