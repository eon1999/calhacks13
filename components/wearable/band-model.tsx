"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Float, OrbitControls, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

// Strap loop (wrist cross-section is a wide oval), in scene units.
const OUTER_RX = 1.25;
const OUTER_RY = 1.0;
const THICKNESS = 0.09;
const WIDTH = 0.55; // along the wrist

const POD = { w: 1.15, h: 0.24, d: 0.66 };
const POD_Y = OUTER_RY + POD.h / 2 - 0.04;

function strapGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, OUTER_RX, OUTER_RY, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, OUTER_RX - THICKNESS, OUTER_RY - THICKNESS, 0, Math.PI * 2, true, 0);
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: WIDTH,
    curveSegments: 128,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.03,
    bevelSegments: 4,
  });
  geo.translate(0, 0, -WIDTH / 2);
  return geo;
}

/** Watch face drawn to a canvas: time, heart rate and skin temperature. */
function screenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#07040d";
  ctx.fillRect(0, 0, 512, 256);

  // Skin-temperature gauge: open-bottom arc, cool to warm, marker at the reading.
  const start = Math.PI * 0.75;
  const end = Math.PI * 2.25;
  const reading = 0.55; // 98.6°F on a 95–102°F scale
  const warm = ctx.createLinearGradient(40, 0, 180, 0);
  warm.addColorStop(0, "#6fb7ff");
  warm.addColorStop(0.5, "#9047ff");
  warm.addColorStop(1, "#ff7ab8");
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#2a1647";
  ctx.beginPath();
  ctx.arc(110, 128, 70, start, end);
  ctx.stroke();
  ctx.strokeStyle = warm;
  ctx.beginPath();
  ctx.arc(110, 128, 70, start, start + (end - start) * reading);
  ctx.stroke();
  const at = start + (end - start) * reading;
  ctx.fillStyle = "#f5efff";
  ctx.beginPath();
  ctx.arc(110 + Math.cos(at) * 70, 128 + Math.sin(at) * 70, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "500 34px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("98.6°", 112, 122);
  ctx.fillStyle = "#b9a6dc";
  ctx.font = "500 18px ui-monospace, monospace";
  ctx.fillText("TEMP °F", 110, 190);

  ctx.textAlign = "left";
  ctx.font = "600 92px system-ui, sans-serif";
  ctx.fillText("10:42", 215, 105);
  ctx.fillStyle = "#ff7ab8";
  ctx.font = "500 36px ui-monospace, monospace";
  ctx.fillText("♥ 72 bpm", 222, 185);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function Band() {
  const strap = useMemo(() => strapGeometry(), []);
  const screen = useMemo(() => screenTexture(), []);
  useEffect(() => () => {
    strap.dispose();
    screen.dispose();
  }, [strap, screen]);

  return (
    <group rotation={[0.35, -0.5, 0]}>
      <mesh geometry={strap} castShadow>
        <meshStandardMaterial color="#7a3fd6" roughness={0.55} />
      </mesh>

      {/* tracker pod */}
      <group position={[0, POD_Y, 0]}>
        <RoundedBox args={[POD.w, POD.h, POD.d]} radius={0.1} smoothness={6} castShadow>
          <meshStandardMaterial color="#2b2533" metalness={0.7} roughness={0.3} />
        </RoundedBox>
        <RoundedBox args={[POD.w - 0.1, 0.02, POD.d - 0.1]} radius={0.01} position={[0, POD.h / 2, 0]}>
          <meshPhysicalMaterial color="#000" roughness={0.05} clearcoat={1} />
        </RoundedBox>
        <mesh position={[0, POD.h / 2 + 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[POD.w - 0.2, (POD.w - 0.2) / 2]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
        {/* side button */}
        <RoundedBox args={[0.04, 0.08, 0.22]} radius={0.015} position={[-POD.w / 2 - 0.01, 0, 0]}>
          <meshStandardMaterial color="#8d86a0" metalness={0.9} roughness={0.25} />
        </RoundedBox>
      </group>

      {/* clasp on the underside */}
      <RoundedBox args={[0.34, 0.06, WIDTH + 0.04]} radius={0.02} position={[0, -OUTER_RY + 0.02, 0]}>
        <meshStandardMaterial color="#c9c3d6" metalness={0.95} roughness={0.2} />
      </RoundedBox>
    </group>
  );
}

/** Drag to spin (zoom is off so the page scroll is never captured). Slowly turns on its own unless reduced motion is set. */
export default function BandModel() {
  // Client-only (loaded with ssr: false), so window is safe here.
  const [reduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 1.6, 5], fov: 35 }} gl={{ alpha: true }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={1.2} color="#f3c6ef" />
      <pointLight position={[0, -2, 3]} intensity={6} color="#9047ff" />

      <Float speed={reduced ? 0 : 1.4} rotationIntensity={0.15} floatIntensity={reduced ? 0 : 0.4}>
        <Band />
      </Float>
      <ContactShadows position={[0, -1.6, 0]} opacity={0.45} scale={6} blur={2.6} color="#2a0f5c" />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate={!reduced}
        autoRotateSpeed={1.2}
      />
    </Canvas>
  );
}
