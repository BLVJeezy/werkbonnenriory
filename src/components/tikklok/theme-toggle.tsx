import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "dark" | "light";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", t === "dark");
  root.classList.toggle("light", t === "light");
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (localStorage.getItem("riory-theme") as Theme | null) ?? "dark";
    setTheme(stored);
    applyTheme(stored);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem("riory-theme", next);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      className={className}
      aria-label={theme === "dark" ? "Lichte modus" : "Donkere modus"}
      title={theme === "dark" ? "Lichte modus" : "Donkere modus"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
