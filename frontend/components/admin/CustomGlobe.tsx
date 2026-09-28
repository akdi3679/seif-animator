'use client';
import { useEffect, useRef, useState } from 'react';

interface Location {
  lat: number;
  lon: number;
  city: string;
  country: string;
  visit_count: number;
}

interface Props {
  locations: Location[];
  width: number;
  height: number;
  onReady?: () => void;
  onError?: () => void;
  initialLat?: number;
  initialLon?: number;
}

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.148.0/build/three.min.js';

export function CustomGlobe({ locations, width, height, onReady, onError, initialLat, initialLon }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
const [globeReady, setGlobeReady] = useState(false);
  // Refs that survive re‑renders
  const THREE_REF = useRef<any>(null);
  const sceneRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const rendererRef = useRef<any>(null);
  const sphericalRef = useRef<any>(null);
  const dotGroupRef = useRef<any>(null);
  const dotMeshesRef = useRef<any[]>([]);
  const skyTexRef = useRef<any>(null);
  const starDataRef = useRef<any[]>([]);
  const animIdRef = useRef<number | null>(null);
  const dotsCreatedRef = useRef(false); // prevents duplicate creation on first mount

  // Load Three.js and build the scene once
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        if (!(window as any).THREE) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = THREE_URL;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Three.js'));
            document.head.appendChild(script);
          });
        }

        const THREE = (window as any).THREE;
        if (!THREE || !containerRef.current || cancelled) return;

        THREE_REF.current = THREE;

        const {
          Scene, PerspectiveCamera, WebGLRenderer, SphereGeometry,
          TextureLoader, MeshStandardMaterial, Mesh, Group, MeshBasicMaterial,
          Vector3, AmbientLight, DirectionalLight, Spherical,
          Raycaster, Vector2, CanvasTexture,
        } = THREE;

        // ----- Scene -----
        const scene = new Scene();
        scene.background = null;
const containerWidth = containerRef.current.clientWidth || width;
const containerHeight = containerRef.current.clientHeight || height;
const camera = new PerspectiveCamera(45, containerWidth / containerHeight, 0.1, 1000);
        camera.position.set(0, 0, 3.5);
        camera.lookAt(0, 0, 0);

        const renderer = new WebGLRenderer({ antialias: true, alpha: true });
        const updateSize = () => {
  if (!containerRef.current) return;
  const w = containerRef.current.clientWidth;
  const h = containerRef.current.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
};
updateSize();
window.addEventListener('resize', updateSize);

        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        containerRef.current.appendChild(renderer.domElement);
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
        // ----- Lighting (bright enough for daytime look) -----
      camera.add(new AmbientLight(0x8899aa, 0.4));        // dim ambient → darker edges
const sunLight = new DirectionalLight(0xfff5e6, 1.6); // slightly brighter sun
sunLight.position.set(0, 0, 2);                      // dead centre → brightest middle
camera.add(sunLight);
scene.add(camera);

        // ----- Earth -----
      // ----- Earth (bright daytime look, no lighting required) -----
const earthGeom = new SphereGeometry(1, 64, 64);
const texLoader = new TextureLoader();
texLoader.crossOrigin = 'anonymous';
const earthTex = texLoader.load(
  'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
);
const earthMat = new MeshBasicMaterial({ map: earthTex });
const earth = new Mesh(earthGeom, earthMat);
earth.rotation.y =  0;
scene.add(earth);

        // ----- Skybox (stars) -----
const skyGeom = new SphereGeometry(25, 128, 128);   // high-poly sphere → smooth texture
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 2048;                             // higher resolution
skyCanvas.height = 1024;
const skyCtx = skyCanvas.getContext('2d')!;
const skyTex = new CanvasTexture(skyCanvas);
skyTex.minFilter = THREE.LinearFilter;               // smoother at distance
skyTex.magFilter = THREE.LinearFilter;
skyTexRef.current = skyTex;
const skyMat = new MeshBasicMaterial({
  map: skyTex,
  side: THREE.BackSide,
  depthWrite: false,
});
const sky = new Mesh(skyGeom, skyMat);
scene.add(sky);

// ── More and softer stars ──
const starCount = 1200;
const stars: { x: number; y: number; r: number; phase: number; speed: number }[] = [];
for (let i = 0; i < starCount; i++) {
  stars.push({
    x: Math.random() * skyCanvas.width,
    y: Math.random() * skyCanvas.height,
    r: Math.random() * 1.5 + 0.5,      // slightly larger radius
    phase: Math.random() * Math.PI * 2,
    speed: 0.5 + Math.random() * 2.0,
  });
}
starDataRef.current = stars;

function redrawStars(time: number) {
  if (!skyCtx || !skyTexRef.current) return;
  skyCtx.clearRect(0, 0, skyCanvas.width, skyCanvas.height);
  skyCtx.fillStyle = '#000';
  skyCtx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);

  for (const s of starDataRef.current) {
    const alpha = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(time * s.speed + s.phase));
    const gradient = skyCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    skyCtx.beginPath();
    skyCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    skyCtx.fillStyle = gradient;
    skyCtx.fill();
  }
  skyTexRef.current.needsUpdate = true;
}
        // ----- Visitor dots (initially empty) -----
        const dotGroup = new Group();
        scene.add(dotGroup);
        dotGroupRef.current = dotGroup;

        // Create initial dots right now (inside init)
        const dotRadius = 1.015;
        locations.forEach(loc => {
          const { x, y, z } = latLonToVec3(loc.lat, loc.lon, dotRadius);
          const baseSize = 0.04;
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(baseSize, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xc184fb })
          );
          dot.position.set(x, y, z);
          dot.userData = { city: loc.city, country: loc.country, visit_count: loc.visit_count };
          dotGroup.add(dot);
          dotMeshesRef.current.push(dot);
        });
        dotsCreatedRef.current = true;

        // ----- Controls & animation -----
        const canvas = renderer.domElement;
        let isDragging = false;
        let prevMouse = { x: 0, y: 0 };
