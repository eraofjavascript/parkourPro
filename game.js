import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';

export class Game {
  constructor(scene, camera, renderer, config = {}) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.clock = new THREE.Clock();

    // Use config values or defaults
    this.GRAVITY = config.gravity || 25;
    this.NUM_SPHERES = config.ballLimit || 100;
    this.SPHERE_RADIUS = 0.2;
    this.STEPS_PER_FRAME = 5;
    this.playerSpeed = config.playerSpeed || 95;
    this.airControl = config.airControl || 18;
    this.throwCooldown = 0.03;
    this.throwTimer = 0;
    this.ballsThrown = 0;

    // Store config
    this.config = config;
    this.useBalls = config.useBalls !== undefined ? config.useBalls : true;
    this.levelNumber = config.levelNumber || 1;

    // Set initial camera rotation from config
    const initialRotationY = config.playerLookAt?.rotationY || 0;
    const initialRotationX = config.playerLookAt?.rotationX || 0;
    this.camera.rotation.set(initialRotationX, initialRotationY, 0);

    // Time tracking
    this.startTime = null;
    this.pausedTime = 0; // Total time spent paused
    this.pauseStartTime = null; // When the current pause started
    this.completionTime = null; // Final time when level completed
    this.levelCompleted = false;
    
    // Death tracking
    this.deathCount = 0;

    this.worldOctree = new Octree();
    this.playerCollider = new Capsule(
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(0, 1.65, 0),
      0.35
    );

    this.playerVelocity = new THREE.Vector3();
    this.playerDirection = new THREE.Vector3();
    this.playerOnFloor = false;
    this.mouseTime = 0;
    this.keyStates = {};

    this.vector1 = new THREE.Vector3();
    this.vector2 = new THREE.Vector3();
    this.vector3 = new THREE.Vector3();

    this.joystickDX = 0;
    this.joystickDY = 0;

    this.spheres = [];
    this.sphereIdx = 0;
    this.shockwaves = [];

    this.isPaused = false;
    
    // Load sensitivity from localStorage or default to 1.0
    this.sensitivity = parseFloat(localStorage.getItem('mouseSensitivity')) || 1.0;

    // Initialize walking sound
    this.initWalkingSound();

    // Store event listeners for cleanup
    this.eventListeners = {
      keydown: null,
      keyup: null,
      mousedown: null,
      mouseup: null,
      mousemove: null,
      touchstartBody: null,
      touchmoveBody: null,
      touchendBody: null,
      touchstartJump: null,
      touchendJump: null,
      touchstartThrow: null,
      touchendThrow: null,
      touchstartJoystick: null,
      touchmoveJoystick: null,
      touchendJoystick: null,
      resizeJoystick: null
    };

