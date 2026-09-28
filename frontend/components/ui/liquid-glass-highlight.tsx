'use client';

import { useId, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

/* ── Math helpers (unchanged) ─────────────────────────── */
function smoothStep(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function vecLen(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}
function roundedRectSDF(x: number, y: number, w: number, h: number, r: number): number {
  const qx = Math.abs(x) - w + r;
  const qy = Math.abs(y) - h + r;
  return Math.min(Math.max(qx, qy), 0) + vecLen(Math.max(qx, 0), Math.max(qy, 0)) - r;
}
function squircleSurface(x: number): number {
  return Math.pow(1 - Math.pow(1 - x, 4), 0.25);
}

/* ── Fragment (unchanged) ─────────────────────────────── */
function fragment(
  uvx: number,
  uvy: number,
  options: {
    magnify: number;
    refraction: number;
    bevelMode: number;
    sdfW: number;
    sdfH: number;
    sdfR: number;
    outerEdge: number;
    innerEdge: number;
  }
) {
  const ix = uvx - 0.5;
  const iy = uvy - 0.5;
  const d = roundedRectSDF(ix, iy, options.sdfW, options.sdfH, options.sdfR);
  const displacement = smoothStep(options.outerEdge, 0, d - options.innerEdge);
  let rawScaled = smoothStep(0, 1, displacement);
  if (options.magnify > 1) {
    rawScaled = Math.pow(rawScaled, options.magnify);
  }
  if (options.bevelMode === 1) {
    const t = 1 - displacement;
    rawScaled = 1 - squircleSurface(t);
  }
  return { x: ix * rawScaled + 0.5, y: iy * rawScaled + 0.5 };
}

/* ── Build map (unchanged) ───────────────────────────── */
function buildMap(
  w: number,
  h: number,
  options: {
    magnify: number;
    refraction: number;
    chromAberration: number;
    bevelMode: number;
  }
): { dataUrl: string; scale: number; chromScaleR: number; chromScaleG: number } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const data = new Uint8ClampedArray(w * h * 4);
  let maxScale = 0;
  const raw: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const px = i % w;
    const py = Math.floor(i / w);
    const pos = fragment(px / w, py / h, {
      magnify: options.magnify,
      refraction: options.refraction,
      bevelMode: options.bevelMode,
      sdfW: 0.35,
      sdfH: 0.30,
      sdfR: 0.60,
      outerEdge: 0.75,
      innerEdge: 0.08,
    });
    const dx = pos.x * w - px;
    const dy = pos.y * h - py;
    maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
    raw.push(dx, dy);
  }
  const scale = maxScale * options.refraction;
  const chromScaleR = scale * (1 + options.chromAberration * 0.2);
  const chromScaleG = scale * (1 - options.chromAberration * 0.2);
  let ri = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = raw[ri++] / scale + 0.5;
    const g = raw[ri++] / scale + 0.5;
    data[i] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
  ctx.putImageData(new ImageData(data, w, h), 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), scale, chromScaleR, chromScaleG };
}

/* ── Config ──────────────────────────────────────────── */
export interface LiquidGlassConfig {
  blur?: number;
  refraction?: number;
  magnify?: number;
  chromAberration?: number;
  saturation?: number;
  brightness?: number;
  distortion?: number;
  edgeHighlight?: number;
  specular?: number;
  cornerRadius?: number;
  bevelMode?: number;
  shadowOpacity?: number;
  shadowSpread?: number;
}

const DEFAULT_CONFIG: Required<LiquidGlassConfig> = {
  blur: 0,
  refraction: 0.82,
  magnify: 2.2,
  chromAberration: 0.08,
  saturation: 0.5,
  brightness: 0,
  distortion: 0,
  edgeHighlight: 0.06,
  specular: 0.04,
  cornerRadius: 38,
  bevelMode: 0,
  shadowOpacity: 0.12,
  shadowSpread: 3,
};

/* ── Component ───────────────────────────────────────── */

