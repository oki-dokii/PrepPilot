"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-8 w-8 rounded-sm bg-background border border-border animate-pulse" />;
  }

  const toggleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  return (
    <button
      onClick={toggleTheme}
      className="h-8 w-8 grid place-items-center rounded-sm border border-border bg-background text-foreground hover:bg-muted transition-colors"
      title="Toggle theme"
    >
      {theme === "light" && <Sun size={14} />}
      {theme === "dark" && <Moon size={14} />}
      {theme === "system" && <Monitor size={14} />}
    </button>
  );
}
