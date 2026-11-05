/**
 * Card — molecular: an <article> inside a list item. The heading link is
 * stretched over the card in CSS, so there is one link and one tab stop.
 * Composition over configuration: extra content goes in `children`.
 */
import type { ReactNode } from "react";

type Level = 2 | 3 | 4;

interface CardProps {
  title: string;
  href: string;
  /** Heading level that fits the surrounding outline. */
  level?: Level;
  image?: { src: string; width: number; height: number };
  meta?: ReactNode;
  children?: ReactNode;
}

export function Card({ title, href, level = 3, image, meta, children }: CardProps) {
  const H = `h${level}` as const;
  return (
    <article className="card">
      {/* decorative: the heading names the card */}
      {image && <img src={image.src} width={image.width} height={image.height} alt="" loading="lazy" />}
      <H>
        <a href={href}>{title}</a>
      </H>
      {children}
      {meta && <footer>{meta}</footer>}
    </article>
  );
}

export function CardList({ label, children }: { label: string; children: ReactNode[] }) {
  return (
    <ul className="cards grid" aria-label={label}>
      {children.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  );
}
