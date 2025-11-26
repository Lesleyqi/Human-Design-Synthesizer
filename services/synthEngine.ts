import { EffectType, LoopDefinition, AVAILABLE_LOOPS } from '../types';

// Helper to create Impulse Response for Reverb
function createImpulseResponse(ctx: AudioContext, duration: number, decay: number, reverse: boolean): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const n = reverse ? length - i : i;
    const s = (Math.random() * 2 - 1) * Math.pow(1 - n / length, decay);
    left[i] = s;
    right[i] = s;
  }
  return impulse;
}

// Helper for Distortion Curve (Sigmoid)
function makeDistortionCurve(amount: number) {
  const k = amount;
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const deg = Math.PI / 180;
  for (let i = 0; i < n_samples; ++i ) {
    const x = i * 2 / n_samples - 1;
    curve[i] = ( 3 + k ) * x * 20 * deg / ( Math.PI + k * Math.abs(x) );
  }
  return curve;
}

class LoopChannel {
  public ctx: AudioContext;
  public masterOutput: GainNode; 
  private presenceGain: GainNode; // Gate for hand presence
  public bpm: number = 128; // Default BPM
  
  // Effect Nodes
  private gainNode: GainNode; // Volume effect
  private filterNode: BiquadFilterNode; // Mappable Filter (X/Y)
  private rotationFilterNode: BiquadFilterNode; // Dedicated Rotation Filter (LPF/HPF)
  private delayNode: DelayNode;
  private delayFeedback: GainNode;
  private reverbNode: ConvolverNode;
  private reverbGain: GainNode;
  
  // Flanger Nodes
  private flangerDelay: DelayNode;
  private flangerFeedback: GainNode;
  private flangerLFO: OscillatorNode;
  private flangerLFOGain: GainNode;
  private flangerWet: GainNode;

  // Distortion Curve Cache
  private distortionCurve: Float32Array;

  // State
  private isPlaying: boolean = false;
  private currentLoop: LoopDefinition | null = null;
  private nextNoteTime: number = 0;
  private currentStep: number = 0;
  private timerID: number | undefined;
  
  // Easter Egg State
  public isDogMode: boolean = false;

  // Mappings (Controlled from UI/App)
  public xEffect: EffectType = 'NONE';
  public yEffect: EffectType = 'NONE';
  public zEffect: EffectType = 'NONE';
  public spreadEffect: EffectType = 'NONE';

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.distortionCurve = makeDistortionCurve(400); // Pre-calculate heavy distortion

    this.masterOutput = ctx.createGain();
    this.masterOutput.connect(destination);

    // Presence Gate (Default to 0/Muted until hand is detected)
    this.presenceGain = ctx.createGain();
    this.presenceGain.gain.value = 0; 
    this.presenceGain.connect(this.masterOutput);

    // --- Signal Chain Construction ---
    
    // Volume Control (gainNode) -> Presence -> Output
    this.gainNode = ctx.createGain();
    this.gainNode.gain.value = 0.8;
    this.gainNode.connect(this.presenceGain); 

    // Rotation Filter (Dedicated) -> GainNode
    this.rotationFilterNode = ctx.createBiquadFilter();
    this.rotationFilterNode.type = 'lowpass';
    this.rotationFilterNode.frequency.value = 22000; // Open by default
    this.rotationFilterNode.connect(this.gainNode);