interface Props {
  width: number;
  height: number;
  left: number;
  top: number;
  padding?: number;
  className?: string;
  config?: LiquidGlassConfig;
  draggable?: boolean;
  stretchScaleX?: number;
  stretchOrigin?: string;
  onDragEnd?: (finalLeft: number) => void;
}
export function LiquidGlassHighlight({
 width, height, left, top,
  padding = 0,
  className = '',
  config = {},
  draggable = false,
  stretchScaleX = 1,
  stretchOrigin = 'center',
  onDragEnd,
}: Props) {
  const rawId = useId();
  const uid = rawId.replace(/[^a-z0-9]/gi, '');
  const filterId = `lg_${uid}`;
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const [mapData, setMapData] = useState<{
    dataUrl: string;
    scale: number;
    chromScaleR: number;
    chromScaleG: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const prevKey = useRef('');
  const [dragPos, setDragPos] = useState({ left, top });
  const dragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const pillRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // rebuild map
  useEffect(() => {
    if (width <= 0 || height <= 0) return;
    const key = `${Math.round(width)}x${Math.round(height)}_${JSON.stringify(cfg)}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    requestAnimationFrame(() => {
      const result = buildMap(Math.round(width), Math.round(height), {
        magnify: cfg.magnify,
        refraction: cfg.refraction,
        chromAberration: cfg.chromAberration,
        bevelMode: cfg.bevelMode,
      });
      setMapData(result);
    });
  }, [width, height, cfg]);

  // sync dragPos when props change (if not dragging)
  useEffect(() => {
    if (!dragging.current) setDragPos({ left, top });
  }, [left, top]);

  // ── Dragging (horizontal only, vertical locked) ──
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!draggable || !pillRef.current) return;
      e.preventDefault();
      dragging.current = true;
      const pill = pillRef.current;
      const container = pill.parentElement!;
      startPos.current = {
        x: e.clientX,
        y: e.clientY,
        left: dragPos.left,
        top: dragPos.top,
      };

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const dx = ev.clientX - startPos.current.x;
        let newLeft = startPos.current.left + dx;
        // horizontal constraints with padding
        const containerRect = container.getBoundingClientRect();
        const pillW = pill.offsetWidth;
        newLeft = Math.max(padding, Math.min(containerRect.width - padding - pillW, newLeft));
        // vertical stays fixed
        setDragPos({ left: newLeft, top: startPos.current.top });
      };

      const handleMouseUp = () => {
        dragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        onDragEnd?.(dragPos.left);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [draggable, dragPos, padding, onDragEnd]
  );

  const finalLeft = draggable ? dragPos.left : left;
  const finalTop = draggable ? dragPos.top : top;
  const w = Math.round(width);
  const h = Math.round(height);

  const cssFilters: string[] = [];
  if (cfg.blur > 0) cssFilters.push(`blur(${cfg.blur}px)`);
  if (cfg.saturation !== 0) cssFilters.push(`saturate(${1 + cfg.saturation})`);
  if (cfg.brightness !== 0) cssFilters.push(`brightness(${1 + cfg.brightness})`);
  const extraCSS = cssFilters.length ? ` ${cssFilters.join(' ')}` : '';

  const edgeHL = cfg.edgeHighlight;
  const shadowOpacity = cfg.shadowOpacity;
  const glassReflexBoxShadow = [
    `inset 0 0 0 1px rgba(255,255,255,${0.2 + edgeHL * 0.3})`,
    `inset 0 1.5px 0 rgba(255,255,255,${0.4 + edgeHL * 0.25})`,
    `inset 0 -1px 0 rgba(255,255,255,${0.08})`,
    `inset 1px 0 0 rgba(255,255,255,${0.06})`,
    `inset -1px 0 0 rgba(255,255,255,${0.06})`,
    `inset 0 2px 4px rgba(255,255,255,${0.08})`,
    `inset 0 -2px 4px rgba(0,0,0,${shadowOpacity * 0.5})`,
    `0 ${cfg.shadowSpread}px ${cfg.shadowSpread * 2}px rgba(0,0,0,${shadowOpacity})`,
    `0 2px 8px rgba(0,0,0,${shadowOpacity * 0.5})`,
  ].join(', ');

  return (
    <>
      {mounted && mapData &&
  createPortal(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="0"
      height="0"
      style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 9998 }}
      aria-hidden
    >
      <defs>
        <filter
          id={filterId}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
          x="-50%" y="-50%"
          width="200%" height="200%"
        >
          <feImage href={mapData.dataUrl} x="0" y="0" width={w} height={h} result="map" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={mapData.chromScaleR}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>,
    document.body
  )
}

      <div
        ref={pillRef}
        className={className}
        style={{
          position: 'absolute',
          left: `${finalLeft}px`,
          top: `${finalTop}px`,
          width: `${w}px`,
          height: `${h}px`,
          borderRadius: `${cfg.cornerRadius}px`,
          overflow: 'visible',
          pointerEvents: draggable ? 'auto' : 'none',
          cursor: draggable ? 'move' : 'default',
          zIndex: 20,
          background: 'transparent',
          backdropFilter: mapData
            ? `url(#${filterId})${extraCSS}`
            : `blur(${cfg.blur * 2}px)${extraCSS}`,
          WebkitBackdropFilter: mapData
            ? `url(#${filterId})${extraCSS}`
            : `blur(${cfg.blur * 2}px)${extraCSS}`,
          boxShadow: glassReflexBoxShadow,
          border: `1px solid rgba(255,255,255,${0.25 + edgeHL * 0.2})`,
          transform: `scaleX(${stretchScaleX})`,
          transformOrigin: stretchOrigin,
          transition: draggable
            ? 'none'
            : [
                'left 380ms cubic-bezier(0.87,0,0.13,1)',
                'top 380ms cubic-bezier(0.87,0,0.13,1)',
                'width 260ms cubic-bezier(0.87,0,0.13,1)',
                'transform 440ms cubic-bezier(0.5,0,0,1)',
              ].join(', '),
        }}
        onMouseDown={handleMouseDown}
      >
        {cfg.specular > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              background: `radial-gradient(ellipse at 30% 30%, rgba(255,255,255,${cfg.specular}) 0%, transparent 70%)`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </>
  );
}