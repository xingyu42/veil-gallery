import { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
}

/**
 * CSS multi-column masonry.
 * Breakpoints (viewport):
 *  - default: 1
 *  - sm (640+): 2
 *  - md (768+): 3
 *  - lg (1024+): 4  ← fixed 4 columns on desktop, no xl flip
 */
export default function Masonry({ children, className = "" }: Props) {
  return (
    <div
      className={`columns-1 gap-4 sm:columns-2 md:columns-3 lg:columns-4 ${className}`}
      style={{ columnFill: "balance" }}
    >
      {children}
    </div>
  );
}
