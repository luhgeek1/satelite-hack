import * as THREE from 'three';

const CHUNK_COUNT = 150;
const GLOBE_RADIUS = 100;

export type ExplosionPhase = 'idle' | 'buildup' | 'exploding' | 'reassembling' | 'restored';

export interface ExplosionCallbacks {
  onGlobeVisibility: (visible: boolean) => void;
  onShake: (x: number, y: number) => void;
  onPhaseChange: (phase: ExplosionPhase) => void;
}

interface ChunkData {
  mesh: THREE.Mesh;
  initialPos: THREE.Vector3;
  initialQuat: THREE.Quaternion;
  reassembleStartPos: THREE.Vector3;
  reassembleStartQuat: THREE.Quaternion;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  coolColor: THREE.Color;
  hotColor: THREE.Color;
}

class ExplosionSound {
  private ctx: AudioContext | null = null;

  playExplosion() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const ctx = this.ctx;
      const now = ctx.currentTime;

      // 1. Buildup hum & rising energy (0 to 0.75s)
      const buildupOsc = ctx.createOscillator();
      const buildupGain = ctx.createGain();
      buildupOsc.type = 'sawtooth';
      buildupOsc.frequency.setValueAtTime(40, now);
      buildupOsc.frequency.exponentialRampToValueAtTime(360, now + 0.75);
      buildupGain.gain.setValueAtTime(0.01, now);
      buildupGain.gain.linearRampToValueAtTime(0.3, now + 0.7);
      buildupGain.gain.exponentialRampToValueAtTime(0.001, now + 0.77);
      buildupOsc.connect(buildupGain);
      buildupGain.connect(ctx.destination);
      buildupOsc.start(now);
      buildupOsc.stop(now + 0.8);

      // 2. Blast: Sub-bass punch (at now + 0.75s)
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(160, now + 0.75);
      subOsc.frequency.exponentialRampToValueAtTime(24, now + 1.8);
      subGain.gain.setValueAtTime(0.8, now + 0.75);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 3.2);
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now + 0.75);
      subOsc.stop(now + 3.3);

      // 3. Blast: Heavy explosion noise body
      const bufferSize = Math.floor(ctx.sampleRate * 3.5);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now + 0.75);
      filter.frequency.exponentialRampToValueAtTime(50, now + 3.6);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.7, now + 0.75);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 4.0);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now + 0.75);
      noise.stop(now + 4.1);
    } catch {
      // Audio not supported or blocked by browser policy
    }
  }

  playReassemble() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      const ctx = this.ctx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(35, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 2.1);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 1.9);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 2.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 2.4);
    } catch {}
  }

  dispose() {
    try {
      this.ctx?.close();
    } catch {}
    this.ctx = null;
  }
}

