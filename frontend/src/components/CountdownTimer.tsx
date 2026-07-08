"use client";

import { useEffect, useState, useRef } from "react";

interface CountdownTimerProps {
  expiresAt: string; // ISO string from server
  onExpire: () => void;
}

export function CountdownTimer({ expiresAt, onExpire }: CountdownTimerProps) {
  const calcRemaining = () => {
    const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    return Math.floor(diff / 1000);
  };

  const [remaining, setRemaining] = useState(calcRemaining);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const tick = setInterval(() => {
      const r = calcRemaining();
      setRemaining(r);
      if (r === 0) {
        onExpireRef.current();
        clearInterval(tick);
      }
    }, 500);
    return () => clearInterval(tick);
  }, [expiresAt]);

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  const warn = remaining < 5 * 60; // < 5 min

  return (
    <div
      className={
        "font-mono text-[22px] tabular-nums shrink-0 " +
        (warn ? "text-rust animate-pulse" : "text-chalk")
      }
      aria-live="polite"
    >
      {h > 0 ? `${pad(h)}:` : ""}{pad(m)}:{pad(s)}
    </div>
  );
}
