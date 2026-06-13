// useViewport — track window width + signal "mobile" layout. < 880px = mobile.
import { useEffect, useState } from "react";

export function useViewport() {
  const [w, setW] = useState(typeof window === "undefined" ? 1200 : window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return { width: w, isMobile: w < 880 };
}
