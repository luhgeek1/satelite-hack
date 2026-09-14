import * as THREE from 'three';

const CHUNK_COUNT = 280;
const GLOBE_RADIUS = 100;

export type ExplosionPhase = 'idle' | 'buildup' | 'exploding' | 'reassembling' | 'restored';
export type ExplosionMode = 'konami' | 'reset';

export interface ExplosionCallbacks {
  onGlobeVisibility: (visible: boolean) => void;
  onShake: (x: number, y: number) => void;
  onPhaseChange: (phase: ExplosionPhase, mode: ExplosionMode) => void;
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

  playExplosion(buildupTime = 0.75, mode: ExplosionMode = 'konami') {
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
      const isReset = mode === 'reset';


      const crackTimes = (isReset ? [0.5] : [0.25, 0.55, 0.85]).map(frac => frac * buildupTime);
      crackTimes.forEach(t => {
        const snap = ctx.createBufferSource();
        const snapBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * (isReset ? 0.025 : 0.04)), ctx.sampleRate);
        const data = snapBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.007));
        }
        snap.buffer = snapBuf;
        const snapFilter = ctx.createBiquadFilter();
        snapFilter.type = isReset ? 'lowpass' : 'bandpass';
        snapFilter.frequency.setValueAtTime(isReset ? 260 : 1100 + Math.random() * 600, now + t);
        if (!isReset) snapFilter.Q.setValueAtTime(3, now + t);
        const snapGain = ctx.createGain();
        snapGain.gain.setValueAtTime(isReset ? 0.05 : 0.28, now + t);
        snap.connect(snapFilter);
        snapFilter.connect(snapGain);
        snapGain.connect(ctx.destination);
        snap.start(now + t);
      });


      const buildupOsc = ctx.createOscillator();
      const buildupGain = ctx.createGain();
      buildupOsc.type = isReset ? 'sine' : 'sawtooth';
      buildupOsc.frequency.setValueAtTime(isReset ? 30 : 40, now);
      buildupOsc.frequency.exponentialRampToValueAtTime(isReset ? 85 : 380, now + buildupTime);
      buildupGain.gain.setValueAtTime(0.01, now);
      buildupGain.gain.linearRampToValueAtTime(isReset ? 0.06 : 0.32, now + buildupTime * 0.9);
      buildupGain.gain.exponentialRampToValueAtTime(0.001, now + buildupTime * 1.02);
      buildupOsc.connect(buildupGain);
      buildupGain.connect(ctx.destination);
      buildupOsc.start(now);
      buildupOsc.stop(now + buildupTime * 1.05);

      const subDrone = ctx.createOscillator();
      const subDroneGain = ctx.createGain();
      subDrone.type = 'sine';
      subDrone.frequency.setValueAtTime(30, now);
      subDrone.frequency.linearRampToValueAtTime(isReset ? 45 : 60, now + buildupTime);
      subDroneGain.gain.setValueAtTime(isReset ? 0.04 : 0.15, now);
      subDroneGain.gain.linearRampToValueAtTime(isReset ? 0.10 : 0.45, now + buildupTime);
      subDroneGain.gain.exponentialRampToValueAtTime(0.001, now + buildupTime * 1.05);
      subDrone.connect(subDroneGain);
      subDroneGain.connect(ctx.destination);
      subDrone.start(now);
      subDrone.stop(now + buildupTime * 1.08);

      const blastTime = now + buildupTime;


      if (!isReset) {
        const transient = ctx.createBufferSource();
        const tBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate);
        const tData = tBuf.getChannelData(0);
        for (let i = 0; i < tData.length; i++) {
          tData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.012));
        }
        transient.buffer = tBuf;
        const tGain = ctx.createGain();
        tGain.gain.setValueAtTime(0.85, blastTime);
        tGain.gain.exponentialRampToValueAtTime(0.001, blastTime + 0.1);
        transient.connect(tGain);
        tGain.connect(ctx.destination);
        transient.start(blastTime);
      }


      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(isReset ? 80 : 170, blastTime);
      subOsc.frequency.exponentialRampToValueAtTime(isReset ? 28 : 22, blastTime + (isReset ? 0.7 : 1.6));
      subGain.gain.setValueAtTime(isReset ? 0.20 : 0.9, blastTime);
      subGain.gain.exponentialRampToValueAtTime(0.001, blastTime + (isReset ? 1.0 : 3.0));
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(blastTime);
      subOsc.stop(blastTime + (isReset ? 1.1 : 3.1));


      const bufferSize = Math.floor(ctx.sampleRate * (isReset ? 1.2 : 3.5));
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.022 * white) / 1.022;
        lastOut = output[i];
        output[i] *= isReset ? 1.5 : 3.8;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(isReset ? 160 : 950, blastTime);
      filter.frequency.exponentialRampToValueAtTime(isReset ? 30 : 45, blastTime + (isReset ? 1.1 : 3.2));

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(isReset ? 0.15 : 0.8, blastTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, blastTime + (isReset ? 1.2 : 3.5));

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(blastTime);
    } catch {}
  }

  playReassemble(duration = 2.2, mode: ExplosionMode = 'konami') {
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
      const isReset = mode === 'reset';


      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isReset ? 26 : 32, now);
      osc.frequency.exponentialRampToValueAtTime(isReset ? 110 : 240, now + duration * 0.82);
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(isReset ? 0.07 : 0.32, now + duration * 0.78);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration * 0.94);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration * 0.98);


      const lockOsc = ctx.createOscillator();
      const lockGain = ctx.createGain();
      const lockFilter = ctx.createBiquadFilter();
      lockFilter.type = 'lowpass';
      lockFilter.frequency.setValueAtTime(isReset ? 110 : 160, now + duration * 0.85);
      lockOsc.type = 'sine';
      lockOsc.frequency.setValueAtTime(isReset ? 70 : 90, now + duration * 0.85);
      lockOsc.frequency.exponentialRampToValueAtTime(isReset ? 32 : 42, now + duration + 0.35);
      lockGain.gain.setValueAtTime(0.0, now + duration * 0.85);
      lockGain.gain.linearRampToValueAtTime(isReset ? 0.10 : 0.28, now + duration * 0.92);
      lockGain.gain.exponentialRampToValueAtTime(0.001, now + duration + 0.5);
      lockOsc.connect(lockFilter);
      lockFilter.connect(lockGain);
      lockGain.connect(ctx.destination);
      lockOsc.start(now + duration * 0.85);
      lockOsc.stop(now + duration + 0.6);
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
    gradient.addColorStop(0.18, 'rgba(255, 220, 100, 0.95)');
    gradient.addColorStop(0.42, 'rgba(255, 80, 20, 0.55)');
    gradient.addColorStop(0.72, 'rgba(200, 20, 0, 0.15)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSparkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.2, 'rgba(255, 240, 180, 0.85)');
    gradient.addColorStop(0.6, 'rgba(255, 120, 20, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.lineTo(32, 60);
    ctx.moveTo(4, 32);
    ctx.lineTo(60, 32);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSmokeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(180, 90, 45, 0.7)');
    gradient.addColorStop(0.35, 'rgba(120, 50, 25, 0.45)');
    gradient.addColorStop(0.7, 'rgba(50, 30, 30, 0.2)');
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
  private explosionSceneBuilt = false;

  private currentMode: ExplosionMode = 'konami';
  private buildupDuration = 0.75;
  private driftDuration = 4.6;
  private reassembleDuration = 2.2;

  private phase: ExplosionPhase = 'idle';
  private explosionStartTime = 0;
  private reassembleStartTime = 0;


  private chunks: ChunkData[] = [];
  private buildupCoreMesh!: THREE.Mesh;
  private tectonicCracksMesh!: THREE.LineSegments;
  private flashMesh!: THREE.Mesh;
  private shockwave1!: THREE.Mesh;
  private shockwave2!: THREE.Mesh;
  private atmosphereBlastSphere!: THREE.Mesh;
  private northJet!: THREE.Mesh;
  private southJet!: THREE.Mesh;
  private remnantCore!: THREE.Mesh;
  private accretionDisk!: THREE.Mesh;


  private particleSystemFire!: THREE.Points;
  private particleSystemSparks!: THREE.Points;
  private particleSystemSmoke!: THREE.Points;


  private firePositions!: Float32Array;
  private fireColors!: Float32Array;
  private fireVelocities!: Float32Array;
  private fireInitialPositions!: Float32Array;
  private fireReassemblePositions!: Float32Array;

  private sparkPositions!: Float32Array;
  private sparkVelocities!: Float32Array;
  private sparkInitialPositions!: Float32Array;

  private smokePositions!: Float32Array;
  private smokeVelocities!: Float32Array;
  private smokeInitialPositions!: Float32Array;


  private textures: THREE.Texture[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(scene: THREE.Scene, callbacks: ExplosionCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
    this.rootGroup.name = 'planet-explosion-group';
    this.scene.add(this.rootGroup);
    this.ensureExplosionScene();
  }



  start(mode: ExplosionMode = 'konami') {
    if (this.phase !== 'idle' && this.phase !== 'restored') {
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }

    this.ensureExplosionScene();
    this.resetObjects();

    this.currentMode = mode;
    if (mode === 'reset') {

      this.buildupDuration = 0.08;
      this.driftDuration = 0.32;
      this.reassembleDuration = 1.85;
    } else {

      this.buildupDuration = 0.75;
      this.driftDuration = 4.60;
      this.reassembleDuration = 2.20;
    }

    this.phase = 'buildup';
    this.callbacks.onPhaseChange('buildup', mode);
    this.explosionStartTime = performance.now();
    this.reassembleStartTime = 0;
    this.sound.playExplosion(this.buildupDuration, mode);
    this.loop();
  }

  startResetReassemble() {
    this.start('reset');
  }

  triggerResetPulse() {
    this.start('reset');
  }

  triggerResetExplosion() {
    this.start('reset');
  }

  requestReassemble() {
    if (this.phase === 'exploding') {
      this.startReassembly();
    }
  }

  private ensureExplosionScene() {
    if (this.explosionSceneBuilt) return;
    this.explosionSceneBuilt = true;
    this.buildExplosionScene();
  }

  private startReassembly() {
    if (this.phase === 'reassembling' || this.phase === 'restored') return;
    this.phase = 'reassembling';
    this.reassembleStartTime = performance.now();
    this.callbacks.onPhaseChange('reassembling', this.currentMode);
    this.sound.playReassemble(this.reassembleDuration, this.currentMode);

    if (this.shockwave1) this.shockwave1.visible = false;
    if (this.shockwave2) this.shockwave2.visible = false;
    if (this.atmosphereBlastSphere) this.atmosphereBlastSphere.visible = false;
    if (this.northJet) this.northJet.visible = false;
    if (this.southJet) this.southJet.visible = false;

    for (const chunk of this.chunks) {
      chunk.reassembleStartPos.copy(chunk.mesh.position);
      chunk.reassembleStartQuat.copy(chunk.mesh.quaternion);
    }

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
    const sparkTexture = createSparkTexture();
    const smokeTexture = createSmokeTexture();
    this.textures.push(glowTexture, sparkTexture, smokeTexture);


    const buildupGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.01, 40, 40);
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


    this.buildTectonicCracks();


    const flashGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.05, 36, 36);
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


    const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.02, 40, 40);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide
    });
    this.atmosphereBlastSphere = new THREE.Mesh(atmoGeo, atmoMat);
    this.atmosphereBlastSphere.visible = false;
    this.geometries.push(atmoGeo);
    this.materials.push(atmoMat);
    this.rootGroup.add(this.atmosphereBlastSphere);


    const jetGeo = new THREE.CylinderGeometry(3, 40, 850, 16, 1, true);
    jetGeo.translate(0, 425, 0);
    const jetMat = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.geometries.push(jetGeo);
    this.materials.push(jetMat);

    this.northJet = new THREE.Mesh(jetGeo, jetMat);
    this.northJet.visible = false;
    this.southJet = new THREE.Mesh(jetGeo, jetMat);
    this.southJet.rotation.x = Math.PI;
    this.southJet.visible = false;
    this.rootGroup.add(this.northJet, this.southJet);


    const ring1Geo = new THREE.RingGeometry(GLOBE_RADIUS * 0.95, GLOBE_RADIUS * 1.35, 80);
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

    const ring2Geo = new THREE.RingGeometry(GLOBE_RADIUS * 0.95, GLOBE_RADIUS * 1.25, 80);
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


    const remnantGeo = new THREE.SphereGeometry(14, 28, 28);
    const remnantMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
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

    const diskGeo = new THREE.RingGeometry(18, 52, 64);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.accretionDisk = new THREE.Mesh(diskGeo, diskMat);
    this.accretionDisk.rotation.x = Math.PI / 2.8;
    this.accretionDisk.rotation.z = Math.PI / 6;
    this.accretionDisk.visible = false;
    this.geometries.push(diskGeo);
    this.materials.push(diskMat);
    this.rootGroup.add(this.accretionDisk);


    this.buildChunks();


    this.buildParticles(glowTexture, sparkTexture, smokeTexture);
  }

  private buildTectonicCracks() {
    const crackPositions: number[] = [];
    const crackColors: number[] = [];
    const numBranches = 90;

    for (let i = 0; i < numBranches; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / numBranches);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      let cur = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize().multiplyScalar(GLOBE_RADIUS * 1.008);

      const segmentsInBranch = 3 + Math.floor(Math.random() * 4);
      for (let s = 0; s < segmentsInBranch; s++) {
        const stepAngle = Math.random() * Math.PI * 2;
        const stepDist = 8 + Math.random() * 12;
        const next = cur.clone().add(new THREE.Vector3(
          Math.cos(stepAngle) * stepDist,
          (Math.random() - 0.5) * stepDist,
          Math.sin(stepAngle) * stepDist
        )).normalize().multiplyScalar(GLOBE_RADIUS * 1.008);

        crackPositions.push(cur.x, cur.y, cur.z, next.x, next.y, next.z);
        crackColors.push(1.0, 0.85, 0.3, 1.0, 0.45, 0.05);
        cur = next;
      }
    }

    const crackGeo = new THREE.BufferGeometry();
    crackGeo.setAttribute('position', new THREE.Float32BufferAttribute(crackPositions, 3));
    crackGeo.setAttribute('color', new THREE.Float32BufferAttribute(crackColors, 3));
    this.geometries.push(crackGeo);

    const crackMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.materials.push(crackMat);

    this.tectonicCracksMesh = new THREE.LineSegments(crackGeo, crackMat);
    this.tectonicCracksMesh.visible = false;
    this.rootGroup.add(this.tectonicCracksMesh);
  }

  private buildChunks() {
    this.chunks = [];
    const sharedMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide
    });
    this.materials.push(sharedMat);

    const crustColors: [number, number, number][] = [
      [0.08, 0.18, 0.32],
      [0.12, 0.28, 0.45],
      [0.14, 0.34, 0.22],
      [0.22, 0.42, 0.28],
      [0.55, 0.42, 0.26],
      [0.72, 0.65, 0.52],
      [0.82, 0.88, 0.94],
      [0.12, 0.12, 0.15],
    ];

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

      const isLarge = i < 70;
      const isMedium = i >= 70 && i < 180;
      const numSides = isLarge ? 6 : isMedium ? 5 : 4;
      const baseRadius = isLarge ? (14 + Math.random() * 8) : isMedium ? (8 + Math.random() * 6) : (4 + Math.random() * 4);

      const outerRing: THREE.Vector3[] = [];
      const innerRing: THREE.Vector3[] = [];

      for (let s = 0; s < numSides; s++) {
        const angle = (s / numSides) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
        const radius = baseRadius * (0.8 + Math.random() * 0.4);
        const offset = new THREE.Vector3()
          .addScaledVector(tangentU, Math.cos(angle) * radius)
          .addScaledVector(tangentV, Math.sin(angle) * radius);

        const outerPt = dir.clone().multiplyScalar(GLOBE_RADIUS).add(offset).normalize().multiplyScalar(GLOBE_RADIUS);
        const mantleDepth = isLarge ? 0.91 : isMedium ? 0.93 : 0.95;
        const innerPt = dir.clone().multiplyScalar(GLOBE_RADIUS * mantleDepth).add(offset.clone().multiplyScalar(mantleDepth)).normalize().multiplyScalar(GLOBE_RADIUS * mantleDepth);
        outerRing.push(outerPt);
        innerRing.push(innerPt);
      }

      const topCenter = dir.clone().multiplyScalar(GLOBE_RADIUS);
      const bottomCenter = dir.clone().multiplyScalar(GLOBE_RADIUS * (isLarge ? 0.90 : 0.92));
      const centroid = dir.clone().multiplyScalar(GLOBE_RADIUS * 0.96);

      const topCenterLocal = topCenter.clone().sub(centroid);
      const bottomCenterLocal = bottomCenter.clone().sub(centroid);
      const outerLocal = outerRing.map(p => p.clone().sub(centroid));
      const innerLocal = innerRing.map(p => p.clone().sub(centroid));

      const positions: number[] = [];
      const colors: number[] = [];

      const baseCrust = crustColors[Math.floor(Math.random() * crustColors.length)];
      const crustR = baseCrust[0] * (0.9 + Math.random() * 0.2);
      const crustG = baseCrust[1] * (0.9 + Math.random() * 0.2);
      const crustB = baseCrust[2] * (0.9 + Math.random() * 0.2);

      const magmaR = 1.0;
      const magmaG = 0.35 + Math.random() * 0.45;
      const magmaB = 0.02;

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

      const speed = isLarge ? (65 + Math.random() * 55) : isMedium ? (110 + Math.random() * 80) : (180 + Math.random() * 110);
      const spreadAmount = isLarge ? 20 : isMedium ? 35 : 55;
      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * spreadAmount,
        (Math.random() - 0.5) * spreadAmount,
        (Math.random() - 0.5) * spreadAmount
      );
      const velocity = dir.clone().multiplyScalar(speed).add(spread);
      const rotSpeed = isLarge ? 2.5 : isMedium ? 4.5 : 7.0;
      const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * rotSpeed,
        (Math.random() - 0.5) * rotSpeed,
        (Math.random() - 0.5) * rotSpeed
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

  private buildParticles(glowTexture: THREE.Texture, sparkTexture: THREE.Texture, smokeTexture: THREE.Texture) {
    const fireCount = 1800;
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

      const speed = 50 + Math.random() * 160;
      this.fireVelocities[i * 3] = dirX * speed + (Math.random() - 0.5) * 35;
      this.fireVelocities[i * 3 + 1] = dirY * speed + (Math.random() - 0.5) * 35;
      this.fireVelocities[i * 3 + 2] = dirZ * speed + (Math.random() - 0.5) * 35;

      this.fireColors[i * 3] = 1.0;
      this.fireColors[i * 3 + 1] = 0.95;
      this.fireColors[i * 3 + 2] = 0.7;
    }

    this.fireInitialPositions = new Float32Array(this.firePositions);

    const fireGeo = new THREE.BufferGeometry();
    fireGeo.setAttribute('position', new THREE.BufferAttribute(this.firePositions, 3));
    fireGeo.setAttribute('color', new THREE.BufferAttribute(this.fireColors, 3));
    this.geometries.push(fireGeo);

    const fireMat = new THREE.PointsMaterial({
      size: 18,
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

    const sparkCount = 2200;
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

      const speed = 200 + Math.random() * 350;
      this.sparkVelocities[i * 3] = dirX * speed;
      this.sparkVelocities[i * 3 + 1] = dirY * speed;
      this.sparkVelocities[i * 3 + 2] = dirZ * speed;
    }

    this.sparkInitialPositions = new Float32Array(this.sparkPositions);

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    this.geometries.push(sparkGeo);

    const sparkMat = new THREE.PointsMaterial({
      size: 6,
      color: 0xfff2bb,
      map: sparkTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.materials.push(sparkMat);

    this.particleSystemSparks = new THREE.Points(sparkGeo, sparkMat);
    this.particleSystemSparks.visible = false;
    this.rootGroup.add(this.particleSystemSparks);

    const smokeCount = 1500;
    this.smokePositions = new Float32Array(smokeCount * 3);
    this.smokeVelocities = new Float32Array(smokeCount * 3);

    for (let i = 0; i < smokeCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const sinPhi = Math.sin(phi);

      const dirX = sinPhi * Math.cos(theta);
      const dirY = Math.cos(phi);
      const dirZ = sinPhi * Math.sin(theta);

      const startR = GLOBE_RADIUS * (0.4 + Math.random() * 0.6);
      this.smokePositions[i * 3] = dirX * startR;
      this.smokePositions[i * 3 + 1] = dirY * startR;
      this.smokePositions[i * 3 + 2] = dirZ * startR;

      const speed = 25 + Math.random() * 70;
      this.smokeVelocities[i * 3] = dirX * speed + (Math.random() - 0.5) * 20;
      this.smokeVelocities[i * 3 + 1] = dirY * speed + (Math.random() - 0.5) * 20;
      this.smokeVelocities[i * 3 + 2] = dirZ * speed + (Math.random() - 0.5) * 20;
    }

    this.smokeInitialPositions = new Float32Array(this.smokePositions);

    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3));
    this.geometries.push(smokeGeo);

    const smokeMat = new THREE.PointsMaterial({
      size: 36,
      color: 0xdd8855,
      map: smokeTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.NormalBlending,
      depthWrite: false
    });
    this.materials.push(smokeMat);

    this.particleSystemSmoke = new THREE.Points(smokeGeo, smokeMat);
    this.particleSystemSmoke.visible = false;
    this.rootGroup.add(this.particleSystemSmoke);
  }

  private loop = () => {
    const now = performance.now();

    if (this.phase === 'buildup') {
      const elapsed = (now - this.explosionStartTime) / 1000;
      if (elapsed < this.buildupDuration) {
        this.updateBuildup(elapsed);
      } else {
        this.phase = 'exploding';
        this.callbacks.onPhaseChange('exploding', this.currentMode);
        this.callbacks.onGlobeVisibility(false);
        this.setNativeGlobeVisible(false);
        this.updateExplosion(0);
      }
    } else if (this.phase === 'exploding') {
      const elapsed = (now - this.explosionStartTime) / 1000 - this.buildupDuration;
      this.updateExplosion(elapsed);
      if (elapsed >= this.driftDuration) {
        this.startReassembly();
      }
    } else if (this.phase === 'reassembling') {
      const elapsed = (now - this.reassembleStartTime) / 1000;
      const progress = Math.min(1, Math.max(0, elapsed / this.reassembleDuration));
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
    const p = t / this.buildupDuration;

    const flicker = Math.sin(t * 40) * 0.2 + Math.sin(t * 70) * 0.12;
    const coreMat = this.buildupCoreMesh.material as THREE.MeshBasicMaterial;
    coreMat.opacity = Math.min(1, p * 0.95 + flicker);
    this.buildupCoreMesh.scale.setScalar(1 + p * 0.05 + flicker * 0.02);

    if (this.tectonicCracksMesh) {
      this.tectonicCracksMesh.visible = true;
      const crackMat = this.tectonicCracksMesh.material as THREE.LineBasicMaterial;
      crackMat.opacity = Math.min(1.0, Math.pow(p, 1.8) * 1.3);
    }

    const shakeAmp = p * (this.currentMode === 'reset' ? 1.4 : 5.5);
    const shakeX = (Math.random() - 0.5) * shakeAmp * 2;
    const shakeY = (Math.random() - 0.5) * shakeAmp * 2;
    this.callbacks.onShake(shakeX, shakeY);
  }

  private updateExplosion(t: number) {
    const sizeScale = this.currentMode === 'reset' ? 0.55 : 1.0;
    const speedBoost = this.currentMode === 'reset' ? 1.65 : 1.0;
    const blastDecay = Math.exp(-t * (this.currentMode === 'reset' ? 6.5 : 2.6));
    const shakeAmp = blastDecay * (this.currentMode === 'reset' ? 3.6 : 18.0);
    const shakeX = (Math.sin(t * 55) + (Math.random() - 0.5)) * shakeAmp;
    const shakeY = (Math.cos(t * 45) + (Math.random() - 0.5)) * shakeAmp;
    this.callbacks.onShake(shakeX, shakeY);

    this.buildupCoreMesh.visible = false;
    if (this.tectonicCracksMesh) this.tectonicCracksMesh.visible = false;

    const flashDuration = this.currentMode === 'reset' ? 0.22 : 0.7;
    if (t < flashDuration) {
      this.flashMesh.visible = true;
      const flashP = t / flashDuration;
      this.flashMesh.scale.setScalar((1 + flashP * 2.8) * sizeScale);
      const flashMat = this.flashMesh.material as THREE.MeshBasicMaterial;
      flashMat.opacity = Math.max(0, 1 - flashP * flashP);
    } else {
      this.flashMesh.visible = false;
    }

    const atmoDuration = this.currentMode === 'reset' ? 0.28 : 1.4;
    if (t < atmoDuration) {
      this.atmosphereBlastSphere.visible = true;
      const atmoP = t / atmoDuration;
      this.atmosphereBlastSphere.scale.setScalar((1.0 + atmoP * 4.5) * sizeScale);
      const atmoMat = this.atmosphereBlastSphere.material as THREE.MeshBasicMaterial;
      atmoMat.opacity = Math.max(0, 0.75 * (1 - atmoP));
    } else {
      this.atmosphereBlastSphere.visible = false;
    }

    const jetDuration = this.currentMode === 'reset' ? 0.28 : 1.2;
    if (t < jetDuration) {
      this.northJet.visible = true;
      this.southJet.visible = true;
      const jetP = t / jetDuration;
      const jetScaleY = Math.min(1.0, t / (jetDuration * 0.25)) * sizeScale;
      this.northJet.scale.set((1.0 + jetP * 1.5) * sizeScale, jetScaleY, (1.0 + jetP * 1.5) * sizeScale);
      this.southJet.scale.set((1.0 + jetP * 1.5) * sizeScale, jetScaleY, (1.0 + jetP * 1.5) * sizeScale);
      const jetMat = this.northJet.material as THREE.MeshBasicMaterial;
      jetMat.opacity = Math.max(0, 0.95 * (1 - jetP));
    } else {
      this.northJet.visible = false;
      this.southJet.visible = false;
    }

    const shockDuration = this.currentMode === 'reset' ? 0.32 : 2.0;
    if (t < shockDuration) {
      this.shockwave1.visible = true;
      this.shockwave2.visible = true;
      const shockP = t / shockDuration;

      const r1 = (1 + shockP * 7.5) * sizeScale;
      this.shockwave1.scale.setScalar(r1);
      (this.shockwave1.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - shockP));

      const r2 = (1 + shockP * 6.2) * sizeScale;
      this.shockwave2.scale.setScalar(r2);
      (this.shockwave2.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 * (1 - shockP));
    } else {
      this.shockwave1.visible = false;
      this.shockwave2.visible = false;
    }

    this.remnantCore.visible = true;
    this.accretionDisk.visible = true;
    const pulse = Math.sin(t * 10) * 0.2;
    this.remnantCore.scale.setScalar((1 + pulse) * sizeScale);
    (this.remnantCore.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t / 0.18) * 0.9 * Math.max(0, 1 - t / this.driftDuration);

    this.accretionDisk.rotation.z += 0.08 * speedBoost;
    this.accretionDisk.scale.setScalar(sizeScale);
    (this.accretionDisk.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t / 0.18) * 0.75 * Math.max(0, 1 - t / this.driftDuration);

    const drag = Math.max(0.12, 1 - t * 0.12);
    for (const chunk of this.chunks) {
      chunk.mesh.visible = true;
      chunk.mesh.position.addScaledVector(chunk.velocity, 0.016 * drag * sizeScale * speedBoost);
      chunk.mesh.rotation.x += chunk.angularVelocity.x * 0.016 * speedBoost;
      chunk.mesh.rotation.y += chunk.angularVelocity.y * 0.016 * speedBoost;
      chunk.mesh.rotation.z += chunk.angularVelocity.z * 0.016 * speedBoost;
    }

    this.particleSystemFire.visible = true;
    this.particleSystemSparks.visible = true;
    this.particleSystemSmoke.visible = true;

    const fireCount = this.firePositions.length / 3;
    const firePosAttr = this.particleSystemFire.geometry.attributes.position as THREE.BufferAttribute;
    const fireColAttr = this.particleSystemFire.geometry.attributes.color as THREE.BufferAttribute;
    const fireMat = this.particleSystemFire.material as THREE.PointsMaterial;
    fireMat.opacity = Math.max(0, 0.92 - t * (this.currentMode === 'reset' ? 0.35 : 0.18));

    for (let i = 0; i < fireCount; i++) {
      const idx = i * 3;
      this.firePositions[idx] += this.fireVelocities[idx] * 0.016 * drag * sizeScale * speedBoost;
      this.firePositions[idx + 1] += this.fireVelocities[idx + 1] * 0.016 * drag * sizeScale * speedBoost;
      this.firePositions[idx + 2] += this.fireVelocities[idx + 2] * 0.016 * drag * sizeScale * speedBoost;

      const heat = Math.max(0, 1 - t * (this.currentMode === 'reset' ? 0.7 : 0.35));
      this.fireColors[idx] = heat > 0.5 ? 1.0 : heat * 2.0;
      this.fireColors[idx + 1] = heat * 0.85;
      this.fireColors[idx + 2] = heat * heat * 0.45;
    }
    firePosAttr.needsUpdate = true;
    fireColAttr.needsUpdate = true;

    const sparkCount = this.sparkPositions.length / 3;
    const sparkPosAttr = this.particleSystemSparks.geometry.attributes.position as THREE.BufferAttribute;
    const sparkMat = this.particleSystemSparks.material as THREE.PointsMaterial;
    sparkMat.opacity = Math.max(0, 1.0 - t * (this.currentMode === 'reset' ? 0.9 : 0.45));

    for (let i = 0; i < sparkCount; i++) {
      const idx = i * 3;
      this.sparkPositions[idx] += this.sparkVelocities[idx] * 0.016 * sizeScale * speedBoost;
      this.sparkPositions[idx + 1] += this.sparkVelocities[idx + 1] * 0.016 * sizeScale * speedBoost;
      this.sparkPositions[idx + 2] += this.sparkVelocities[idx + 2] * 0.016 * sizeScale * speedBoost;
    }
    sparkPosAttr.needsUpdate = true;

    const smokeCount = this.smokePositions.length / 3;
    const smokePosAttr = this.particleSystemSmoke.geometry.attributes.position as THREE.BufferAttribute;
    const smokeMat = this.particleSystemSmoke.material as THREE.PointsMaterial;
    smokeMat.opacity = Math.min(0.45, t * 1.0) * Math.max(0, 1 - t / (this.driftDuration + 1));

    for (let i = 0; i < smokeCount; i++) {
      const idx = i * 3;
      this.smokePositions[idx] += this.smokeVelocities[idx] * 0.016 * drag * sizeScale * speedBoost;
      this.smokePositions[idx + 1] += this.smokeVelocities[idx + 1] * 0.016 * drag * sizeScale * speedBoost;
      this.smokePositions[idx + 2] += this.smokeVelocities[idx + 2] * 0.016 * drag * sizeScale * speedBoost;
    }
    smokePosAttr.needsUpdate = true;
  }

  private updateReassemble(p: number) {
    const sizeScale = this.currentMode === 'reset' ? 0.55 : 1.0;

    const ease = this.currentMode === 'reset'
      ? (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
      : p * p * (3 - 2 * p);

    const shakeAmp = (1 - ease) * (this.currentMode === 'reset' ? 0.6 : 3.5);
    this.callbacks.onShake(
      (Math.random() - 0.5) * shakeAmp,
      (Math.random() - 0.5) * shakeAmp
    );

    for (const chunk of this.chunks) {
      chunk.mesh.position.copy(chunk.reassembleStartPos).lerp(chunk.initialPos, ease);
      chunk.mesh.quaternion.copy(chunk.reassembleStartQuat).slerp(chunk.initialQuat, ease);
    }

    if (this.remnantCore) {
      this.remnantCore.scale.setScalar(Math.max(0.001, (1 - ease) * 1.5 * sizeScale));
      (this.remnantCore.material as THREE.MeshBasicMaterial).opacity = (1 - ease) * 0.85;
    }
    if (this.accretionDisk) {
      this.accretionDisk.scale.setScalar(Math.max(0.001, (1 - ease) * sizeScale));
      (this.accretionDisk.material as THREE.MeshBasicMaterial).opacity = (1 - ease) * 0.7;
    }

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
    (this.particleSystemSmoke.material as THREE.PointsMaterial).opacity = Math.max(0, (1 - ease) * 0.4);

    if (p > 0.75) {
      this.flashMesh.visible = true;
      const flashP = (p - 0.75) / 0.25;
      const flashMat = this.flashMesh.material as THREE.MeshBasicMaterial;
      flashMat.color.setHex(0x60a5fa);
      flashMat.opacity = Math.sin(flashP * Math.PI) * 0.85;
      this.flashMesh.scale.setScalar((1.0 + Math.sin(flashP * Math.PI) * 0.15) * sizeScale);
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
    this.callbacks.onPhaseChange('restored', this.currentMode);
    this.resetObjects();
  }

  private resetObjects() {
    for (const chunk of this.chunks) {
      chunk.mesh.visible = false;
      chunk.mesh.position.copy(chunk.initialPos);
      chunk.mesh.quaternion.copy(chunk.initialQuat);
    }

    if (this.firePositions && this.fireInitialPositions) {
      this.firePositions.set(this.fireInitialPositions);
      (this.particleSystemFire.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.sparkPositions && this.sparkInitialPositions) {
      this.sparkPositions.set(this.sparkInitialPositions);
      (this.particleSystemSparks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    if (this.smokePositions && this.smokeInitialPositions) {
      this.smokePositions.set(this.smokeInitialPositions);
      (this.particleSystemSmoke.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    if (this.buildupCoreMesh) this.buildupCoreMesh.visible = false;
    if (this.tectonicCracksMesh) this.tectonicCracksMesh.visible = false;
    if (this.flashMesh) {
      this.flashMesh.visible = false;
      (this.flashMesh.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
    }
    if (this.atmosphereBlastSphere) this.atmosphereBlastSphere.visible = false;
    if (this.northJet) this.northJet.visible = false;
    if (this.southJet) this.southJet.visible = false;
    if (this.shockwave1) this.shockwave1.visible = false;
    if (this.shockwave2) this.shockwave2.visible = false;
    if (this.remnantCore) this.remnantCore.visible = false;
    if (this.accretionDisk) this.accretionDisk.visible = false;
    if (this.particleSystemFire) this.particleSystemFire.visible = false;
    if (this.particleSystemSparks) this.particleSystemSparks.visible = false;
    if (this.particleSystemSmoke) this.particleSystemSmoke.visible = false;
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