// inside the init effect, replace:
const spherical = new Spherical();
spherical.setFromVector3(camera.position.clone().sub(new Vector3(0, 0, 0)));
sphericalRef.current = spherical;
        canvas.addEventListener('pointerdown', (e: PointerEvent) => {
          isDragging = true;
          prevMouse = { x: e.clientX, y: e.clientY };
        });
        canvas.addEventListener('pointermove', (e: PointerEvent) => {
          if (!isDragging) return;
          const dx = e.clientX - prevMouse.x;
          const dy = e.clientY - prevMouse.y;
          sphericalRef.current!.theta -= dx * 0.005;
          sphericalRef.current!.phi -= dy * 0.005;
          sphericalRef.current!.phi = Math.max(0.1, Math.min(Math.PI - 0.1, sphericalRef.current!.phi));
          prevMouse = { x: e.clientX, y: e.clientY };
        });
        canvas.addEventListener('pointerup', () => { isDragging = false; });
        canvas.addEventListener('wheel', (e: WheelEvent) => {
          e.preventDefault();
          sphericalRef.current!.radius *= e.deltaY > 0 ? 1.05 : 0.95;
          sphericalRef.current!.radius = Math.max(1.8, Math.min(8, sphericalRef.current!.radius));
        }, { passive: false });

        // Hover tooltip
        const raycaster = new Raycaster();
        const mouse = new Vector2();
        canvas.addEventListener('mousemove', (e: MouseEvent) => {
         const w = containerRef.current?.clientWidth || width;
const h = containerRef.current?.clientHeight || height;
mouse.x = (e.offsetX / w) * 2 - 1;
mouse.y = -(e.offsetY / h) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(dotMeshesRef.current);
          if (intersects.length > 0) {
            const obj = intersects[0].object;
            const { city, country, visit_count } = obj.userData;
            setTooltip({ text: `${city}, ${country} (${visit_count})`, x: e.offsetX, y: e.offsetY });
          } else {
            setTooltip(null);
          }
        });

        const animate = () => {
          const id = requestAnimationFrame(animate);
          animIdRef.current = id;

          camera.position.setFromSpherical(sphericalRef.current!);
          camera.position.add(new Vector3(0, 0, 0));
          camera.lookAt(0, 0, 0);

          // Dot scaling – comment out for debugging; enable later
                  
      dotMeshesRef.current.forEach(dot => {
  const dist = camera.position.distanceTo(dot.position);
  // ── Adjustable parameters ──
  const minScale = 0.24;    // size when zoomed all the way in
  const maxScale = 3.0;    // size when zoomed all the way out
  const refDist  = 3.5;    // default camera distance
  // ── Linear mapping ──
  let scale = minScale + ((dist - 1.8) / (8.0 - 1.8)) * (maxScale - minScale);
  scale = Math.max(minScale, Math.min(maxScale, scale));
  dot.scale.setScalar(scale);
});
          redrawStars(Date.now() * 0.001);
          renderer.render(scene, camera);
        };
        animate();

        sceneRef.current = scene;
        cameraRef.current = camera;
        rendererRef.current = renderer;

        setLoading(false);
        onReady?.();
        setGlobeReady(true);
      } catch (err) {
        console.error('Globe init error:', err);
        setLoading(false);
        onError?.();
      }
    };

    init();

    return () => {
      cancelled = true;
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        containerRef.current?.removeChild(rendererRef.current.domElement);
      }
    };
  }, []); // runs once

  // Update initial viewpoint when coordinates become available
  
         useEffect(() => {
    if (initialLat === undefined || initialLon === undefined || !sphericalRef.current) return;
    const pos = latLonToVec3(initialLat, initialLon, 1);
    const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    const phi = Math.acos(pos.y / r);
    const theta = Math.atan2(pos.x, pos.z);
    sphericalRef.current.theta = theta;
    sphericalRef.current.phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));
    }, [initialLat, initialLon, globeReady]);
  // Update dots when locations change (skips first mount)
  useEffect(() => {
    if (!dotsCreatedRef.current || !dotGroupRef.current) return;
    const THREE = THREE_REF.current;
    const dotGroup = dotGroupRef.current;

    while (dotGroup.children.length > 0) {
      dotGroup.remove(dotGroup.children[0]);
    }

    const dotRadius = 1.015;
    const newMeshes: any[] = [];

    locations.forEach(loc => {
      const { x, y, z } = latLonToVec3(loc.lat, loc.lon, dotRadius);
      const baseSize = 0.008;
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(baseSize, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xc184fb })
      );
      dot.position.set(x, y, z);
      dot.userData = { city: loc.city, country: loc.country, visit_count: loc.visit_count };
      dotGroup.add(dot);
      newMeshes.push(dot);
    });

    dotMeshesRef.current = newMeshes;
  }, [locations]);

   function latLonToVec3(lat: number, lon: number, radius: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);   // offset built in
  return {
    x: -radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

  return (
  <div
  ref={containerRef}
  style={{
    width: '100%',
    height: '100%',
    cursor: loading ? 'wait' : 'grab',
    background: loading ? '#000' : undefined,
    position: 'relative',
  }}
>
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 10,
            top: tooltip.y - 10,
            background: 'rgba(0,0,0,0.75)',
            color: 'white',
            padding: '2px 6px',
            borderRadius: 4,
            fontSize: 11,
            pointerEvents: 'none',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}