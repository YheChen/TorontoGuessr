import type React from "react";
import Link from "next/link";
import { Button, type ButtonProps } from "@/components/ui/button";
import { PLAY_PAUSED } from "@/lib/play-status";

interface PlayButtonProps extends Omit<ButtonProps, "asChild"> {
  href: string;
  children: React.ReactNode;
}

/**
 * A Button that links into a game, or a disabled one while play is paused.
 *
 * Paused, it is a real <button disabled> rather than a link with its click
 * swallowed: a link cannot be disabled, and it would stay focusable and still
 * open in a new tab.
 */
export function PlayButton({ href, children, ...props }: PlayButtonProps) {
  if (PLAY_PAUSED) {
    return (
      <Button type="button" {...props} disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button {...props} asChild>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
