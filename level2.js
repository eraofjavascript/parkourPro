import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';

// Level 2 Configuration
export const level2Config = {
  levelNumber: 2,
  playerSpeed: 95,
  airControl: 18,
  gravity: 25,
  ballLimit: 3,
  useBalls: true,
  mapScale: { x: 4.5, y: 4.5, z: 4.5 },
  mapPosition: { x: 0, y: -13, z: 0 },
  hdrPath: './skybox/skybox.hdr',
  
  // Player camera initial rotation (lookat direction)
  playerLookAt: {
    rotationY: 0,
    rotationX: 0
  },
  
  // Star mechanics - time thresholds in seconds (harder than level 1)
  starMechanics: {
    star1Time: 180,
    star2Time: 90,
    deathLimit: 5
  },
  
  // Missions descriptions
  missions: [
    { description: 'Complete under 3min', target: '180s', type: 'time' },
    { description: 'Complete under 1.5min', target: '90s', type: 'time' },
    { description: 'Die less than 5 times', target: '<5 deaths', type: 'deaths' }
  ],
  
  // Best time target for display
  bestTimeTarget: 75
};

export function loadLevel(scene, worldOctree, onProgress) {
  return new Promise((resolve, reject) => {
    let gltfLoaded = false;
    let hdrLoaded = false;
    
    const checkComplete = () => {
      if (gltfLoaded && hdrLoaded) {
        resolve();
      }
    };
    
    const gltfLoader = new GLTFLoader().setPath('./models/gltf/');
    gltfLoader.load('level-2.glb', 
      (gltf) => {
        gltf.scene.scale.set(level2Config.mapScale.x, level2Config.mapScale.y, level2Config.mapScale.z);
        gltf.scene.position.set(level2Config.mapPosition.x, level2Config.mapPosition.y, level2Config.mapPosition.z);
        
        scene.add(gltf.scene);
        worldOctree.fromGraphNode(gltf.scene);
        
        gltf.scene.traverse(child => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            child.material = new THREE.MeshStandardMaterial({
              map: child.material.map || null,
              color: child.material.color,
              roughness: 0.015,
              metalness: 0.6,
            });
            
            if (child.material.map) child.material.map.anisotropy = 4;
          }
        });
        
        const helper = new OctreeHelper(worldOctree);
        helper.visible = false;
        scene.add(helper);
        
        gltfLoaded = true;
        if (onProgress) onProgress(0.5);
        checkComplete();
      },
      (xhr) => {
        if (onProgress && xhr.lengthComputable) {
          const progress = (xhr.loaded / xhr.total) * 0.5;
          onProgress(progress);
        }
      },
      (error) => reject(error)
    );
    
    // Create checkered completion platform
    const platformGeometry = new THREE.BoxGeometry(3.55, 0.3, 3.55);
    
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const squareSize = 16;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#000000' : '#ffffff';
        ctx.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
      }
    }
    const checkeredTexture = new THREE.CanvasTexture(canvas);
    checkeredTexture.wrapS = THREE.RepeatWrapping;
    checkeredTexture.wrapT = THREE.RepeatWrapping;
    
    const platformMaterial = new THREE.MeshStandardMaterial({
      map: checkeredTexture,
      roughness: 0.3,
      metalness: 0.1
    });
    
    const completionPlatform = new THREE.Mesh(platformGeometry, platformMaterial);
    completionPlatform.position.set(-32.1, -6.73, 0.16);
    completionPlatform.castShadow = true;
    completionPlatform.receiveShadow = true;
    completionPlatform.userData.isCompletionPlatform = true;
    
    scene.add(completionPlatform);
    
    // Load HDR environment
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(level2Config.hdrPath, 
      (hdrTexture) => {
        hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = hdrTexture;
        scene.environment = hdrTexture;
        
        hdrLoaded = true;
        if (onProgress) onProgress(1.0);
        checkComplete();
      },
      (xhr) => {
        if (onProgress && xhr.lengthComputable) {
          const progress = 0.5 + (xhr.loaded / xhr.total) * 0.5;
          onProgress(progress);
        }
      },
      (error) => reject(error)
    );
  });
}

export function loadPlayerModel(scene, playerMixer, onProgress) {
  return new Promise((resolve) => {
    if (onProgress) onProgress(1.0);
    resolve(null);
  });
}