    this.initSpheres();
    this.initControls();
  }

  initWalkingSound() {
    // Create new walking sound instance
    this.walkingSound = new Audio('sound/walking.mp3');
    this.walkingSound.loop = true;
    this.walkingSound.volume = 0.5;
    this.walkingSound.playbackRate = 1.5;
    this.isWalkingSoundPlaying = false;
  }

  unloadWalkingSound() {
    // Stop and unload the walking sound completely
    if (this.walkingSound) {
      if (this.isWalkingSoundPlaying) {
        this.walkingSound.pause();
        this.isWalkingSoundPlaying = false;
      }
      this.walkingSound.src = '';
      this.walkingSound.load();
      this.walkingSound = null;
    }
  }

  initSpheres() {
    const sphereGeometry = new THREE.IcosahedronGeometry(this.SPHERE_RADIUS, 5);
    const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

    for (let i = 0; i < this.NUM_SPHERES; i++) {
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      sphere.position.set(0, -100, 0);
      this.scene.add(sphere);
      this.spheres.push({
        mesh: sphere,
        collider: new THREE.Sphere(new THREE.Vector3(0, -100, 0), this.SPHERE_RADIUS),
        velocity: new THREE.Vector3()
      });
    }
  }

  initControls() {
    // Store handlers for cleanup
    this.eventListeners.keydown = (e) => { this.keyStates[e.code] = true; };
    this.eventListeners.keyup = (e) => { this.keyStates[e.code] = false; };
    
    document.addEventListener('keydown', this.eventListeners.keydown);
    document.addEventListener('keyup', this.eventListeners.keyup);

    const container = document.getElementById('container');
    this.eventListeners.mousedown = () => {
      document.body.requestPointerLock();
      this.mouseTime = performance.now();
    };
    container.addEventListener('mousedown', this.eventListeners.mousedown);

    this.eventListeners.mouseup = () => {
      if (document.pointerLockElement !== null) this.throwBall();
    };
    document.addEventListener('mouseup', this.eventListeners.mouseup);

    this.eventListeners.mousemove = (event) => {
      if (document.pointerLockElement === document.body) {
        this.camera.rotation.y -= (event.movementX / 500) * this.sensitivity;
        this.camera.rotation.x -= (event.movementY / 500) * this.sensitivity;
        this.camera.rotation.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2, this.camera.rotation.x));
      }
    };
    document.body.addEventListener('mousemove', this.eventListeners.mousemove);

    this.initTouchControls();
    this.initJoystick();
  }

  initTouchControls() {
    let lookTouchId = null;
    let lookTouchX, lookTouchY;
    const joystickTouchId = null;

    this.eventListeners.touchstartBody = (event) => {
      for (const touch of event.changedTouches) {
        if (touch.clientX > window.innerWidth / 2 && lookTouchId === null && touch.identifier !== joystickTouchId) {
          lookTouchId = touch.identifier;
          lookTouchX = touch.clientX;
          lookTouchY = touch.clientY;
        }
      }
    };
    document.body.addEventListener('touchstart', this.eventListeners.touchstartBody, { passive: true });

    this.eventListeners.touchmoveBody = (event) => {
      for (const touch of event.changedTouches) {
        if (touch.identifier === lookTouchId && touch.identifier !== joystickTouchId) {
          const deltaX = touch.clientX - lookTouchX;
          const deltaY = touch.clientY - lookTouchY;
          const baseSensitivity = 200;
          const lookSensitivity = baseSensitivity / this.sensitivity;
          this.camera.rotation.y -= deltaX / lookSensitivity;
          this.camera.rotation.x -= deltaY / lookSensitivity;
          this.camera.rotation.x = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2, this.camera.rotation.x));
          lookTouchX = touch.clientX;
          lookTouchY = touch.clientY;
          event.preventDefault();
        }
      }
    };
    document.body.addEventListener('touchmove', this.eventListeners.touchmoveBody, { passive: false });

    this.eventListeners.touchendBody = (event) => {
      for (const touch of event.changedTouches) {
        if (touch.identifier === lookTouchId) lookTouchId = null;
      }
    };
    document.body.addEventListener('touchend', this.eventListeners.touchendBody, { passive: true });

    const jumpButton = document.getElementById("jump-button");
    let jumpInterval = null;
    
    this.eventListeners.touchstartJump = (e) => {
      e.preventDefault();
      
      if (this.playerOnFloor) this.playerVelocity.y = 12;
      
      if (jumpInterval) clearInterval(jumpInterval);
      
      jumpInterval = setInterval(() => {
        if (this.playerOnFloor) {
          this.playerVelocity.y = 12;
        }
      }, 200);
    };
    jumpButton.addEventListener("touchstart", this.eventListeners.touchstartJump, { passive: false });
    
    this.eventListeners.touchendJump = (e) => {
      e.preventDefault();
      if (jumpInterval) {
        clearInterval(jumpInterval);
        jumpInterval = null;
      }
    };
    jumpButton.addEventListener("touchend", this.eventListeners.touchendJump, { passive: false });

    const throwButton = document.getElementById("throw-button");
    let throwHoldTimer = null;

    const throwBallMobile = () => {
      this.mouseTime = performance.now();
      this.throwBall();
    };

    this.eventListeners.touchstartThrow = (e) => {
      e.preventDefault();
      throwHoldTimer = setTimeout(() => {
        throwBallMobile();
      }, 2000);
    };
    throwButton.addEventListener("touchstart", this.eventListeners.touchstartThrow);

    this.eventListeners.touchendThrow = (e) => {
      e.preventDefault();
      if (throwHoldTimer) {
        clearTimeout(throwHoldTimer);
        throwBallMobile();
        throwHoldTimer = null;
      }
    };
    throwButton.addEventListener("touchend", this.eventListeners.touchendThrow);
  }

  initJoystick() {
    const joystickZone = document.getElementById('joystick-zone');
    const joystickStick = document.getElementById('joystick-stick');
    let joystickTouchId = null;
    const joystickCenter = { x: 60, y: 60 };

    let zoneRect = null;
    const updateZoneRect = () => { 
      zoneRect = joystickZone.getBoundingClientRect();
    };
    this.updateJoystickRect = updateZoneRect;
    updateZoneRect();
    
    this.eventListeners.resizeJoystick = updateZoneRect;
    window.addEventListener('resize', this.eventListeners.resizeJoystick);

    this.eventListeners.touchstartJoystick = (e) => {
      for (const touch of e.changedTouches) {
        if (joystickTouchId === null) {
          updateZoneRect();
          const x = touch.clientX - (zoneRect.left + joystickCenter.x);
          const y = touch.clientY - (zoneRect.top + joystickCenter.y);
          if (x * x + y * y <= 60 * 60) {
            joystickTouchId = touch.identifier;
            joystickStick.style.transition = 'none';
            const dx = touch.clientX - (zoneRect.left + joystickCenter.x);
            const dy = touch.clientY - (zoneRect.top + joystickCenter.y);
            joystickStick.style.left = (joystickCenter.x + dx - 25) + 'px';
            joystickStick.style.top = (joystickCenter.y + dy - 25) + 'px';
            e.preventDefault();
          }
        }
      }
    };
    joystickZone.addEventListener('touchstart', this.eventListeners.touchstartJoystick, { passive: false });

    this.eventListeners.touchmoveJoystick = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === joystickTouchId) {
          updateZoneRect();
          let dx = touch.clientX - (zoneRect.left + joystickCenter.x);
          let dy = touch.clientY - (zoneRect.top + joystickCenter.y);
          const maxR = 40;
          const dist = Math.hypot(dx, dy);

          if (dist > maxR) {
            const angle = Math.atan2(dy, dx);
            dx = Math.cos(angle) * maxR;
            dy = Math.sin(angle) * maxR;
          }

          this.joystickDX = dx / maxR;
          this.joystickDY = dy / maxR;

          joystickStick.style.left = (joystickCenter.x + dx - 25) + 'px';
          joystickStick.style.top = (joystickCenter.y + dy - 25) + 'px';
          e.preventDefault();
        }
      }
    };
    joystickZone.addEventListener('touchmove', this.eventListeners.touchmoveJoystick, { passive: false });

    this.eventListeners.touchendJoystick = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === joystickTouchId) {
          joystickTouchId = null;
          this.joystickDX = 0;
          this.joystickDY = 0;
          joystickStick.style.transition = 'left 0.1s ease-out, top 0.1s ease-out';
          joystickStick.style.left = (joystickCenter.x - 25) + 'px';
          joystickStick.style.top = (joystickCenter.y - 25) + 'px';
          e.preventDefault();
        }
      }
    };
    joystickZone.addEventListener('touchend', this.eventListeners.touchendJoystick, { passive: false });
  }


  destroy() {
    // Unload walking sound completely
    this.unloadWalkingSound();

    // Dispose of all spheres
    if (this.spheres && this.spheres.length > 0) {
      this.spheres.forEach(sphere => {
        if (sphere.mesh) {
          this.scene.remove(sphere.mesh);
          if (sphere.mesh.geometry) sphere.mesh.geometry.dispose();
          if (sphere.mesh.material) sphere.mesh.material.dispose();
        }
      });
      this.spheres = [];
    }
    
    // Dispose of all shockwaves
    if (this.shockwaves && this.shockwaves.length > 0) {
      this.shockwaves.forEach(shockwave => {
        if (shockwave.mesh) {
          this.scene.remove(shockwave.mesh);
          if (shockwave.mesh.geometry) shockwave.mesh.geometry.dispose();
          if (shockwave.mesh.material) shockwave.mesh.material.dispose();
        }
      });
      this.shockwaves = [];
    }
    
    // Remove all event listeners to prevent memory leaks
    if (this.eventListeners.keydown) {
      document.removeEventListener('keydown', this.eventListeners.keydown);
    }
    if (this.eventListeners.keyup) {
      document.removeEventListener('keyup', this.eventListeners.keyup);
    }
    
    const container = document.getElementById('container');
    if (this.eventListeners.mousedown && container) {
      container.removeEventListener('mousedown', this.eventListeners.mousedown);
    }
    if (this.eventListeners.mouseup) {
      document.removeEventListener('mouseup', this.eventListeners.mouseup);
    }
    if (this.eventListeners.mousemove) {
      document.body.removeEventListener('mousemove', this.eventListeners.mousemove);
    }
    
    if (this.eventListeners.touchstartBody) {
      document.body.removeEventListener('touchstart', this.eventListeners.touchstartBody);
    }
    if (this.eventListeners.touchmoveBody) {
      document.body.removeEventListener('touchmove', this.eventListeners.touchmoveBody);
    }
    if (this.eventListeners.touchendBody) {
      document.body.removeEventListener('touchend', this.eventListeners.touchendBody);
    }
    
    const jumpButton = document.getElementById("jump-button");
    if (this.eventListeners.touchstartJump && jumpButton) {
      jumpButton.removeEventListener("touchstart", this.eventListeners.touchstartJump);
    }
    if (this.eventListeners.touchendJump && jumpButton) {
      jumpButton.removeEventListener("touchend", this.eventListeners.touchendJump);
    }
    
    const throwButton = document.getElementById("throw-button");
    if (this.eventListeners.touchstartThrow && throwButton) {
      throwButton.removeEventListener("touchstart", this.eventListeners.touchstartThrow);
    }
    if (this.eventListeners.touchendThrow && throwButton) {
      throwButton.removeEventListener("touchend", this.eventListeners.touchendThrow);
    }
    
    const joystickZone = document.getElementById('joystick-zone');
    if (this.eventListeners.touchstartJoystick && joystickZone) {
      joystickZone.removeEventListener('touchstart', this.eventListeners.touchstartJoystick);
    }
    if (this.eventListeners.touchmoveJoystick && joystickZone) {
      joystickZone.removeEventListener('touchmove', this.eventListeners.touchmoveJoystick);
    }
    if (this.eventListeners.touchendJoystick && joystickZone) {
      joystickZone.removeEventListener('touchend', this.eventListeners.touchendJoystick);
    }
    
    if (this.eventListeners.resizeJoystick) {
      window.removeEventListener('resize', this.eventListeners.resizeJoystick);
    }
    
    // Clear keyStates
    this.keyStates = {};
  }

  pause() {
    this.isPaused = true;
    this.clock.stop();
    
    // Pause walking sound
    if (this.isWalkingSoundPlaying) {
      this.walkingSound.pause();
    }
    
    // Track when pause started (only if timer is running and not already paused)
    if (this.startTime && !this.pauseStartTime && !this.levelCompleted) {
      this.pauseStartTime = performance.now();
    }
  }

  resume() {
    this.isPaused = false;
    this.clock.start();
    
    // Add paused duration to total paused time
    if (this.pauseStartTime && !this.levelCompleted) {
      this.pausedTime += performance.now() - this.pauseStartTime;
      this.pauseStartTime = null;
    }
  }

  throwBall() {
    if (!this.useBalls) return;
    if (this.throwTimer > 0) return;
    if (this.ballsThrown >= this.NUM_SPHERES) return; // Ball limit reached

    const sphere = this.spheres[this.sphereIdx];
    this.camera.getWorldDirection(this.playerDirection);
    sphere.collider.center.copy(this.playerCollider.end).addScaledVector(this.playerDirection, this.playerCollider.radius * 1.5);
    const impulse = 15 + 30 * (1 - Math.exp((this.mouseTime - performance.now()) * 0.001));
    sphere.velocity.copy(this.playerDirection).multiplyScalar(impulse);
    sphere.velocity.addScaledVector(this.playerVelocity, 2);
    this.sphereIdx = (this.sphereIdx + 1) % this.spheres.length;
    this.ballsThrown++;

    this.throwTimer = this.throwCooldown;
  }

  createShockwave(position, color = 0x00aaff) {
    const ringCount = 40;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(ringCount * 3);
    const angles = [];
    const speeds = [];

    for (let i = 0; i < ringCount; i++) {
      const angle = (i / ringCount) * Math.PI * 2;
      angles.push(angle);
      speeds.push(4 + Math.random() * 2);

      positions[i * 3 + 0] = position.x + Math.cos(angle) * 0.1;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z + Math.sin(angle) * 0.1;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color,
      size: 0.3,
      transparent: true,
      opacity: 1,
    });

    const ring = new THREE.Points(geometry, material);
    this.scene.add(ring);

    const playerPos = this.playerCollider.end.clone();
    const dist = playerPos.distanceTo(position);
    if (dist < 2) {
      this.playerVelocity.y = 1.5;
    }

    this.shockwaves.push({ mesh: ring, angles, speeds, life: 1, position: position.clone() });
  }

  playerCollisions() {
    const result = this.worldOctree.capsuleIntersect(this.playerCollider);
    this.playerOnFloor = false;
    if (result) {
      this.playerOnFloor = result.normal.y > 0;
      if (!this.playerOnFloor) this.playerVelocity.addScaledVector(result.normal, -result.normal.dot(this.playerVelocity));
      if (result.depth >= 1e-10) this.playerCollider.translate(result.normal.multiplyScalar(result.depth));
    }
  }

  updatePlayer(deltaTime) {
    let damping = Math.exp(-20 * deltaTime) - 1;
    if (!this.playerOnFloor) {
      this.playerVelocity.y -= this.GRAVITY * deltaTime;
      damping *= 0.1;
    }
    this.playerVelocity.addScaledVector(this.playerVelocity, damping);
    const deltaPosition = this.playerVelocity.clone().multiplyScalar(deltaTime);
    this.playerCollider.translate(deltaPosition);
    this.playerCollisions();

    const CAMERA_NOSE_OFFSET = 0.08;
    const CAMERA_UP_OFFSET = 0.09;
    const CAMERA_LEFT_OFFSET = -0.03;

    const forward = this.getForwardVector().clone().normalize().multiplyScalar(CAMERA_NOSE_OFFSET);
    const side = this.getSideVector().clone().normalize().multiplyScalar(CAMERA_LEFT_OFFSET);
    const up = new THREE.Vector3(0, CAMERA_UP_OFFSET, 0);

    this.camera.position.copy(this.playerCollider.end)
      .add(forward)
      .add(side)
      .add(up);
  }

  playerSphereCollision(sphere) {
    const center = this.vector1.addVectors(this.playerCollider.start, this.playerCollider.end).multiplyScalar(0.5);
    const sphere_center = sphere.collider.center;
    const r = this.playerCollider.radius + sphere.collider.radius;
    const r2 = r * r;
    for (const point of [this.playerCollider.start, this.playerCollider.end, center]) {
      const d2 = point.distanceToSquared(sphere_center);
      if (d2 < r2) {
        const normal = this.vector1.subVectors(point, sphere_center).normalize();
        const v1 = this.vector2.copy(normal).multiplyScalar(normal.dot(this.playerVelocity));
        const v2 = this.vector3.copy(normal).multiplyScalar(normal.dot(sphere.velocity));
        this.playerVelocity.add(v2).sub(v1);
        sphere.velocity.add(v1).sub(v2);
        const d = (r - Math.sqrt(d2)) / 2;
        sphere_center.addScaledVector(normal, -d);
      }
    }
  }

  spheresCollisions() {
    for (let i = 0, length = this.spheres.length; i < length; i++) {
      const s1 = this.spheres[i];
      for (let j = i + 1; j < length; j++) {
        const s2 = this.spheres[j];
        const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
        const r = s1.collider.radius + s2.collider.radius;
        const r2 = r * r;
        if (d2 < r2) {
          const normal = this.vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
          const v1 = this.vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
          const v2 = this.vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));
          s1.velocity.add(v2).sub(v1);
          s2.velocity.add(v1).sub(v2);
          const d = (r - Math.sqrt(d2)) / 2;
          s1.collider.center.addScaledVector(normal, d);
          s2.collider.center.addScaledVector(normal, -d);
        }
      }
    }
  }

  updateSpheres(deltaTime) {
    this.spheres.forEach(sphere => {
      sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);
      const result = this.worldOctree.sphereIntersect(sphere.collider);
      if (result) {
        if (!sphere.hasExploded) {
          this.createShockwave(sphere.collider.center.clone(), 0x00aaff);
          sphere.hasExploded = true;
        }
        sphere.velocity.addScaledVector(result.normal, -result.normal.dot(sphere.velocity) * 1.5);
        sphere.collider.center.add(result.normal.multiplyScalar(result.depth));
      } else {
        sphere.velocity.y -= this.GRAVITY * deltaTime;
      }
      const damping = Math.exp(-1.5 * deltaTime) - 1;
      sphere.velocity.addScaledVector(sphere.velocity, damping);
    });
    this.spheresCollisions();
    for (const sphere of this.spheres) sphere.mesh.position.copy(sphere.collider.center);
  }

  updateShockwaves(deltaTime) {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= deltaTime * 12;

      const pos = s.mesh.geometry.attributes.position;
      for (let j = 0; j < s.angles.length; j++) {
        const r = (1 - s.life) * 6;
        const playerPos = this.playerCollider.end.clone();
        const dist = playerPos.distanceTo(s.position);

        if (dist < r && dist > r - 1) {
          this.playerVelocity.y = 25;
        }
        pos.array[j * 3 + 0] = s.position.x + Math.cos(s.angles[j]) * r;
        pos.array[j * 3 + 1] = s.position.y;
        pos.array[j * 3 + 2] = s.position.z + Math.sin(s.angles[j]) * r;
      }

      pos.needsUpdate = true;
      s.mesh.material.opacity = Math.max(0, s.life);

      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        this.shockwaves.splice(i, 1);
      }
    }
  }

  getForwardVector() {
    this.camera.getWorldDirection(this.playerDirection);
    this.playerDirection.y = 0;
    this.playerDirection.normalize();
    return this.playerDirection;
  }

  getSideVector() {
    this.camera.getWorldDirection(this.playerDirection);
    this.playerDirection.y = 0;
    this.playerDirection.normalize();
    this.playerDirection.cross(this.camera.up);
    return this.playerDirection;
  }

  controls(deltaTime) {
    const speedDelta = deltaTime * (this.playerOnFloor ? this.playerSpeed : this.airControl);
    if (this.keyStates['KeyW']) this.playerVelocity.add(this.getForwardVector().multiplyScalar(speedDelta));
    if (this.keyStates['KeyS']) this.playerVelocity.add(this.getForwardVector().multiplyScalar(-speedDelta));
    if (this.keyStates['KeyA']) this.playerVelocity.add(this.getSideVector().multiplyScalar(-speedDelta));
    if (this.keyStates['KeyD']) this.playerVelocity.add(this.getSideVector().multiplyScalar(speedDelta));
    if (this.playerOnFloor && this.keyStates['Space']) this.playerVelocity.y = 20;
  }

  joystickControls(deltaTime) {
    if (this.joystickDX !== 0 || this.joystickDY !== 0) {
      const speedDelta = deltaTime * (this.playerOnFloor ? this.playerSpeed : this.airControl);
      this.playerVelocity.add(this.getForwardVector().multiplyScalar(-this.joystickDY * speedDelta));
      this.playerVelocity.add(this.getSideVector().multiplyScalar(this.joystickDX * speedDelta));
    }
  }

  teleportPlayerIfOob() {
    if (this.camera.position.y <= -25) {
      this.deathCount++;
      this.playerCollider.start.set(0, 0.5, 0);
      this.playerCollider.end.set(0, 1.65, 0);
      this.playerCollider.radius = 0.35;
      this.camera.position.copy(this.playerCollider.end);
      
      // Use playerLookAt from config if available
      const rotationY = this.config.playerLookAt?.rotationY || 0;
      const rotationX = this.config.playerLookAt?.rotationX || 0;
      this.camera.rotation.set(rotationX, rotationY, 0);
    }
  }

  checkPlatformCollision() {
    if (this.levelCompleted) return;

    // Match these values to your platform in level1.js
    const platformPos = new THREE.Vector3(-32.1, -6.73, 0.16);
    const platformSize = new THREE.Vector3(3.55, 0.3, 3.55);
    const playerPos = this.playerCollider.end.clone();

    const dx = Math.abs(playerPos.x - platformPos.x);
    const dy = Math.abs(playerPos.y - platformPos.y);
    const dz = Math.abs(playerPos.z - platformPos.z);

    // The extra 0.5 / 1.5 buffers ensure the player doesn’t need pixel-perfect overlap
    if (
      dx < platformSize.x / 2 + 0.5 &&
      dy < platformSize.y / 2 + 1.5 &&
      dz < platformSize.z / 2 + 0.5
    ) {
      this.completeLevel();
    }
  }

  completeLevel() {
    this.levelCompleted = true;
    
    // Unload walking sound completely
    this.unloadWalkingSound();
    
    // Capture completion time BEFORE pausing
    const elapsedTime = (performance.now() - this.startTime - this.pausedTime) / 1000;
    this.completionTime = elapsedTime;
    const formattedTime = this.formatTime(elapsedTime);
    
    // Calculate stars
    const stars = this.calculateStars(elapsedTime, this.deathCount);
    
    // Save level stats
    if (window.saveLevelStats) {
      window.saveLevelStats(this.levelNumber, {
        time: elapsedTime,
        deaths: this.deathCount,
        stars: stars
      });
    }
    
    this.pause();

    // Play level completion sound
    const completionSound = new Audio('sound/levelCompleted.mp3');
    completionSound.play().catch(err => console.log('Completion sound error:', err));

    const completionScreen = document.getElementById('completion-screen');
    const levelNumberEl = document.getElementById('completion-level-number');
    const timeEl = document.getElementById('completion-time');

    levelNumberEl.textContent = this.levelNumber;
    timeEl.textContent = formattedTime;

    // Reset all stars to hidden
    const starElements = document.querySelectorAll('.completion-star');
    starElements.forEach(star => {
      star.classList.remove('earned', 'grey');
    });

    completionScreen.classList.add('active');

    // Animate stars appearing one by one
    this.animateStars(stars);

    if (window.markLevelCompleted) {
      window.markLevelCompleted(this.levelNumber);
    }

    const nextLevel = this.levelNumber + 1;
    if (window.unlockLevel) {
      window.unlockLevel(nextLevel);
    }
  }

  animateStars(earnedStars) {
    const starElements = document.querySelectorAll('.completion-star');
    const starSound = new Audio('sound/startBtn.mp3');
    
    // First show all stars as grey
    starElements.forEach((star, index) => {
      setTimeout(() => {
        star.classList.add('grey');
      }, index * 300);
    });

    // Then animate earned stars appearing
    setTimeout(() => {
      for (let i = 0; i < earnedStars; i++) {
        setTimeout(() => {
          starElements[i].classList.remove('grey');
          starElements[i].classList.add('earned');
          
          // Play sound for each earned star
          const sound = new Audio('sound/startBtn.mp3');
          sound.volume = 0.6;
          sound.play().catch(err => console.log('Star sound error:', err));
        }, i * 600);
      }
    }, starElements.length * 300 + 400);
  }

  calculateStars(timeInSeconds, deaths) {
    let stars = 0;
    
    // Star 1: Complete under 2 minutes (120 seconds)
    if (timeInSeconds < 120) stars++;
    
    // Star 2: Complete under 1 minute (60 seconds)
    if (timeInSeconds < 60) stars++;
    
    // Star 3: Die less than 5 times
    if (deaths < 5) stars++;
    
    return stars;
  }

  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs.toFixed(2)}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs.toFixed(2)}s`;
    } else {
      return `${secs.toFixed(2)}s`;
    }
  }

  formatTimeLegacy(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${Math.floor(secs)}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${Math.floor(secs)}s`;
    } else {
      return `${secs.toFixed(1)}s`;
    }
  }

  startTimer() {
    if (!this.startTime) {
      this.startTime = performance.now();
    }
  }

  resetTimer() {
    this.startTime = null;
    this.pausedTime = 0;
    this.pauseStartTime = null;
    this.completionTime = null;
    this.levelCompleted = false;
    this.deathCount = 0;
  }

  animate() {
    if (this.isPaused) return;

    const deltaTime = Math.min(0.05, this.clock.getDelta()) / this.STEPS_PER_FRAME;
    for (let i = 0; i < this.STEPS_PER_FRAME; i++) {
      this.controls(deltaTime);
      this.joystickControls(deltaTime);
      this.updatePlayer(deltaTime);
      if (this.useBalls) {
        this.updateSpheres(deltaTime);
      }
      this.teleportPlayerIfOob();
      this.checkPlatformCollision();
    }

    const moving = this.keyStates['KeyW'] || this.keyStates['KeyA'] || this.keyStates['KeyS'] ||
                   this.keyStates['KeyD'] || this.joystickDX !== 0 || this.joystickDY !== 0;

    if (moving) {
      this.startTimer();
    }

    const shouldPlayWalkingSound = moving && this.playerOnFloor;
    if (shouldPlayWalkingSound && !this.isWalkingSoundPlaying) {
      this.walkingSound.play().catch(err => console.log('Walking sound error:', err));
      this.isWalkingSoundPlaying = true;
    } else if (!shouldPlayWalkingSound && this.isWalkingSoundPlaying) {
      this.walkingSound.pause();
      this.walkingSound.currentTime = 0;
      this.isWalkingSoundPlaying = false;
    }


    const timerElement = document.getElementById('game-timer');
    if (timerElement && this.startTime) {
      let elapsedTime;
      if (this.levelCompleted && this.completionTime !== null) {
        // Show frozen completion time
        elapsedTime = this.completionTime;
      } else {
        // Calculate current elapsed time minus paused duration
        elapsedTime = (performance.now() - this.startTime - this.pausedTime) / 1000;
      }
      timerElement.textContent = this.formatTime(elapsedTime);
    }

    if (this.useBalls) {
      this.throwTimer = Math.max(0, this.throwTimer - this.clock.getDelta());

      const cooldownFill = document.getElementById('throw-cooldown-fill');
      const throwCount = document.getElementById('throw-count');
      const ratio = 1 - (this.throwTimer / this.throwCooldown);
      if (cooldownFill) cooldownFill.style.transform = `scaleX(${ratio})`;

      if (throwCount) {
        throwCount.textContent = `${this.NUM_SPHERES - this.ballsThrown}/${this.NUM_SPHERES}`;
      }
    }

    this.updateShockwaves(deltaTime);
  }
}