    // Reverb -> Rotation Filter
    this.reverbNode = ctx.createConvolver();
    this.reverbNode.buffer = createImpulseResponse(ctx, 2.0, 2.0, false);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0; // Default DRY
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.rotationFilterNode);

    // Delay -> Rotation Filter & Reverb
    this.delayNode = ctx.createDelay();
    this.delayNode.delayTime.value = 0.3; 
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0; // Default DRY
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.rotationFilterNode);
    this.delayNode.connect(this.reverbNode);

    // Mappable Filter -> Delay, Reverb, RotFilter
    this.filterNode = ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000;
    this.filterNode.connect(this.delayNode);
    this.filterNode.connect(this.reverbNode);
    this.filterNode.connect(this.rotationFilterNode);

    // Flanger
    this.flangerDelay = ctx.createDelay();
    this.flangerDelay.delayTime.value = 0.005;
    this.flangerFeedback = ctx.createGain();
    this.flangerFeedback.gain.value = 0.5;
    this.flangerWet = ctx.createGain();
    this.flangerWet.gain.value = 0; // Default Dry
    
    this.flangerLFO = ctx.createOscillator();
    this.flangerLFO.frequency.value = 0.5;
    this.flangerLFOGain = ctx.createGain();
    this.flangerLFOGain.gain.value = 0.002;
    
    this.flangerLFO.connect(this.flangerLFOGain);
    this.flangerLFOGain.connect(this.flangerDelay.delayTime);
    this.flangerLFO.start();

    this.flangerDelay.connect(this.flangerFeedback);
    this.flangerFeedback.connect(this.flangerDelay);
    
    // Connect Flanger into Mappable Filter
    this.flangerDelay.connect(this.flangerWet);
    this.flangerWet.connect(this.filterNode);
  }

  public setPresence(isPresent: boolean) {
      const t = this.ctx.currentTime;
      // If Dog Mode is active, we basically force presence on so we can hear the 808s, 
      // but we handle the muting of loops via logic in scheduler.
      if (this.isDogMode) {
          this.presenceGain.gain.setTargetAtTime(1, t, 0.1);
      } else {
          // Smoothly fade in/out based on hand presence
          this.presenceGain.gain.setTargetAtTime(isPresent ? 1 : 0, t, 0.1);
      }
  }

  // Route sound generation here
  private get inputNode(): AudioNode {
      return this.filterNode; 
  }

  private _inputGain: GainNode | null = null;
  private getInputNode(time: number): AudioNode {
      if (!this._inputGain) {
          this._inputGain = this.ctx.createGain();
          this._inputGain.connect(this.filterNode);
          this._inputGain.connect(this.flangerDelay);
      }
      return this._inputGain;
  }

  // --- Sound Generation (Procedural) ---

  private playKick(time: number) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.getInputNode(time));

    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);

    osc.start(time);
    osc.stop(time + 0.5);
  }

  private playSnare(time: number) {
    const osc = this.ctx.createOscillator();
    const noise = this.ctx.createBufferSource();
    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = noiseBuffer;

    const noiseGain = this.ctx.createGain();
    const oscGain = this.ctx.createGain();

    noise.connect(noiseGain);
    osc.connect(oscGain);
    noiseGain.connect(this.getInputNode(time));
    oscGain.connect(this.getInputNode(time));

    noiseGain.gain.setValueAtTime(1, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
    osc.frequency.setValueAtTime(100, time);
    oscGain.gain.setValueAtTime(0.7, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

    osc.start(time);
    noise.start(time);
    osc.stop(time + 0.2);
    noise.stop(time + 0.2);
  }

  private playHiHat(time: number) {
     const bufferSize = this.ctx.sampleRate * 0.05;
     const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
     const data = buffer.getChannelData(0);
     for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
     
     const noise = this.ctx.createBufferSource();
     noise.buffer = buffer;
     const filter = this.ctx.createBiquadFilter();
     filter.type = 'highpass';
     filter.frequency.value = 5000;
     const gain = this.ctx.createGain();
     gain.gain.value = 0.3;
     
     noise.connect(filter);
     filter.connect(gain);
     gain.connect(this.getInputNode(time));
     
     noise.start(time);
  }

  private playSynthTone(time: number, freq: number) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
      
      osc.connect(gain);
      gain.connect(this.getInputNode(time));
      osc.start(time);
      osc.stop(time + 0.5);
  }

  private playAmbientPad(time: number, freq: number) {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.1, time + 1.0); 
    gain.gain.linearRampToValueAtTime(0, time + 4.0); 
    
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 2; 
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 5;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(time);
    
    osc.connect(gain);
    gain.connect(this.getInputNode(time));
    osc.start(time);
    osc.stop(time + 4.0);
  }

  private playPerc(time: number) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(800, time);
      osc.frequency.exponentialRampToValueAtTime(100, time + 0.1);
      
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
      
      osc.connect(gain);
      gain.connect(this.getInputNode(time));
      osc.start(time);
      osc.stop(time + 0.1);
  }

  // --- Dog Mode Sound (Distorted 808) ---
  private playDistorted808(time: number, freq: number = 45) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const shaper = this.ctx.createWaveShaper();
      
      shaper.curve = this.distortionCurve;
      shaper.oversample = '4x';

      // Pitch Envelope (Fast Drop for kick impact)
      osc.frequency.setValueAtTime(freq * 3.5, time);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, time + 0.3);

      // Amp Envelope (Sustained bass)
      gain.gain.setValueAtTime(0.8, time);
      gain.gain.exponentialRampToValueAtTime(0.4, time + 0.1);
      gain.gain.linearRampToValueAtTime(0, time + 0.8);

      // Signal Path: Osc -> Distortion -> Gain -> Master
      // Bypassing normal channel effects for maximum raw aggression
      osc.connect(shaper);
      shaper.connect(gain);
      gain.connect(this.masterOutput);

      osc.start(time);
      osc.stop(time + 0.8);
  }

  // --- Sequencer ---
  private schedule(beat: number, time: number) {
    if (this.isDogMode) {
        // In Dog Mode, we ignore selected loops and play a distorted 808 sequence.
        // Pattern: Syncopated driving bass
        const step = beat % 16;
        
        if (step === 0) this.playDistorted808(time, 45); // Downbeat
        if (step === 3) this.playDistorted808(time, 45);
        if (step === 7) this.playDistorted808(time, 45);
        if (step === 10) this.playDistorted808(time, 55); // Pitch up
        if (step === 12) this.playDistorted808(time, 35); // Low drop
        if (step === 14) this.playDistorted808(time, 35);
        
        return; 
    }

    if (!this.currentLoop) return;
    const id = this.currentLoop.id;
    const step = beat % 16;

    if (id === 'drum_house') {
        if (step % 4 === 0) this.playKick(time);
        if (step % 8 === 4) this.playSnare(time);
        if (step % 2 !== 0) this.playHiHat(time);
    } 
    else if (id === 'drum_break') {
        if (step === 0 || step === 10) this.playKick(time);
        if (step === 4 || step === 12) this.playSnare(time);
        if (step % 2 === 0) this.playHiHat(time);
    }
    else if (id === 'synth_neon') {
        const notes = [220, 330, 440, 660]; // Am
        if (step % 2 === 0) this.playSynthTone(time, notes[(step / 2) % 4]);
    }
    else if (id === 'synth_bass') {
        if (step === 0 || step === 8) this.playSynthTone(time, 55);
        if (step === 3 || step === 11) this.playSynthTone(time, 110);
    }
    else if (id.startsWith('amb')) {
        if (step === 0) this.playAmbientPad(time, id === 'amb_space' ? 110 : 164.8);
    }
    else if (id.startsWith('perc')) {
         if (Math.random() > 0.5) this.playPerc(time);
    }
  }

  private nextNote() {
    const bpm = this.bpm;
    const secondsPerBeat = 60.0 / bpm;
    const secondsPer16th = secondsPerBeat * 0.25;
    this.nextNoteTime += secondsPer16th;
    this.currentStep++;
  }

  public scheduler() {
    while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
      this.schedule(this.currentStep, this.nextNoteTime);
      this.nextNote();
    }
    if (this.isPlaying) {
       this.timerID = window.setTimeout(this.scheduler.bind(this), 25);
    }
  }

  // --- API ---

  public setLoop(loopId: string | null) {
      if (!loopId) {
          this.currentLoop = null;
          return;
      }
      this.currentLoop = AVAILABLE_LOOPS.find(l => l.id === loopId) || null;
      if (!this.isPlaying && this.currentLoop) {
          this.start();
      }
  }

  public start() {
      if (this.isPlaying) return;
      this.isPlaying = true;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.currentStep = 0;
      this.scheduler();
  }

  public stop() {
      this.isPlaying = false;
      if (this.timerID) window.clearTimeout(this.timerID);
  }

  // Applies value 0-1 to a specific EffectType
  private applyEffect(type: EffectType, value: number, isMuted: boolean = false) {
      const t = this.ctx.currentTime;
      // If force mute (fist), and this is VOLUME, set to 0.
      let v = Math.max(0, Math.min(1, value));
      if (type === 'VOLUME' && isMuted) {
          v = 0;
      }

      switch (type) {
          case 'VOLUME':
              this.gainNode.gain.setTargetAtTime(v, t, 0.1);
              break;
          case 'LPF':
              const lpfFreq = 100 + (Math.pow(v, 2) * 19900); 
              this.filterNode.type = 'lowpass';
              this.filterNode.frequency.setTargetAtTime(lpfFreq, t, 0.1);
              this.filterNode.Q.value = 1;
              break;
          case 'HPF':
              const hpfFreq = v * 10000;
              this.filterNode.type = 'highpass';
              this.filterNode.frequency.setTargetAtTime(hpfFreq, t, 0.1);
              this.filterNode.Q.value = 1;
              break;
          case 'REVERB':
               this.reverbGain.gain.setTargetAtTime(v * 2, t, 0.1);
              break;
          case 'DELAY':
               this.delayFeedback.gain.setTargetAtTime(v * 0.8, t, 0.1);
              break;
          case 'FLANGER':
              // Map value to Wet gain
              this.flangerWet.gain.setTargetAtTime(v, t, 0.1);
              break;
      }
  }

  public update(x: number, y: number, spread: number, z: number, rotation: number, isRotActive: boolean) {
      // Fist Detection Logic: If spread is low (< 0.15), we consider it a fist.
      const isFist = spread < 0.15;

      this.applyEffect(this.xEffect, x, isFist);
      this.applyEffect(this.yEffect, y, isFist);
      this.applyEffect(this.zEffect, z, isFist);
      this.applyEffect(this.spreadEffect, spread, isFist);

      // --- Rotation Filter Logic ---
      const t = this.ctx.currentTime;
      if (isRotActive && !isFist) {
         if (rotation < -0.1) {
             // Pinky down -> LPF (Scale -0.1 to -1 maps to 20k to 40Hz)
             // Normalize range: rot of -0.1 is 1.0 (open), rot of -1 is 0.0 (closed)
             const norm = (rotation + 1) / 0.9; 
             // curve
             const freq = 40 + (Math.pow(norm, 3) * 19960);
             this.rotationFilterNode.type = 'lowpass';
             this.rotationFilterNode.frequency.setTargetAtTime(freq, t, 0.1);
             this.rotationFilterNode.Q.value = 1;
         } else if (rotation > 0.1) {
             // Thumb down -> HPF (Scale 0.1 to 1 maps to 10Hz to 4000Hz)
             // Normalize range
             const norm = (rotation - 0.1) / 0.9;
             const freq = 10 + (norm * 3990);
             this.rotationFilterNode.type = 'highpass';
             this.rotationFilterNode.frequency.setTargetAtTime(freq, t, 0.1);
             this.rotationFilterNode.Q.value = 1;
         } else {
             // Deadzone - reset
             this.rotationFilterNode.type = 'lowpass';
             this.rotationFilterNode.frequency.setTargetAtTime(22000, t, 0.1);
         }
      } else {
          // Bypass if inactive
          this.rotationFilterNode.type = 'lowpass';
          this.rotationFilterNode.frequency.setTargetAtTime(22000, t, 0.1);
      }
  }
  
  public setMapping(axis: 'x'|'y'|'z'|'spread', effect: EffectType) {
      if (axis === 'x') this.xEffect = effect;
      if (axis === 'y') this.yEffect = effect;
      if (axis === 'z') this.zEffect = effect;
      if (axis === 'spread') this.spreadEffect = effect;
      
      // Reset defaults for effects NOT currently mapped to avoid them getting stuck
      this.resetUnmappedEffects();
  }
  
  private resetUnmappedEffects() {
      const mapped = [this.xEffect, this.yEffect, this.zEffect, this.spreadEffect];
      const t = this.ctx.currentTime;
      
      if (!mapped.includes('VOLUME')) this.gainNode.gain.setTargetAtTime(0.8, t, 0.5);
      if (!mapped.includes('LPF') && !mapped.includes('HPF')) {
          this.filterNode.frequency.setTargetAtTime(20000, t, 0.5);
          this.filterNode.type = 'lowpass';
      }
      if (!mapped.includes('REVERB')) this.reverbGain.gain.setTargetAtTime(0, t, 0.5); // Default to 0
      if (!mapped.includes('DELAY')) this.delayFeedback.gain.setTargetAtTime(0, t, 0.5); // Default to 0 (dry)
      if (!mapped.includes('FLANGER')) this.flangerWet.gain.setTargetAtTime(0, t, 0.5);
  }
}

