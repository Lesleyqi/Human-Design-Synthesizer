import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FilesetResolver, HandLandmarker, ObjectDetector, FaceLandmarker } from "@mediapipe/tasks-vision";
import { AppState, DJState, EffectType, AVAILABLE_LOOPS } from './types';
import { SynthEngine } from './services/synthEngine';
import DJDeck from './components/DJDeck';
import { checkForDog, drawDogEars, EASTER_EGG_CONFIG } from './services/easterEggs';

// Configuration constants
const FRAME_RATE = 30; 
const EFFECT_OPTIONS: EffectType[] = ['NONE', 'VOLUME', 'LPF', 'HPF', 'REVERB', 'DELAY', 'FLANGER'];

const App: React.FC = () => {
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const synthRef = useRef<SynthEngine | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const objectDetectorRef = useRef<ObjectDetector | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const dogModeExpiryRef = useRef<number>(0);
  
  // --- State ---
  const [appState, setAppState] = useState<AppState>({
    status: DJState.IDLE,
    isPlaying: false,
    bpm: 128,
    leftHand: {
      activeLoopId: null,
      xEffect: 'LPF',
      yEffect: 'VOLUME',
      zEffect: 'NONE',
      spreadEffect: 'FLANGER',
      isRotationActive: false,
      xValue: 0.5,
      yValue: 0.0,
      zValue: 0.0,
      spreadValue: 0.0,
      rotationValue: 0.0
    },
    rightHand: {
      activeLoopId: null,
      xEffect: 'DELAY',
      yEffect: 'REVERB',
      zEffect: 'NONE',
      spreadEffect: 'HPF',
      isRotationActive: false,
      xValue: 0.5,
      yValue: 0.0,
      zValue: 0.0,
      spreadValue: 0.0,
      rotationValue: 0.0
    }
  });
  
  const [isVisionLoaded, setIsVisionLoaded] = useState(false);
  const [isDogMode, setIsDogMode] = useState(false);

  // --- Initialization ---
  useEffect(() => {
    synthRef.current = new SynthEngine();
    
    // Initial loop setup
    synthRef.current.leftChannel.setLoop(appState.leftHand.activeLoopId);
    synthRef.current.rightChannel.setLoop(appState.rightHand.activeLoopId);
    synthRef.current.setBpm(appState.bpm);
    
    // Initial mappings
    const s = appState;
    synthRef.current.leftChannel.setMapping('x', s.leftHand.xEffect);
    synthRef.current.leftChannel.setMapping('y', s.leftHand.yEffect);
    synthRef.current.leftChannel.setMapping('z', s.leftHand.zEffect);
    synthRef.current.leftChannel.setMapping('spread', s.leftHand.spreadEffect);
    
    synthRef.current.rightChannel.setMapping('x', s.rightHand.xEffect);
    synthRef.current.rightChannel.setMapping('y', s.rightHand.yEffect);
    synthRef.current.rightChannel.setMapping('z', s.rightHand.zEffect);
    synthRef.current.rightChannel.setMapping('spread', s.rightHand.spreadEffect);

    const initVision = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        
        // 1. Hand Landmarker
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });
        handLandmarkerRef.current = handLandmarker;

        // 2. Object Detector (For Dog)
        const objectDetector = await ObjectDetector.createFromOptions(vision, {
           baseOptions: {
             modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
             delegate: "GPU"
           },
           runningMode: "VIDEO",
           scoreThreshold: 0.4
        });
        objectDetectorRef.current = objectDetector;

        // 3. Face Landmarker (For Dog Ears)
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numFaces: 1
        });
        faceLandmarkerRef.current = faceLandmarker;

        setIsVisionLoaded(true);
      } catch (err) {
        console.error("Failed to load vision models:", err);
      }
    };
    initVision();

    return () => {
        synthRef.current?.stop();
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // --- Logic ---
  const handleSelectLoop = (hand: 'left' | 'right', loopId: string) => {
    if (!synthRef.current) return;
    
    const currentLoop = hand === 'left' ? appState.leftHand.activeLoopId : appState.rightHand.activeLoopId;
    const newLoopId = currentLoop === loopId ? null : loopId;

    if (hand === 'left') {
      synthRef.current.leftChannel.setLoop(newLoopId);
      setAppState(prev => ({...prev, leftHand: {...prev.leftHand, activeLoopId: newLoopId}}));
    } else {
      synthRef.current.rightChannel.setLoop(newLoopId);
      setAppState(prev => ({...prev, rightHand: {...prev.rightHand, activeLoopId: newLoopId}}));
    }
  };

  const handleUpdateMapping = (hand: 'left' | 'right', axis: 'x'|'y'|'z'|'spread', effect: EffectType) => {
      if (!synthRef.current) return;
      
      synthRef.current.updateMapping(hand, axis, effect);
      
      setAppState(prev => {
          const handKey = hand === 'left' ? 'leftHand' : 'rightHand';
          let effectKey = 'xEffect';
          if (axis === 'y') effectKey = 'yEffect';
          if (axis === 'z') effectKey = 'zEffect';
          if (axis === 'spread') effectKey = 'spreadEffect';

          return {
              ...prev,
              [handKey]: {
                  ...prev[handKey],
                  [effectKey]: effect
              }
          };
      });
  };

  const handleToggleRotation = (hand: 'left' | 'right') => {
      setAppState(prev => {
          const handKey = hand === 'left' ? 'leftHand' : 'rightHand';
          const newState = !prev[handKey].isRotationActive;
          return {
              ...prev,
              [handKey]: {
                  ...prev[handKey],
                  isRotationActive: newState
              }
          };
      });
  }

  const handleRandomize = (hand: 'left' | 'right') => {
    // 1. Random Loop
    const randomLoop = AVAILABLE_LOOPS[Math.floor(Math.random() * AVAILABLE_LOOPS.length)];
    
    // 2. Random Mappings
    const getRandomEffect = () => EFFECT_OPTIONS[Math.floor(Math.random() * EFFECT_OPTIONS.length)];
    
    const x = getRandomEffect();
    const y = getRandomEffect();
    const z = getRandomEffect();
    const spread = getRandomEffect();

    // 3. Apply to Engine
    if (synthRef.current) {
        if (hand === 'left') {
            synthRef.current.leftChannel.setLoop(randomLoop.id);
        } else {
            synthRef.current.rightChannel.setLoop(randomLoop.id);
        }
        synthRef.current.updateMapping(hand, 'x', x);
        synthRef.current.updateMapping(hand, 'y', y);
        synthRef.current.updateMapping(hand, 'z', z);
        synthRef.current.updateMapping(hand, 'spread', spread);
    }

    // 4. Update State
    setAppState(prev => {
        const handKey = hand === 'left' ? 'leftHand' : 'rightHand';
        return {
            ...prev,
            [handKey]: {
                ...prev[handKey],
                activeLoopId: randomLoop.id,
                xEffect: x,
                yEffect: y,
                zEffect: z,
                spreadEffect: spread
            }
        };
    });
  };

  const handleBpmChange = (newBpm: number) => {
      // Clamp between 40 and 300
      const clamped = Math.max(40, Math.min(300, newBpm));
      if (synthRef.current) {
          synthRef.current.setBpm(clamped);
      }
      setAppState(prev => ({ ...prev, bpm: clamped }));
  };

  // Helper to calculate hand spread (0 to 1) and size (scale)
  const calculateHandMetrics = (landmarks: any[], isRightHand: boolean) => {
      // Scale reference: Distance from Wrist (0) to Middle Finger MCP (9)
      const wrist = landmarks[0];
      const middleMCP = landmarks[9];
      const dx = wrist.x - middleMCP.x;
      const dy = wrist.y - middleMCP.y;
      const handScale = Math.sqrt(dx*dx + dy*dy);
      
      // Calculate distances of fingertips from wrist
      const fingertips = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
      let totalDist = 0;
      
      fingertips.forEach(idx => {
          const tip = landmarks[idx];
          const tdx = tip.x - wrist.x;
          const tdy = tip.y - wrist.y;
          totalDist += Math.sqrt(tdx*tdx + tdy*tdy);
      });
      
      const avgDist = totalDist / 5;
      
      // Spread Ratio
      const ratio = avgDist / handScale;
      // Normalize Spread
      const minRatio = 0.8; 
      const maxRatio = 1.7; 
      const spread = Math.max(0, Math.min(1, (ratio - minRatio) / (maxRatio - minRatio)));

      // Estimate Distance (Z) based on Scale. 
      const minScale = 0.05;
      const maxScale = 0.3;
      const z = Math.max(0, Math.min(1, (handScale - minScale) / (maxScale - minScale)));

      // --- Rotation Calculation ---
      // We use the vector from Wrist (0) to Middle MCP (9) to determine upright angle.
      // Standard upright position (fingers up) corresponds to -90 deg in Canvas space.
      // Calculate angle in degrees
      const rad = Math.atan2(middleMCP.y - wrist.y, middleMCP.x - wrist.x);
      const deg = rad * (180 / Math.PI);
      
      // Logic:
      // Upright (-90) -> 0
      // Right Hand: Pinky Down (0) -> -1, Thumb Down (-180) -> 1
      // Left Hand: Pinky Down (-180) -> -1, Thumb Down (0) -> 1
      
      let rotation = 0;
      
      if (isRightHand) {
         // Map -90 (Up) to 0. 
         // Map 0 (Pinky Down/Right) to -1.
         // Map -180 (Thumb Down/Left) to 1.
         // Formula: -(deg + 90) / 90
         rotation = -(deg + 90) / 90;
      } else {
         // Left Hand
         // Map -90 (Up) to 0.
         // Map -180 (Pinky Down/Left) to -1.
         // Map 0 (Thumb Down/Right) to 1.
         // Formula: (deg + 90) / 90
         rotation = (deg + 90) / 90;
      }

      // Clamp to -1 to 1 range
      rotation = Math.max(-1, Math.min(1, rotation));

      return { spread, z, rotation };
  };

  // --- Hand Tracking Loop ---
  const predictWebcam = useCallback(() => {
    if (
        handLandmarkerRef.current && 
        objectDetectorRef.current &&
        faceLandmarkerRef.current &&
        videoRef.current && 
        canvasRef.current && 
        !videoRef.current.paused &&
        videoRef.current.readyState === 4
    ) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const startTimeMs = performance.now();

        // Sync canvas size
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
             canvas.width = video.videoWidth;
             canvas.height = video.videoHeight;
        }

        if (ctx) {
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             
             // --- Object Detection (Easter Egg Trigger) ---
             // Run detection every N frames to save performance
             if (frameCountRef.current % EASTER_EGG_CONFIG.DOG_DETECTION_INTERVAL_FRAMES === 0) {
                 const detections = objectDetectorRef.current.detectForVideo(video, startTimeMs);
                 if (checkForDog(detections)) {
                     // Extend Dog Mode timer
                     dogModeExpiryRef.current = Date.now() + EASTER_EGG_CONFIG.DOG_MODE_COOLDOWN_MS;
                 }
             }
             frameCountRef.current++;

             const isDogActive = Date.now() < dogModeExpiryRef.current;
             
             // Update Synth State
             if (synthRef.current) {
                 synthRef.current.setDogMode(isDogActive);
             }
             setIsDogMode(isDogActive);

             if (isDogActive) {
                 // --- DOG MODE: Face Tracking & Ear Drawing ---
                 
                 // Show Technical Overlay for Dog Mode
                 ctx.fillStyle = "red";
                 ctx.font = "20px 'Space Mono', monospace";
                 ctx.fillText("WARNING: DOG DETECTED", 20, 40);
                 ctx.fillText("AUDIO OVERRIDE: ACTIVE", 20, 65);

                 const faceResult = faceLandmarkerRef.current.detectForVideo(video, startTimeMs);
                 if (faceResult.faceLandmarks) {
                     for (const landmarks of faceResult.faceLandmarks) {
                         drawDogEars(ctx, landmarks, canvas.width, canvas.height);
                     }
                 }

             } else {
                 // --- NORMAL MODE: Hand Tracking & DJing ---
                 
                 // Draw Technical Crosshair Background
                 ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
                 ctx.lineWidth = 1;
                 ctx.beginPath();
                 ctx.moveTo(canvas.width / 2, 0);
                 ctx.lineTo(canvas.width / 2, canvas.height);
                 ctx.moveTo(0, canvas.height / 2);
                 ctx.lineTo(canvas.width, canvas.height / 2);
                 ctx.stroke();

                 const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);
                 
                 let leftPresent = false;
                 let rightPresent = false;

                 if (results.landmarks && results.handedness) {
                     results.handedness.forEach((handInfo, index) => {
                         const landmarks = results.landmarks[index];
                         const label = handInfo[0].categoryName; // "Left" or "Right"
                         const isRightHand = label === 'Right';
                         
                         // Mark presence
                         if (label === 'Left') leftPresent = true;
                         if (label === 'Right') rightPresent = true;

                         // 1. Calculate Control Values
                         const indexTip = landmarks[8];
                         const x = Math.max(0, Math.min(1, indexTip.x));
                         const y = Math.max(0, Math.min(1, 1 - indexTip.y)); // Invert Y
                         const { spread, z, rotation } = calculateHandMetrics(landmarks, isRightHand);

                         // 2. Update Engine
                         if (synthRef.current) {
                            // Check if rotation active
                            const isActive = isRightHand ? appState.rightHand.isRotationActive : appState.leftHand.isRotationActive;
                            synthRef.current.updateHand(label.toLowerCase() as 'left'|'right', x, y, spread, z, rotation, isActive);
                         }

                         // 3. Update State
                         setAppState(prev => {
                           const key = label === 'Left' ? 'leftHand' : 'rightHand';
                           return {
                             ...prev,
                             [key]: {
                               ...prev[key as 'leftHand' | 'rightHand'],
                               xValue: x,
                               yValue: y,
                               zValue: z,
                               spreadValue: spread,
                               rotationValue: rotation
                             }
                           };
                         });

                         // 4. Draw Minimalist Art Visualization (Center Oriented)
                         // Center of hand logic: Use Landmark 9 (Middle Finger MCP)
                         const center = landmarks[9];
                         const tips = [4, 8, 12, 16, 20];
                         
                         // Draw connecting lines (White, very thin) from Center to Tips
                         ctx.lineWidth = 1;
                         ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
                         
                         tips.forEach(tipIdx => {
                             const tip = landmarks[tipIdx];
                             ctx.beginPath();
                             ctx.moveTo(center.x * canvas.width, center.y * canvas.height);
                             ctx.lineTo(tip.x * canvas.width, tip.y * canvas.height);
                             ctx.stroke();
                         });

                         // Also connect center to wrist to show hand orientation
                         const wrist = landmarks[0];
                         ctx.beginPath();
                         ctx.moveTo(center.x * canvas.width, center.y * canvas.height);
                         ctx.lineTo(wrist.x * canvas.width, wrist.y * canvas.height);
                         ctx.strokeStyle = "rgba(255, 255, 255, 0.4)"; // Fainter for wrist connection
                         ctx.stroke();
                         
                         // Draw Squares at fingertips (Red)
                         const squareSize = 8;
                         ctx.fillStyle = "#ff0000"; 
                         
                         tips.forEach(tipIdx => {
                             const tip = landmarks[tipIdx];
                             const sx = tip.x * canvas.width - squareSize/2;
                             const sy = tip.y * canvas.height - squareSize/2;
                             ctx.fillRect(sx, sy, squareSize, squareSize);
                         });
                         
                         // Draw Center Point (White Square)
                         ctx.fillStyle = "#ffffff";
                         ctx.fillRect(center.x * canvas.width - 3, center.y * canvas.height - 3, 6, 6);
                         
                         // Text Label next to hand
                         ctx.fillStyle = "white";
                         ctx.font = "12px 'Space Mono', monospace";
                         const textX = center.x * canvas.width + 15;
                         const textY = center.y * canvas.height;
                         ctx.fillText(`${label.toUpperCase()}_TRK`, textX, textY);
                         ctx.font = "9px 'Space Mono', monospace";
                         ctx.fillStyle = "#888";
                         ctx.fillText(`ROT:${rotation.toFixed(2)}`, textX, textY + 12);
                     });
                 }
                 
                 // Enforce Silence if Hands are missing
                 if (synthRef.current) {
                     synthRef.current.leftChannel.setPresence(leftPresent);
                     synthRef.current.rightChannel.setPresence(rightPresent);
                 }
             }
        }
    }
    animationFrameRef.current = requestAnimationFrame(predictWebcam);
  }, [appState.leftHand.isRotationActive, appState.rightHand.isRotationActive]);

  // --- Start ---
  const startCamera = async () => {
    setAppState(prev => ({ ...prev, status: DJState.CONNECTING }));

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: false, 
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            } 
        });

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            
            setAppState(prev => ({ ...prev, status: DJState.LIVE, isPlaying: true }));
            if (synthRef.current) synthRef.current.start();
            predictWebcam();
        }

    } catch (e) {
        console.error("Failed to start camera:", e);
        setAppState(prev => ({ ...prev, status: DJState.ERROR }));
        alert("Camera access denied or failed.");
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-black text-white overflow-hidden font-mono">
      
      {/* Top Half: Camera Feedback & Art View */}
      <div className="relative h-[60vh] w-full bg-black flex items-center justify-center border-b border-gray-800">
         {appState.status === DJState.IDLE ? (
             <div className="flex flex-col items-center">
                 <h1 className="text-4xl font-bold mb-4 tracking-tighter text-white">SYSTEM_IDLE</h1>
                 <button 
                    onClick={startCamera}
                    disabled={!isVisionLoaded}
                    className={`border border-white text-white px-6 py-2 uppercase tracking-widest text-xs hover:bg-white hover:text-black transition-colors ${!isVisionLoaded ? 'opacity-50' : ''}`}
                 >
                    {isVisionLoaded ? 'Initialise_Vision' : 'Loading_Models...'}
                 </button>
             </div>
         ) : (
            <div className="relative w-full h-full mx-auto flex items-center justify-center">
                {/* Camera Feed - visible but without vignette */}
                <video 
                    ref={videoRef} 
                    muted 
                    playsInline 
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none transform scale-x-[-1] opacity-70" 
                />
                {/* Canvas Overlay for Technical Art */}
                <canvas 
                    ref={canvasRef} 
                    className="absolute inset-0 w-full h-full object-contain transform scale-x-[-1]" 
                />
                
                {/* Technical Overlays (Fixed UI elements on the screen) */}
                <div className="absolute top-4 left-4 text-[10px] text-gray-500">
                   <div>CAM_FEED: ACTIVE</div>
                   <div>RES: 1280x720</div>
                </div>
                <div className="absolute bottom-4 right-4 text-[10px] text-gray-500 text-right">
                   <div>TRACKING: {isDogMode ? 'DOG_OVERRIDE' : 'HAND_LANDMARKER'}</div>
                   <div>MODE: {isDogMode ? 'BARK_SYNTH' : 'STEREO_PROCEDURAL'}</div>
                </div>
            </div>
         )}
      </div>

      {/* Bottom Half: Controls */}
      <div className="h-[40vh] w-full bg-black relative">
         {/* Dog Mode Overlay for Controls */}
         {isDogMode && (
             <div className="absolute inset-0 bg-red-900/20 z-10 flex items-center justify-center backdrop-blur-sm pointer-events-none">
                 <div className="border border-red-500 text-red-500 p-4 text-center font-bold tracking-widest bg-black/80">
                     DOG DETECTED. SYSTEM OVERRIDE.
                 </div>
             </div>
         )}
         
         {appState.status === DJState.LIVE && (
             <DJDeck 
               state={appState} 
               onSelectLoop={handleSelectLoop}
               onUpdateMapping={handleUpdateMapping}
               onToggleRotation={handleToggleRotation}
               onRandomize={handleRandomize}
               onBpmChange={handleBpmChange}
             />
         )}
      </div>
      
    </div>
  );
};

export default App;