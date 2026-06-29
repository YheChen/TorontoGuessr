"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle color theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn("relative overflow-hidden rounded-full", className)}
    >
      {/* Render a stable icon until mounted to avoid hydration mismatch. */}
      <Sun
        className={
          mounted && !isDark
            ? "size-[1.15rem] rotate-0 scale-100 transition-all duration-300"
            : "absolute size-[1.15rem] -rotate-90 scale-0 transition-all duration-300"
        }
      />
      <Moon
        className={
          !mounted || isDark
            ? "size-[1.15rem] rotate-0 scale-100 transition-all duration-300"
            : "absolute size-[1.15rem] rotate-90 scale-0 transition-all duration-300"
        }
      />
    </Button>
  );
}
