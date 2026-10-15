"use client";

import { useEffect, useRef } from "react";

/** Animated backdrop of the public pages: soft blobs, a panning grid and slow random-walk "ticker" lines. */
export function TickerBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const STEP = 14;
    type Line = { y: number; vol: number; speed: number; alpha: number; width: number; pts: number[]; off: number };
    let w = 0;
    let h = 0;
    let color = "#0f8a4f";
    let series: Line[] = [];
    let raf = 0;

    const readColor = () => {
      color = getComputedStyle(canvas).getPropertyValue("--accent").trim() || color;
    };
    const walk = (n: number, vol: number) => {
      const pts: number[] = [];
      let v = 0;
      for (let i = 0; i < n; i++) {
        v += (Math.random() - 0.47) * vol;
        pts.push(v);
      }
      return pts;
    };
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.ceil(w / STEP) + 2;
      series = [
        { y: h * 0.78, vol: 10, speed: 0.25, alpha: 0.18, width: 1.5 },
        { y: h * 0.9, vol: 14, speed: 0.4, alpha: 0.12, width: 1.2 },
        { y: h * 0.66, vol: 7, speed: 0.15, alpha: 0.08, width: 1 },
      ].map((s) => ({ ...s, pts: walk(n, s.vol), off: 0 }));
    };
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = color;
      for (const s of series) {
        s.off += s.speed;
        if (s.off >= STEP) {
          s.off -= STEP;
          s.pts.shift();
          const last = s.pts[s.pts.length - 1];
          // Gentle pull back toward the baseline so lines stay on screen.
          s.pts.push(last + (Math.random() - 0.47) * s.vol - last * 0.02);
        }
        ctx.globalAlpha = s.alpha;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        s.pts.forEach((p, i) => {
          const x = i * STEP - s.off;
          if (i) ctx.lineTo(x, s.y + p);
          else ctx.moveTo(x, s.y + p);
        });
        ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    const scheme = matchMedia("(prefers-color-scheme: dark)");

    readColor();
    resize();
    addEventListener("resize", resize);
    scheme.addEventListener("change", readColor);
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      scheme.removeEventListener("change", readColor);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="bg" aria-hidden>
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="grid" />
      <canvas ref={canvasRef} />
    </div>
  );
}
