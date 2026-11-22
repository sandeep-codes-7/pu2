import React, { useRef, useEffect } from 'react';

/**
 * Reusable high-performance monochrome animated canvas background.
 * Renders a subtle interactive particle constellation paired with low-opacity
 * undulating wireframe waves, wrapped in a radial vignette mask.
 *
 * @param {object} props
 * @param {"dark" | "light"} [props.theme="dark"]
 * @param {number} [props.density=1] - Multiplier for particle count (0.4 to 2)
 * @param {number} [props.speed=1] - Multiplier for motion speed (0.2 to 2.5)
 * @param {string} [props.className=""]
 */
export default function MonochromeBackground({
  theme = 'dark',
  density = 1,
  speed = 1,
  className = '',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const isDark = theme === 'dark';
    const reducedMotionQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let prefersReducedMotion = Boolean(reducedMotionQuery?.matches);

    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = null;
    let resizeTimer = null;
    let isVisible = !document.hidden;
    let phase = 0;

    const pointer = { x: -9999, y: -9999, active: false };
    let particles = [];

    const clampedDensity = Math.max(0.4, Math.min(2, Number(density) || 1));
    const clampedSpeed = Math.max(0.2, Math.min(2.5, Number(speed) || 1));

    const initParticles = () => {
      const area = width * height;
      const baseCount = Math.floor((area / 22000) * clampedDensity);
      const count = Math.max(24, Math.min(95, baseCount));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28 * clampedSpeed,
        vy: (Math.random() - 0.5) * 0.28 * clampedSpeed,
        r: 1 + Math.random() * 1.15,
        alpha: 0.18 + Math.random() * 0.28,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initParticles();
    };

    const drawWaves = (t) => {
      const waveCount = 3;
      const strokeRgb = isDark ? '255, 255, 255' : '0, 0, 0';
      ctx.lineWidth = 1;

      for (let w = 0; w < waveCount; w++) {
        const yBase = height * (0.32 + w * 0.19);
        const amp = 16 + w * 9;
        const freq = 0.0022 + w * 0.00055;
        const speedOffset = t * (0.45 + w * 0.14);
        ctx.strokeStyle = `rgba(${strokeRgb}, ${isDark ? 0.055 - w * 0.01 : 0.045 - w * 0.008})`;
        ctx.beginPath();
        const step = Math.max(18, Math.floor(width / 64));
        for (let x = 0; x <= width + step; x += step) {
          const y =
            yBase +
            Math.sin(x * freq + speedOffset) * amp +
            Math.cos(x * freq * 0.5 - speedOffset * 0.6) * (amp * 0.45);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    const renderFrame = (shouldAdvance) => {
      ctx.clearRect(0, 0, width, height);

      // Base surface fill
      ctx.fillStyle = isDark ? '#0A0A0A' : '#FFFFFF';
      ctx.fillRect(0, 0, width, height);

      drawWaves(phase);

      const dotRgb = isDark ? '255, 255, 255' : '10, 10, 10';
      const linkDist = Math.min(150, Math.max(95, width * 0.11));
      const linkDistSq = linkDist * linkDist;
      const pointerRadius = 150;
      const pointerRadiusSq = pointerRadius * pointerRadius;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (shouldAdvance) {
          if (pointer.active) {
            const dx = p.x - pointer.x;
            const dy = p.y - pointer.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > 1 && distSq < pointerRadiusSq) {
              const dist = Math.sqrt(distSq);
              const push = ((pointerRadius - dist) / pointerRadius) * 0.045 * clampedSpeed;
              p.vx += (dx / dist) * push;
              p.vy += (dy / dist) * push;
            }
          }

          // Gentle velocity damping to preserve calm drift
          const maxV = 0.55 * clampedSpeed;
          const speedMag = Math.hypot(p.vx, p.vy);
          if (speedMag > maxV) {
            p.vx = (p.vx / speedMag) * maxV;
            p.vy = (p.vy / speedMag) * maxV;
          }

          p.x += p.vx;
          p.y += p.vy;

          if (p.x < -12) p.x = width + 12;
          else if (p.x > width + 12) p.x = -12;
          if (p.y < -12) p.y = height + 12;
          else if (p.y > height + 12) p.y = -12;
        }

        // Draw connecting constellation lines
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < linkDistSq) {
            const ratio = 1 - Math.sqrt(dSq) / linkDist;
            ctx.strokeStyle = `rgba(${dotRgb}, ${(ratio * (isDark ? 0.12 : 0.1)).toFixed(3)})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }

        // Subtle pointer link
        if (pointer.active) {
          const pdx = p.x - pointer.x;
          const pdy = p.y - pointer.y;
          const pdSq = pdx * pdx + pdy * pdy;
          if (pdSq < pointerRadiusSq) {
            const ratio = 1 - Math.sqrt(pdSq) / pointerRadius;
            ctx.strokeStyle = `rgba(${dotRgb}, ${(ratio * (isDark ? 0.18 : 0.14)).toFixed(3)})`;
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(pointer.x, pointer.y);
            ctx.stroke();
          }
        }

        // Draw particle node
        ctx.fillStyle = `rgba(${dotRgb}, ${p.alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (shouldAdvance) {
        phase += 0.008 * clampedSpeed;
      }
    };

    const tick = () => {
      if (!isVisible || prefersReducedMotion) {
        rafId = null;
        return;
      }
      renderFrame(true);
      rafId = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (prefersReducedMotion) {
        renderFrame(false);
        return;
      }
      if (rafId === null && isVisible) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        if (prefersReducedMotion) renderFrame(false);
      }, 120);
    };

    const handleVisibility = () => {
      isVisible = !document.hidden;
      if (isVisible) startLoop();
      else stopLoop();
    };

    const handlePointerMove = (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };

    const handlePointerLeave = () => {
      pointer.active = false;
    };

    const handleMotionChange = (e) => {
      prefersReducedMotion = e.matches;
      if (prefersReducedMotion) {
        stopLoop();
        renderFrame(false);
      } else {
        startLoop();
      }
    };

    resize();
    startLoop();

    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave, { passive: true });
    if (reducedMotionQuery?.addEventListener) {
      reducedMotionQuery.addEventListener('change', handleMotionChange);
    }

    return () => {
      stopLoop();
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      if (reducedMotionQuery?.removeEventListener) {
        reducedMotionQuery.removeEventListener('change', handleMotionChange);
      }
    };
  }, [theme, density, speed]);

  const isDark = theme === 'dark';
  const vignetteBackground = isDark
    ? 'radial-gradient(ellipse 75% 70% at 50% 48%, rgba(10,10,10,0.08) 0%, rgba(10,10,10,0.58) 68%, rgba(0,0,0,0.92) 100%)'
    : 'radial-gradient(ellipse 75% 70% at 50% 48%, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.62) 70%, rgba(255,255,255,0.95) 100%)';

  return (
    <div
      className={className}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: isDark ? '#000000' : '#FFFFFF',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: vignetteBackground,
        }}
      />
    </div>
  );
}
