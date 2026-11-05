import { useEffect, useState } from "react";

export function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    let media: MediaQueryList | undefined;
    const update = () => {
      const next = window.devicePixelRatio || 1;
      setRatio(next);
      media?.removeEventListener("change", update);
      media = window.matchMedia(`(resolution: ${next}dppx)`);
      media.addEventListener("change", update);
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      media?.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return ratio;
}
