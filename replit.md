# Overview

This project is a 3D parkour game built with Three.js, featuring physics-based movement, collision detection, and interactive gameplay. It offers a first-person perspective, throwable objects with shockwave effects, and a comprehensive menu system for level selection. The game is designed for both desktop (keyboard/mouse) and mobile (touch) platforms, aiming to provide an engaging and performant 3D gaming experience directly in the browser.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Animated Menu Background
A 3D WebGL-rendered animated background system (menuBackground.js) provides visual appeal to all menu screens. The background features:
- **Neon Cityscape**: 50 procedurally-placed buildings with cyan/green emissive materials and wireframe edges, arranged in a circular layout
- **Animated Floor Grid**: Scrolling grid lines with dual-color (cyan/green) vertex coloring that creates a Tron-like aesthetic
- **Particle Systems**: Dual particle emitters creating falling light streaks with additive blending for glow effects
- **Camera Parallax**: Gentle floating camera movement using sine waves for subtle animation
- **Lifecycle Management**: Automatically starts when entering menus and stops during gameplay to preserve GPU resources
- **Performance Optimized**: Capped pixel ratio (1.5x max), reduced building count, and proper resource cleanup via destroy() method

The background enhances the parkour game's modern aesthetic while maintaining smooth performance through Three.js scene management and requestAnimationFrame control.

## Menu System
A multi-screen menu interface (Start, Main, Level Selection) uses lazy initialization for performance. It features modern gradient designs, animated buttons with hover effects, responsive scaling for various screen sizes, and dynamic loading screens with accurate progress tracking. Navigation allows seamless transitions between menus and game levels, with future expansion planned for "World" and "Settings" sections. The level selection grid uses container query units for responsive typography, ensuring level numbers scale proportionally with their containing boxes across all screen sizes.

## Level Details Card
When a player clicks on a level in the level selection screen, a centered modal card appears showing level details before gameplay starts. The card displays a preview image (from cardImg/level[n].jpg), level number, custom level name ("THE BEGINNING" for level 1, "RISING HEIGHTS" for level 2), and completion status (red "INCOMPLETE" or green "COMPLETED"). A "PLAY" button initiates the level, while an "×" close button dismisses the card. The card automatically hides when loading begins. Level completion status is tracked separately in localStorage and updates immediately upon finishing a level. All event listeners are properly cleaned up when the card is dismissed to prevent memory leaks.

## Frontend Architecture
The game operates on a client-side only architecture using Three.js for 3D rendering and a custom physics system with Octree spatial partitioning for collision detection. It employs a fixed timestep game loop for consistent physics and a modular design separating core logic, level configurations, and initialization.

## Input System
Supports dual input methods: virtual joystick and on-screen buttons for mobile, and keyboard (WASD) and mouse look for desktop. Includes UI elements for throw cooldown and other mechanics.

## Physics and Collision
Utilizes a capsule collider for the player character and an Octree for efficient collision detection with world geometry. Features gravity simulation, sphere physics for throwable objects, and multi-step integration for stability. Level-specific configurations allow customization of gravity, movement speeds, and game mechanics like ball throwing.

## Asset Loading
Employs GLTFLoader for static level geometry and FBXLoader for animated character models, along with HDR environment maps for lighting. All assets are configured with PBR materials for realistic rendering.

<h2>Animation System</h2>
An AnimationMixer manages character animations, crossfading smoothly between idle and walk states based on player movement.

<h2>Visual Effects</h2>
Includes a shockwave effect system for visual feedback when throwable spheres impact the environment, featuring expanding rings with a timed lifecycle.

<h2>Level Completion System</h2>
A checkered completion platform triggers a "LEVEL COMPLETED!" screen upon player contact. This screen displays completion time, level number, and offers options to retry the level, leave to the main menu, or proceed to the next level (if available). Time tracking starts on first player movement.

<h2>Pause Menu</h2>
A compact pause menu is accessible via a top-left button. When activated, it blurs the game screen and provides options to resume, retry, access (future) settings, or leave to the main menu. Game physics are suspended when paused.

<h2>Ball Mechanics Toggle</h2>
A `useBalls` configuration option in level settings enables or disables all ball-throwing mechanics and associated UI elements, allowing for varied level designs.

