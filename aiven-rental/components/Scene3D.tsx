import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Float } from '@react-three/drei';
import * as THREE from 'three';

const GeometryShape = ({ position, color, speed, type }: { position: [number, number, number], color: string, speed: number, type: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * speed * 0.5;
      meshRef.current.rotation.y += delta * speed;
    }
  });

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={1}>
      <mesh ref={meshRef} position={position} castShadow receiveShadow>
        {type === 0 ? (
          <boxGeometry args={[1, 1, 1]} />
        ) : type === 1 ? (
          <octahedronGeometry args={[0.8]} />
        ) : (
          <dodecahedronGeometry args={[0.8]} />
        )}
        <meshStandardMaterial 
          color={color} 
          metalness={0.5} 
          roughness={0.2}
          emissive={color}
          emissiveIntensity={0.2}
        />
      </mesh>
    </Float>
  );
};

export const Scene3D = () => {
  // Generate random shapes
  const shapes = useMemo(() => {
    return Array.from({ length: 15 }).map((_, i) => ({
      position: [
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 10 - 5
      ] as [number, number, number],
      color: Math.random() > 0.5 ? '#f59e0b' : '#3b82f6', // Brand accent and blue
      speed: Math.random() * 0.5 + 0.2,
      type: Math.floor(Math.random() * 3)
    }));
  }, []);

  return (
    <div className="absolute inset-0 -z-10 opacity-60 pointer-events-none">
      <Canvas camera={{ position: [0, 0, 10], fov: 45 }} shadows>
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#ffffff" castShadow />
        <pointLight position={[-10, -10, -10]} intensity={0.8} color="#f59e0b" />
        
        {shapes.map((s, i) => (
          <GeometryShape key={i} {...s} />
        ))}
        
        {/* Removed Stars for light theme clarity */}
        {/* Environment adds subtle reflections, using 'city' or 'apartment' for indoor/clean lighting */}
        <Environment preset="city" />
      </Canvas>
    </div>
  );
};