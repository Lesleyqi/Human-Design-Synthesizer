import { ObjectDetectorResult } from "@mediapipe/tasks-vision";

export const EASTER_EGG_CONFIG = {
  DOG_DETECTION_INTERVAL_FRAMES: 30, // Check for dog every 30 frames (~1 sec)
  DOG_MODE_COOLDOWN_MS: 3000, // Keep dog mode active for 3s after last detection
};

// Check if a dog is present in detection results
export function checkForDog(result: ObjectDetectorResult): boolean {
  if (!result.detections) return false;
  return result.detections.some(detection => 
    detection.categories.some(cat => cat.categoryName === 'dog' && cat.score > 0.4)
  );
}

// Draw Dog Ears on the canvas based on Face Landmarks
export function drawDogEars(ctx: CanvasRenderingContext2D, landmarks: any[], width: number, height: number) {
  // Key Face Landmarks for "Top of Head"
  // 10: Top center of forehead
  // 127: Left cheekbone/ear area
  // 356: Right cheekbone/ear area
  
  const topHead = landmarks[10];
  const leftSide = landmarks[127];
  const rightSide = landmarks[356];

  if (!topHead || !leftSide || !rightSide) return;

  const topX = topHead.x * width;
  const topY = topHead.y * height;
  
  const leftX = leftSide.x * width;
  const leftY = leftSide.y * height;
  
  const rightX = rightSide.x * width;
  const rightY = rightSide.y * height;

  // Approximate ear size based on face width
  const faceWidth = Math.abs(rightX - leftX);
  const earSize = faceWidth * 0.5;

  ctx.fillStyle = "#8B4513"; // SaddleBrown
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;

  // Left Ear
  ctx.beginPath();
  ctx.moveTo(leftX, leftY - faceWidth * 0.2); // Base near temple
  ctx.lineTo(leftX - earSize * 0.8, topY - earSize); // Tip out and up
  ctx.lineTo(topX - faceWidth * 0.2, topY); // Connect to top head
  ctx.quadraticCurveTo(leftX, leftY - faceWidth * 0.2, leftX, leftY - faceWidth * 0.2); // Close
  ctx.fill();
  ctx.stroke();

  // Right Ear
  ctx.beginPath();
  ctx.moveTo(rightX, rightY - faceWidth * 0.2); // Base near temple
  ctx.lineTo(rightX + earSize * 0.8, topY - earSize); // Tip out and up
  ctx.lineTo(topX + faceWidth * 0.2, topY); // Connect to top head
  ctx.quadraticCurveTo(rightX, rightY - faceWidth * 0.2, rightX, rightY - faceWidth * 0.2); // Close
  ctx.fill();
  ctx.stroke();

  // Inner Ear (Pink)
  ctx.fillStyle = "#FFB6C1"; // LightPink
  const innerOffset = earSize * 0.2;
  
  // Left Inner
  ctx.beginPath();
  ctx.moveTo(leftX, leftY - faceWidth * 0.25); 
  ctx.lineTo(leftX - earSize * 0.5, topY - earSize * 0.7); 
  ctx.lineTo(topX - faceWidth * 0.25, topY + innerOffset); 
  ctx.fill();

  // Right Inner
  ctx.beginPath();
  ctx.moveTo(rightX, rightY - faceWidth * 0.25); 
  ctx.lineTo(rightX + earSize * 0.5, topY - earSize * 0.7); 
  ctx.lineTo(topX + faceWidth * 0.25, topY + innerOffset); 
  ctx.fill();
}