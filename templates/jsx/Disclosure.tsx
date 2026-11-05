/**
 * Disclosure / Accordion — native <details>. Uncontrolled by default: the
 * browser owns open state, keyboard, find-in-page. `group` makes an exclusive
 * accordion (details[name]). Height animation is CSS (::details-content).
 */
import type { ReactNode } from "react";

interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  /** Same `group` on siblings → only one open at a time. */
  group?: string;
  defaultOpen?: boolean;
}

export function Disclosure({ summary, children, group, defaultOpen }: DisclosureProps) {
  return (
    <details name={group} open={defaultOpen}>
      <summary>{summary}</summary>
      {children}
    </details>
  );
}

export function Accordion({ name, items }: { name: string; items: ReadonlyArray<{ id: string; summary: ReactNode; body: ReactNode }> }) {
  return (
    <>
      {items.map((it, i) => (
        <Disclosure key={it.id} group={name} summary={it.summary} defaultOpen={i === 0}>
          {it.body}
        </Disclosure>
      ))}
    </>
  );
}
