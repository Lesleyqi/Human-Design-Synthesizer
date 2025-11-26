import { FunctionDeclaration, Type } from "@google/genai";

export enum DJState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  LIVE = 'LIVE',
  ERROR = 'ERROR'
}

export type LoopCategory = 'DRUMS' | 'SYNTH' | 'AMBIENT' | 'PERC';
export type EffectType = 'NONE' | 'VOLUME' | 'LPF' | 'HPF' | 'REVERB' | 'DELAY' | 'FLANGER';

export interface LoopDefinition {
  id: string;
  name: string;
  category: LoopCategory;
  bpm: number;
}

export interface HandConfig {
  activeLoopId: string | null;
  
  // Mappings
  xEffect: EffectType;
  yEffect: EffectType;
  zEffect: EffectType; // Distance parameter
  spreadEffect: EffectType;

  // New: Rotation Parameter (Fixed mapping to Filter)
  isRotationActive: boolean;

  // Real-time Values
  xValue: number; // 0-1
  yValue: number; // 0-1
  zValue: number; // 0-1 (Distance/Depth)
  spreadValue: number; // 0-1
  rotationValue: number; // -1 to 1 (Roll)
}

export interface AppState {
  status: DJState;
  leftHand: HandConfig;
  rightHand: HandConfig;
  isPlaying: boolean;
  bpm: number;
}

// Tools for Gemini
export const LOOP_TOOLS: FunctionDeclaration[] = [
  {
    name: 'assignLoop',
    description: 'Assigns a specific music loop to the user\'s Left or Right hand.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        hand: {
          type: Type.STRING,
          enum: ['left', 'right'],
        },
        loopId: {
          type: Type.STRING,
        },
      },
      required: ['hand', 'loopId'],
    },
  },
  {
    name: 'mapEffect',
    description: 'Maps an audio effect to an input parameter (X, Y, Z, Spread) for a specific hand.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        hand: {
          type: Type.STRING,
          enum: ['left', 'right'],
        },
        input: {
          type: Type.STRING,
          enum: ['x', 'y', 'z', 'spread'],
        },
        effectType: {
          type: Type.STRING,
          enum: ['VOLUME', 'LPF', 'HPF', 'REVERB', 'DELAY', 'FLANGER'],
        },
      },
      required: ['hand', 'input', 'effectType'],
    },
  }
];

export const AVAILABLE_LOOPS: LoopDefinition[] = [
  { id: 'drum_house', name: 'House Beat', category: 'DRUMS', bpm: 128 },
  { id: 'drum_break', name: 'Breakbeat', category: 'DRUMS', bpm: 128 },
  { id: 'synth_neon', name: 'Neon Arp', category: 'SYNTH', bpm: 128 },
  { id: 'synth_bass', name: 'Wobble Bass', category: 'SYNTH', bpm: 128 },
  { id: 'amb_space', name: 'Deep Space', category: 'AMBIENT', bpm: 128 },
  { id: 'amb_pads', name: 'Ethereal Pads', category: 'AMBIENT', bpm: 128 },
  { id: 'perc_glitch', name: 'Glitch Click', category: 'PERC', bpm: 128 },
  { id: 'perc_shaker', name: 'Shakers', category: 'PERC', bpm: 128 },
];