<h2>Game Timer</h2>
A real-time timer displayed in the top-left corner to the right of the FPS counter tracks elapsed gameplay time with decimal precision. The timer uses an intelligent format that adapts to duration: "11.65s" for seconds with decimals, "1m 12.34s" for minutes and seconds, and "1h 15m 11.23s" for longer sessions. Time tracking begins automatically when the player first moves (via keyboard or joystick), allowing players a moment to orient themselves after loading. The timer properly resets to "0s" when starting a new level, retrying from the pause menu, or retrying from the completion screen, ensuring accurate time tracking for each attempt.

<h2>Level Progression System</h2>
A level unlocking system with localStorage persistence ensures progressive gameplay. Only Level 1 is initially accessible, with subsequent levels unlocking automatically when players complete a level (triggered immediately upon collision with the completion platform, not requiring a "Next" button click). Locked levels display a lock icon and hide the level number (using CSS `.level-box.locked .level-number { display: none; }`), which automatically reappears when unlocked. All "coming soon" text has been removed, including the main menu disabled buttons (WORLD and SETTINGS) which now display lock icons. The "Next" button in the completion screen loads the next level directly, seamlessly transitioning the player to the subsequent level without returning to the level selection screen. Progress is saved to localStorage for persistence across sessions, ensuring unlocked levels remain accessible even if the player doesn't immediately proceed to the next level.

<h2>Enhanced Button Feedback</h2>
All interactive buttons feature tactile click animations with 200-250ms delays and smooth press-and-release animations. This includes menu buttons, level selection boxes, pause menu buttons, and completion screen buttons, providing clear visual and temporal feedback that makes interactions feel responsive and deliberate.

<h2>Player Look Controls</h2>
The game supports adjustable look sensitivity for both mouse and touch controls. Players can modify the sensitivity through the settings menu (accessible from main menu). The sensitivity slider ranges from 0.1x (very slow) to 3.0x (very fast), with 1.0x as the default. The setting is saved to localStorage and applies to:
- **Mouse Controls (Desktop)**: Camera rotation when pointer is locked, using mouse movement delta
- **Touch Controls (Mobile)**: Camera rotation when touching the right half of the screen, using touch position delta

Both control methods use the same sensitivity multiplier, ensuring consistent camera movement across platforms.

<h2>Star Rating & Mission System</h2>
Each level features a 3-star rating system based on performance metrics:
- **Star Calculation**: Stars are earned based on completion time and death count
  - Time-based stars: Complete under specific time thresholds (varies by level)
  - Death-based star: Complete with 0 deaths
- **Mission Tracking**: Each level has 3 missions displayed in the level details card:
  - "Complete under [X]min" (+1 star) - Time challenge 1
  - "Complete under [Y]min" (+1 star) - Time challenge 2 (harder)
  - "Complete with 0 deaths" (+1 star) - Perfect run challenge
- **Best Stats Persistence**: The game saves your best performance for each level:
  - Best time achieved
  - Best star count earned
  - Mission completion status (✅ completed, ❌ not completed)
- **Visual Feedback**: 
  - Level details card shows round, glowing golden stars for earned stars
  - Grey stars indicate unearned stars
  - Completion screen animates stars one-by-one with sound effects

<h2>Walking Sound Management</h2>
The walking sound (walking.mp3) has a complete lifecycle management system:
- **Loading**: Sound is initialized when each game level starts
- **Playing**: Automatically plays/pauses based on player movement
- **Unloading**: Sound is completely unloaded and removed from memory when:
  - Player hits the level completion block
  - Player exits the level
  - Game session ends
- This ensures the sound won't play even if movement is detected after level completion, and prevents memory buildup from repeated plays.

<h2>Performance Optimizations</h2>
Includes robust cleanup mechanisms for animation loops (`cancelAnimationFrame`), DOM elements, and event listeners across game sessions to prevent memory leaks and ensure stable performance, especially during repeated level retries or navigation.

# External Dependencies

<h2>Core Libraries</h2>
- **Three.js (v0.164.1)**: 3D rendering, scene management, physics primitives, and asset loaders (GLTFLoader, FBXLoader, RGBELoader, Octree, Capsule).

<h2>Build & Deployment</h2>
- **Express.js (v4.18.2)**: Static file server for development and local hosting of game assets.

<h2>Asset Storage</h2>
- **3D Models**: GLB (level geometry), FBX (character models) stored in `./models/` directories.
- **HDRI Environment Maps**: Stored in `./skybox/` directory.

<h2>Browser APIs</h2>
- **WebGL**: For Three.js rendering.
- **Touch Events**: For mobile input.
- **Animation Frame API**: For game loop timing.
- **ES6 Modules**: For code organization.

<h2>Development Tools</h2>
- **Stats.js**: For real-time FPS and performance monitoring.