export class SynthEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;
  
  public leftChannel: LoopChannel;
  public rightChannel: LoopChannel;
  
  private _isDogMode: boolean = false;

  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    
    this.leftChannel = new LoopChannel(this.ctx, this.masterGain);
    this.rightChannel = new LoopChannel(this.ctx, this.masterGain);
  }

  public start() {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.leftChannel.start();
      this.rightChannel.start();
  }

  public stop() {
      this.leftChannel.stop();
      this.rightChannel.stop();
  }

  public setBpm(bpm: number) {
      this.leftChannel.bpm = bpm;
      this.rightChannel.bpm = bpm;
  }

  public updateHand(hand: 'left' | 'right', x: number, y: number, spread: number, z: number, rotation: number, isRotActive: boolean) {
      const channel = hand === 'left' ? this.leftChannel : this.rightChannel;
      channel.update(x, y, spread, z, rotation, isRotActive);
  }
  
  public updateMapping(hand: 'left' | 'right', axis: 'x'|'y'|'z'|'spread', effect: EffectType) {
      const channel = hand === 'left' ? this.leftChannel : this.rightChannel;
      channel.setMapping(axis, effect);
  }

  public getAnalyser(): AnalyserNode {
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 256;
      this.masterGain.connect(analyser);
      return analyser;
  }

  public setDogMode(active: boolean) {
      if (this._isDogMode === active) return;
      this._isDogMode = active;
      this.leftChannel.isDogMode = active;
      this.rightChannel.isDogMode = active;

      // When activating Dog Mode, unmute channel presence so we hear barks regardless of hand position
      if (active) {
          this.leftChannel.setPresence(true);
          this.rightChannel.setPresence(true);
      }
  }
}