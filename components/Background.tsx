"use client";

import { useEffect, useRef } from "react";

export default function Background() {
  const pinkRef = useRef<HTMLDivElement>(null);
  const violetRef = useRef<HTMLDivElement>(null);
  const cyanRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      if (pinkRef.current)
        pinkRef.current.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
      if (violetRef.current)
        violetRef.current.style.transform = `translate(${x * -55}px, ${
          y * -55
        }px)`;
      if (cyanRef.current)
        cyanRef.current.style.transform = `translate(${x * 30}px, ${y * -30}px)`;
    };
    window.addEventListener("mousemove", handle);
    return () => window.removeEventListener("mousemove", handle);
  }, []);

  return (
    <>
      <div ref={pinkRef} className="orb orb-pink" />
      <div ref={violetRef} className="orb orb-violet" />
      <div ref={cyanRef} className="orb orb-cyan" />
      <div className="noise" />
    </>
  );
}
