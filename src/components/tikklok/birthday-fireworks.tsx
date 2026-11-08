import { useEffect, useRef } from 'react';
// Canvas is painted only after hydration; particles use the current theme colors.
export function BirthdayFireworks() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const colors = ['--primary', '--primary-glow', '--foreground'].map(t => getComputedStyle(document.documentElement).getPropertyValue(t).trim());
    let particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
    const resize = () => { canvas.width = canvas.clientWidth * devicePixelRatio; canvas.height = canvas.clientHeight * devicePixelRatio; };
    resize();
    const burst = () => {
      const x = canvas.width * (0.2 + Math.random() * 0.6), y = canvas.height * (0.2 + Math.random() * 0.35);
      for (let i = 0; i < 55; i++) { const angle = i * Math.PI * 2 / 55, speed = (1 + Math.random() * 2.5) * devicePixelRatio; particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, color: colors[i % colors.length] ?? colors[0] ?? '' }); }
    };
    burst();
    let frame = 0, previous = 0, lastBurst = 0;
    const draw = (time: number) => {
      const dt = Math.min((time - previous) / 16.67 || 1, 2); previous = time;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!reduced && time - lastBurst > 1000) { burst(); lastBurst = time; }
      for (const p of particles) {
        ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2 * devicePixelRatio, 0, Math.PI * 2); ctx.fill();
        if (!reduced) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.025 * dt; p.life -= 0.009 * dt; }
      }
      particles = particles.filter(p => p.life > 0);
      if (!reduced) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} aria-label="Verjaardagsvuurwerk" role="img" className="w-full h-40 pointer-events-none" />;
}