function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 200, 80, 0.95)');
    gradient.addColorStop(0.45, 'rgba(255, 80, 20, 0.5)');
    gradient.addColorStop(0.75, 'rgba(200, 20, 0, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class PlanetExplosionController {
  private scene: THREE.Scene;
  private callbacks: ExplosionCallbacks;
  private sound = new ExplosionSound();
  private rootGroup = new THREE.Group();
  private animationFrameId: number | null = null;

  // Timeline durations
  private readonly BUILDUP_DURATION = 0.75;
  private readonly DRIFT_DURATION = 6.0;
  private readonly REASSEMBLE_DURATION = 2.4;

  private phase: ExplosionPhase = 'idle';
  private explosionStartTime = 0;
  private reassembleStartTime = 0;

  // 3D Objects
  private chunks: ChunkData[] = [];
  private buildupCoreMesh!: THREE.Mesh;
  private flashMesh!: THREE.Mesh;
  private shockwave1!: THREE.Mesh;
  private shockwave2!: THREE.Mesh;
  private remnantCore!: THREE.Mesh;
  private particleSystemFire!: THREE.Points;
  private particleSystemSparks!: THREE.Points;

  // Particle data
  private firePositions!: Float32Array;
  private fireColors!: Float32Array;
  private fireVelocities!: Float32Array;
  private fireReassemblePositions!: Float32Array;
  private sparkPositions!: Float32Array;
  private sparkVelocities!: Float32Array;

  // Textures and materials to dispose
  private textures: THREE.Texture[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(scene: THREE.Scene, callbacks: ExplosionCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.rootGroup.name = 'planet-explosion-group';
    this.scene.add(this.rootGroup);
  }

  start() {
    if (this.phase !== 'idle' && this.phase !== 'restored') return;
    this.resetObjects();
    this.buildExplosionScene();
    this.phase = 'buildup';
    this.callbacks.onPhaseChange('buildup');
    this.explosionStartTime = performance.now();
    this.reassembleStartTime = 0;
    this.sound.playExplosion();
    this.loop();
  }

  requestReassemble() {
    if (this.phase === 'exploding') {
      this.startReassembly();
    }
  }

  private startReassembly() {
    if (this.phase === 'reassembling' || this.phase === 'restored') return;
    this.phase = 'reassembling';
    this.reassembleStartTime = performance.now();
    this.callbacks.onPhaseChange('reassembling');
    this.sound.playReassemble();

    // Snapshot exact positions and rotations of chunks at start of reassembly
    for (const chunk of this.chunks) {
      chunk.reassembleStartPos.copy(chunk.mesh.position);
      chunk.reassembleStartQuat.copy(chunk.mesh.quaternion);
    }

    // Snapshot particles
    if (this.firePositions && this.fireReassemblePositions) {
      this.fireReassemblePositions.set(this.firePositions);
    }
  }

  private setNativeGlobeVisible(visible: boolean) {
    this.scene.traverse((obj: any) => {
      if (obj.__globeObjType === 'globe' || obj.name === 'atmosphere') {
        obj.visible = visible;
      }
    });
  }

  private buildExplosionScene() {
    const glowTexture = createGlowTexture();
    this.textures.push(glowTexture);

    // 1. Pre-detonation core glow
    const buildupGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.01, 36, 36);
    const buildupMat = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      depthWrite: false
    });
    this.buildupCoreMesh = new THREE.Mesh(buildupGeo, buildupMat);
    this.geometries.push(buildupGeo);
    this.materials.push(buildupMat);
    this.rootGroup.add(this.buildupCoreMesh);

    // 2. Supernova flash sphere
    const flashGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.05, 32, 32);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.flashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.flashMesh.visible = false;
    this.geometries.push(flashGeo);
    this.materials.push(flashMat);
    this.rootGroup.add(this.flashMesh);

    // 3. Praxis shockwave rings
    const ring1Geo = new THREE.RingGeometry(GLOBE_RADIUS * 0.95, GLOBE_RADIUS * 1.25, 72);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.shockwave1 = new THREE.Mesh(ring1Geo, ring1Mat);
    this.shockwave1.rotation.x = Math.PI / 2;
    this.shockwave1.visible = false;
    this.geometries.push(ring1Geo);
    this.materials.push(ring1Mat);
    this.rootGroup.add(this.shockwave1);

    const ring2Geo = new THREE.RingGeometry(GLOBE_RADIUS * 0.95, GLOBE_RADIUS * 1.2, 72);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0xfb923c,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.shockwave2 = new THREE.Mesh(ring2Geo, ring2Mat);
    this.shockwave2.rotation.x = Math.PI / 3;
    this.shockwave2.rotation.y = Math.PI / 4;
    this.shockwave2.visible = false;
    this.geometries.push(ring2Geo);
    this.materials.push(ring2Mat);
    this.rootGroup.add(this.shockwave2);

    // 4. Central remnant core
    const remnantGeo = new THREE.SphereGeometry(18, 24, 24);
    const remnantMat = new THREE.MeshBasicMaterial({
      color: 0xff4500,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.remnantCore = new THREE.Mesh(remnantGeo, remnantMat);
    this.remnantCore.visible = false;
    this.geometries.push(remnantGeo);
    this.materials.push(remnantMat);
    this.rootGroup.add(this.remnantCore);

    // 5. 3D Tectonic Crust Shards
    this.buildChunks();

    // 6. Particle Systems
    this.buildParticles(glowTexture);
  }

  private buildChunks() {
    this.chunks = [];
    const sharedMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });
    this.materials.push(sharedMat);

    for (let i = 0; i < CHUNK_COUNT; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / CHUNK_COUNT);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();

      const arbitrary = Math.abs(dir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const tangentU = new THREE.Vector3().crossVectors(dir, arbitrary).normalize();
      const tangentV = new THREE.Vector3().crossVectors(dir, tangentU).normalize();

      const numSides = 5;
      const outerRing: THREE.Vector3[] = [];
      const innerRing: THREE.Vector3[] = [];

      for (let s = 0; s < numSides; s++) {
        const angle = (s / numSides) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const radius = 9 + Math.random() * 5;
        const offset = new THREE.Vector3()
          .addScaledVector(tangentU, Math.cos(angle) * radius)
          .addScaledVector(tangentV, Math.sin(angle) * radius);

        const outerPt = dir.clone().multiplyScalar(GLOBE_RADIUS).add(offset).normalize().multiplyScalar(GLOBE_RADIUS);
        const innerPt = dir.clone().multiplyScalar(GLOBE_RADIUS * 0.92).add(offset.clone().multiplyScalar(0.92)).normalize().multiplyScalar(GLOBE_RADIUS * 0.92);
        outerRing.push(outerPt);
        innerRing.push(innerPt);
      }

      const topCenter = dir.clone().multiplyScalar(GLOBE_RADIUS);
      const bottomCenter = dir.clone().multiplyScalar(GLOBE_RADIUS * 0.91);
      const centroid = dir.clone().multiplyScalar(GLOBE_RADIUS * 0.96);

      const topCenterLocal = topCenter.clone().sub(centroid);
      const bottomCenterLocal = bottomCenter.clone().sub(centroid);
      const outerLocal = outerRing.map(p => p.clone().sub(centroid));
      const innerLocal = innerRing.map(p => p.clone().sub(centroid));

      const positions: number[] = [];
      const colors: number[] = [];

      const crustR = 0.12 + Math.random() * 0.1;
      const crustG = 0.22 + Math.random() * 0.15;
      const crustB = 0.35 + Math.random() * 0.2;

      const magmaR = 1.0;
      const magmaG = 0.35 + Math.random() * 0.45;
      const magmaB = 0.0;

      const addTri = (
        p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3,
        c1: [number, number, number], c2: [number, number, number], c3: [number, number, number]
      ) => {
        positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        colors.push(c1[0], c1[1], c1[2], c2[0], c2[1], c2[2], c3[0], c3[1], c3[2]);
      };

      for (let s = 0; s < numSides; s++) {
        const next = (s + 1) % numSides;
        addTri(
          topCenterLocal, outerLocal[s], outerLocal[next],
          [crustR, crustG, crustB], [crustR, crustG, crustB], [crustR, crustG, crustB]
        );
        addTri(
          bottomCenterLocal, innerLocal[next], innerLocal[s],
          [magmaR, magmaG * 0.7, magmaB], [magmaR, magmaG * 0.7, magmaB], [magmaR, magmaG * 0.7, magmaB]
        );
        addTri(
          outerLocal[s], innerLocal[s], outerLocal[next],
          [magmaR, magmaG, magmaB], [magmaR, magmaG * 0.8, magmaB], [magmaR, magmaG, magmaB]
        );
        addTri(
          innerLocal[s], innerLocal[next], outerLocal[next],
          [magmaR, magmaG * 0.8, magmaB], [magmaR, magmaG * 0.8, magmaB], [magmaR, magmaG, magmaB]
        );
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geom.computeVertexNormals();
      this.geometries.push(geom);

      const mesh = new THREE.Mesh(geom, sharedMat);
      mesh.position.copy(centroid);
      mesh.visible = false;
      this.rootGroup.add(mesh);

      const speed = 80 + Math.random() * 140;
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 35,
        (Math.random() - 0.5) * 35,
        (Math.random() - 0.5) * 35
      );
      const velocity = dir.clone().multiplyScalar(speed).add(spread);
      const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 4.0,
        (Math.random() - 0.5) * 4.0,
        (Math.random() - 0.5) * 4.0
      );

      this.chunks.push({
        mesh,
        initialPos: centroid.clone(),
        initialQuat: mesh.quaternion.clone(),
        reassembleStartPos: centroid.clone(),
        reassembleStartQuat: mesh.quaternion.clone(),
        velocity,
        angularVelocity,
        coolColor: new THREE.Color(crustR, crustG, crustB),
        hotColor: new THREE.Color(magmaR, magmaG, magmaB)
      });
    }
  }

  private buildParticles(glowTexture: THREE.Texture) {
    const fireCount = 1400;
    this.firePositions = new Float32Array(fireCount * 3);
    this.fireColors = new Float32Array(fireCount * 3);
    this.fireVelocities = new Float32Array(fireCount * 3);
    this.fireReassemblePositions = new Float32Array(fireCount * 3);

    for (let i = 0; i < fireCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const sinPhi = Math.sin(phi);

      const dirX = sinPhi * Math.cos(theta);
      const dirY = Math.cos(phi);
      const dirZ = sinPhi * Math.sin(theta);

      const startR = GLOBE_RADIUS * (0.2 + Math.random() * 0.8);
      this.firePositions[i * 3] = dirX * startR;
      this.firePositions[i * 3 + 1] = dirY * startR;
      this.firePositions[i * 3 + 2] = dirZ * startR;

      const speed = 40 + Math.random() * 140;
      this.fireVelocities[i * 3] = dirX * speed + (Math.random() - 0.5) * 30;
      this.fireVelocities[i * 3 + 1] = dirY * speed + (Math.random() - 0.5) * 30;
      this.fireVelocities[i * 3 + 2] = dirZ * speed + (Math.random() - 0.5) * 30;

      this.fireColors[i * 3] = 1.0;
      this.fireColors[i * 3 + 1] = 0.9;
      this.fireColors[i * 3 + 2] = 0.6;
    }

    const fireGeo = new THREE.BufferGeometry();
    fireGeo.setAttribute('position', new THREE.BufferAttribute(this.firePositions, 3));
    fireGeo.setAttribute('color', new THREE.BufferAttribute(this.fireColors, 3));
    this.geometries.push(fireGeo);

    const fireMat = new THREE.PointsMaterial({
      size: 16,
      map: glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.materials.push(fireMat);

    this.particleSystemFire = new THREE.Points(fireGeo, fireMat);
    this.particleSystemFire.visible = false;
    this.rootGroup.add(this.particleSystemFire);

    const sparkCount = 900;
    this.sparkPositions = new Float32Array(sparkCount * 3);
    this.sparkVelocities = new Float32Array(sparkCount * 3);

    for (let i = 0; i < sparkCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const sinPhi = Math.sin(phi);

      const dirX = sinPhi * Math.cos(theta);
      const dirY = Math.cos(phi);
      const dirZ = sinPhi * Math.sin(theta);

      const startR = GLOBE_RADIUS * Math.random();
      this.sparkPositions[i * 3] = dirX * startR;
      this.sparkPositions[i * 3 + 1] = dirY * startR;
      this.sparkPositions[i * 3 + 2] = dirZ * startR;

      const speed = 180 + Math.random() * 260;
      this.sparkVelocities[i * 3] = dirX * speed;
      this.sparkVelocities[i * 3 + 1] = dirY * speed;
      this.sparkVelocities[i * 3 + 2] = dirZ * speed;
    }

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    this.geometries.push(sparkGeo);

    const sparkMat = new THREE.PointsMaterial({
      size: 4,
      color: 0xfff0aa,
      map: glowTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.materials.push(sparkMat);

    this.particleSystemSparks = new THREE.Points(sparkGeo, sparkMat);
    this.particleSystemSparks.visible = false;
    this.rootGroup.add(this.particleSystemSparks);
  }

  private loop = () => {
    const now = performance.now();

    if (this.phase === 'buildup') {
      const elapsed = (now - this.explosionStartTime) / 1000;
      if (elapsed < this.BUILDUP_DURATION) {
        this.updateBuildup(elapsed);
      } else {
        this.phase = 'exploding';
        this.callbacks.onPhaseChange('exploding');
        this.callbacks.onGlobeVisibility(false);
        this.setNativeGlobeVisible(false);
        this.updateExplosion(0);
      }
    } else if (this.phase === 'exploding') {
      const elapsed = (now - this.explosionStartTime) / 1000 - this.BUILDUP_DURATION;
      this.updateExplosion(elapsed);
      if (elapsed >= this.DRIFT_DURATION) {
        this.startReassembly();
      }
    } else if (this.phase === 'reassembling') {
      const elapsed = (now - this.reassembleStartTime) / 1000;
      const progress = Math.min(1, Math.max(0, elapsed / this.REASSEMBLE_DURATION));
      this.updateReassemble(progress);
      if (progress >= 1.0) {
        this.finish();
        return;
      }
    } else {
      return;
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private updateBuildup(t: number) {
    const p = t / this.BUILDUP_DURATION;

    const flicker = Math.sin(t * 35) * 0.2 + Math.sin(t * 60) * 0.1;
    const mat = this.buildupCoreMesh.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.min(1, p * 0.95 + flicker);
    this.buildupCoreMesh.scale.setScalar(1 + p * 0.05 + flicker * 0.02);

    const shakeAmp = p * 4.5;
    const shakeX = (Math.random() - 0.5) * shakeAmp * 2;
    const shakeY = (Math.random() - 0.5) * shakeAmp * 2;
    this.callbacks.onShake(shakeX, shakeY);
  }

  private updateExplosion(t: number) {
    const blastDecay = Math.exp(-t * 2.8);
    const shakeAmp = blastDecay * 14;
    const shakeX = (Math.sin(t * 50) + (Math.random() - 0.5)) * shakeAmp;
    const shakeY = (Math.cos(t * 40) + (Math.random() - 0.5)) * shakeAmp;
    this.callbacks.onShake(shakeX, shakeY);

    this.buildupCoreMesh.visible = false;

    if (t < 0.6) {
      this.flashMesh.visible = true;
      const flashP = t / 0.6;
      this.flashMesh.scale.setScalar(1 + flashP * 2.5);
      const flashMat = this.flashMesh.material as THREE.MeshBasicMaterial;
      flashMat.opacity = Math.max(0, 1 - flashP * flashP);
    } else {
      this.flashMesh.visible = false;
    }

    if (t < 2.0) {
      this.shockwave1.visible = true;
      this.shockwave2.visible = true;
      const shockP = t / 2.0;

      const r1 = 1 + shockP * 6.5;
      this.shockwave1.scale.setScalar(r1);
      (this.shockwave1.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - shockP));

      const r2 = 1 + shockP * 5.5;
      this.shockwave2.scale.setScalar(r2);
      (this.shockwave2.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - shockP));
    } else {
      this.shockwave1.visible = false;
      this.shockwave2.visible = false;
    }

    this.remnantCore.visible = true;
    const remnantP = Math.min(1, t / 0.5);
    const pulse = Math.sin(t * 8) * 0.15;
    this.remnantCore.scale.setScalar(1 + pulse);
    (this.remnantCore.material as THREE.MeshBasicMaterial).opacity = remnantP * 0.85 * (1 - t / 7.0);

    const drag = Math.max(0.1, 1 - t * 0.08);
    for (const chunk of this.chunks) {
      chunk.mesh.visible = true;
      chunk.mesh.position.addScaledVector(chunk.velocity, 0.016 * drag);
      chunk.mesh.rotation.x += chunk.angularVelocity.x * 0.016;
      chunk.mesh.rotation.y += chunk.angularVelocity.y * 0.016;
      chunk.mesh.rotation.z += chunk.angularVelocity.z * 0.016;
    }

    this.particleSystemFire.visible = true;
    this.particleSystemSparks.visible = true;

    const fireCount = this.firePositions.length / 3;
    const firePosAttr = this.particleSystemFire.geometry.attributes.position as THREE.BufferAttribute;
    const fireColAttr = this.particleSystemFire.geometry.attributes.color as THREE.BufferAttribute;

    const fireMat = this.particleSystemFire.material as THREE.PointsMaterial;
    fireMat.opacity = Math.max(0, 0.9 - t * 0.12);

    for (let i = 0; i < fireCount; i++) {
      const idx = i * 3;
      this.firePositions[idx] += this.fireVelocities[idx] * 0.016 * drag;
      this.firePositions[idx + 1] += this.fireVelocities[idx + 1] * 0.016 * drag;
      this.firePositions[idx + 2] += this.fireVelocities[idx + 2] * 0.016 * drag;

      const heat = Math.max(0, 1 - t * 0.35);
      this.fireColors[idx] = heat > 0.5 ? 1.0 : heat * 2.0;
      this.fireColors[idx + 1] = heat * 0.8;
      this.fireColors[idx + 2] = heat * heat * 0.4;
    }
    firePosAttr.needsUpdate = true;
    fireColAttr.needsUpdate = true;

    const sparkCount = this.sparkPositions.length / 3;
    const sparkPosAttr = this.particleSystemSparks.geometry.attributes.position as THREE.BufferAttribute;
    const sparkMat = this.particleSystemSparks.material as THREE.PointsMaterial;
    sparkMat.opacity = Math.max(0, 1.0 - t * 0.4);

    for (let i = 0; i < sparkCount; i++) {
      const idx = i * 3;
      this.sparkPositions[idx] += this.sparkVelocities[idx] * 0.016;
      this.sparkPositions[idx + 1] += this.sparkVelocities[idx + 1] * 0.016;
      this.sparkPositions[idx + 2] += this.sparkVelocities[idx + 2] * 0.016;
    }
    sparkPosAttr.needsUpdate = true;
  }

  private updateReassemble(p: number) {
    const ease = p * p * (3 - 2 * p); // smoothstep: 0 -> 1

    const shakeAmp = (1 - ease) * 3.5;
    this.callbacks.onShake(
      (Math.random() - 0.5) * shakeAmp,
      (Math.random() - 0.5) * shakeAmp
    );

    // Pull chunks smoothly from their reassembleStartPos back to initialPos
    for (const chunk of this.chunks) {
      chunk.mesh.position.copy(chunk.reassembleStartPos).lerp(chunk.initialPos, ease);
      chunk.mesh.quaternion.copy(chunk.reassembleStartQuat).slerp(chunk.initialQuat, ease);
    }

    // Shrink singularity core
    if (this.remnantCore) {
      this.remnantCore.scale.setScalar(Math.max(0.001, (1 - ease) * 1.5));
      (this.remnantCore.material as THREE.MeshBasicMaterial).opacity = (1 - ease) * 0.85;
    }

    // Pull fire particles inward
    const fireCount = this.firePositions.length / 3;
    const firePosAttr = this.particleSystemFire.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fireCount; i++) {
      const idx = i * 3;
      this.firePositions[idx] = this.fireReassemblePositions[idx] * (1 - ease);
      this.firePositions[idx + 1] = this.fireReassemblePositions[idx + 1] * (1 - ease);
      this.firePositions[idx + 2] = this.fireReassemblePositions[idx + 2] * (1 - ease);
    }
    firePosAttr.needsUpdate = true;
    (this.particleSystemFire.material as THREE.PointsMaterial).opacity = Math.max(0, (1 - ease) * 0.8);
    (this.particleSystemSparks.material as THREE.PointsMaterial).opacity = Math.max(0, (1 - ease) * 0.8);

    // Flash of cosmic binding energy when chunks lock into sphere
    if (p > 0.75) {
      this.flashMesh.visible = true;
      const flashP = (p - 0.75) / 0.25;
      const flashMat = this.flashMesh.material as THREE.MeshBasicMaterial;
      flashMat.color.setHex(0x60a5fa); // cosmic electric blue
      flashMat.opacity = Math.sin(flashP * Math.PI) * 0.85;
      this.flashMesh.scale.setScalar(1.0 + Math.sin(flashP * Math.PI) * 0.15);
    }
  }

  private finish() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.callbacks.onShake(0, 0);
    this.callbacks.onGlobeVisibility(true);
    this.setNativeGlobeVisible(true);
    this.phase = 'restored';
    this.callbacks.onPhaseChange('restored');
    this.resetObjects();
  }

  private resetObjects() {
    for (const chunk of this.chunks) {
      chunk.mesh.visible = false;
      chunk.mesh.position.copy(chunk.initialPos);
      chunk.mesh.quaternion.copy(chunk.initialQuat);
    }
    if (this.buildupCoreMesh) this.buildupCoreMesh.visible = false;
    if (this.flashMesh) {
      this.flashMesh.visible = false;
      (this.flashMesh.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
    }
    if (this.shockwave1) this.shockwave1.visible = false;
    if (this.shockwave2) this.shockwave2.visible = false;
    if (this.remnantCore) this.remnantCore.visible = false;
    if (this.particleSystemFire) this.particleSystemFire.visible = false;
    if (this.particleSystemSparks) this.particleSystemSparks.visible = false;
  }

  dispose() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.callbacks.onShake(0, 0);
    this.callbacks.onGlobeVisibility(true);
    this.setNativeGlobeVisible(true);
    this.sound.dispose();

    this.scene.remove(this.rootGroup);

    for (const geo of this.geometries) {
      geo.dispose();
    }
    for (const mat of this.materials) {
      mat.dispose();
    }
    for (const tex of this.textures) {
      tex.dispose();
    }
    this.geometries = [];
    this.materials = [];
    this.textures = [];
    this.chunks = [];
  }
}
