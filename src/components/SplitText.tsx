import type { ElementType } from "react";

type Props = {
  text: string;
  as?: ElementType;
  className?: string;
  /** mask each word so letters can rise from below the baseline */
  mask?: boolean;
};

/** Splits text into word and char spans for GSAP. Screen readers get the plain string. */
export function SplitText({ text, as: Tag = "span", className, mask = true }: Props) {
  const words = text.split(" ");
  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, wi) => (
        <span key={wi} aria-hidden className={mask ? "line-mask" : "inline-block"}>
          {[...word].map((c, ci) => (
            <span key={ci} className="split-char">
              {c}
            </span>
          ))}
          {wi < words.length - 1 ? <span className="split-char">&nbsp;</span> : null}
        </span>
      ))}
    </Tag>
  );
}
