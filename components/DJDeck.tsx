import React from 'react';
import { AppState, AVAILABLE_LOOPS, LoopCategory, EffectType } from '../types';

interface DJDeckProps {
  state: AppState;
  onSelectLoop: (hand: 'left' | 'right', loopId: string) => void;
  onUpdateMapping: (hand: 'left' | 'right', axis: 'x' | 'y' | 'z' | 'spread', effect: EffectType) => void;
  onToggleRotation: (hand: 'left' | 'right') => void;
  onRandomize: (hand: 'left' | 'right') => void;
  onBpmChange: (bpm: number) => void;
}

const CATEGORIES: LoopCategory[] = ['DRUMS', 'SYNTH', 'AMBIENT', 'PERC'];
const EFFECTS: EffectType[] = ['NONE', 'VOLUME', 'LPF', 'HPF', 'REVERB', 'DELAY', 'FLANGER'];

// Technical Waveform-like Line Visualization
const SignalLine: React.FC<{ value: number }> = ({ value }) => {
  return (
    <div className="relative w-full h-3 flex items-center overflow-hidden mt-1">
      {/* Base Line */}
      <div className="absolute top-1/2 left-0 w-full h-[1px] bg-gray-800"></div>
      
      {/* Active "Signal" */}
      <div 
        className="absolute top-1/2 left-0 h-[1px] bg-white transition-all duration-75" 
        style={{ width: `${value * 100}%` }} 
      />
      
      {/* The "Head" or Cursor */}
      <div 
        className="absolute top-0 w-[1px] h-full bg-red-500 transition-all duration-75"
        style={{ left: `${value * 100}%` }}
      />
    </div>
  );
};

// Bi-directional signal line for Rotation (-1 to 1)
const BiDirectionalSignalLine: React.FC<{ value: number }> = ({ value }) => {
  // Value is -1 to 1. Center is 50%.
  const widthPercent = Math.abs(value) * 50; 
  const leftPos = value < 0 ? (50 - widthPercent) : 50;

  return (
    <div className="relative w-full h-3 flex items-center overflow-hidden mt-1">
      {/* Base Line */}
      <div className="absolute top-1/2 left-0 w-full h-[1px] bg-gray-800"></div>
      
      {/* Center Marker */}
      <div className="absolute top-0 left-1/2 w-[1px] h-full bg-gray-600"></div>

      {/* Active "Signal" Bar from center */}
      <div 
        className={`absolute top-1/2 h-[1px] transition-all duration-75 ${value < 0 ? 'bg-blue-400' : 'bg-orange-400'}`}
        style={{ left: `${leftPos}%`, width: `${widthPercent}%` }} 
      />
      
      {/* Cursor */}
      <div 
        className="absolute top-0 w-[1px] h-full bg-white transition-all duration-75"
        style={{ left: `${((value + 1) / 2) * 100}%` }}
      />
    </div>
  );
};

const MappingControl: React.FC<{
  label: string;
  value: EffectType;
  currentValue: number;
  onChange: (e: EffectType) => void;
}> = ({ label, value, currentValue, onChange }) => (
  <div className="flex flex-col mb-2">
    <div className="flex items-center justify-between text-xs mb-0.5">
      <span className="text-gray-500 text-[10px]">{label}</span>
      <div className="relative">
        <select 
          value={value} 
          onChange={(e) => onChange(e.target.value as EffectType)}
          className="bg-black text-white border-b border-gray-600 px-1 py-0 focus:border-white outline-none uppercase text-[10px] w-20 text-right cursor-pointer hover:text-red-500 transition-colors appearance-none"
        >
          {EFFECTS.map(eff => (
            <option key={eff} value={eff}>{eff}</option>
          ))}
        </select>
      </div>
    </div>
    <SignalLine value={currentValue} />
  </div>
);

const RotationControl: React.FC<{
  isActive: boolean;
  value: number;
  onToggle: () => void;
}> = ({ isActive, value, onToggle }) => (
  <div className="flex flex-col mb-2">
    <div className="flex items-center justify-between text-xs mb-0.5">
       <span className="text-gray-500 text-[10px]">ROTATION FILTER</span>
       <button 
         onClick={onToggle}
         className={`text-[9px] px-2 py-0.5 border ${isActive ? 'bg-white text-black border-white' : 'text-gray-500 border-gray-700 hover:border-gray-500'}`}
       >
         {isActive ? 'ON' : 'OFF'}
       </button>
    </div>
    <BiDirectionalSignalLine value={value} />
  </div>
);

const HandControlPanel: React.FC<{ 
  title: string; 
  config: any; 
  side: 'left' | 'right';
  onUpdateMapping: (axis: 'x' | 'y' | 'z' | 'spread', effect: EffectType) => void;
  onToggleRotation: () => void;
  onRandomize: () => void;
}> = ({ title, config, side, onUpdateMapping, onToggleRotation, onRandomize }) => {
  const currentLoop = AVAILABLE_LOOPS.find(l => l.id === config.activeLoopId);

  return (
    <div className="flex flex-col h-full border-r border-gray-800 last:border-r-0 p-4 min-w-[200px] overflow-hidden">
       {/* Header */}
       <div className="mb-4 flex flex-col flex-shrink-0 space-y-2">
         <div className="flex justify-between items-start">
             <div className="flex flex-col">
                <h3 className="text-xl text-white font-bold tracking-tight">{title}</h3>
                <span className="text-[9px] text-gray-500 uppercase mt-0.5">Ref: {side === 'left' ? 'L-01' : 'R-01'}</span>
             </div>
             <div className="w-5 h-5 border border-white flex items-center justify-center">
                <div className={`w-3 h-3 bg-white transition-opacity ${config.activeLoopId ? 'opacity-100' : 'opacity-0'}`} />
             </div>
         </div>
         <button 
            onClick={onRandomize}
            className="self-start border border-gray-700 text-[10px] text-gray-500 px-3 py-1 hover:border-white hover:text-white transition-colors uppercase tracking-wider"
         >
            [ RND_CONFIG ]
         </button>
       </div>

       {/* Scrollable Content Area */}
       <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
           {/* Active Loop Display */}
           <div className="mb-5 border border-gray-800 p-3">
             <div className="text-[9px] text-gray-500 uppercase mb-1 tracking-widest">Running Sequence</div>
             <div className="text-sm text-white truncate font-bold">
               {currentLoop ? currentLoop.name.toUpperCase() : "---"}
             </div>
             <div className="text-[10px] text-red-500 mt-0.5">
                {currentLoop ? `${currentLoop.bpm} BPM` : 'STANDBY'}
             </div>
           </div>

           {/* Parameters */}
           <div className="space-y-4">
             <MappingControl 
               label="X-AXIS" 
               value={config.xEffect} 
               currentValue={config.xValue}
               onChange={(eff) => onUpdateMapping('x', eff)} 
             />
             <MappingControl 
               label="Y-AXIS" 
               value={config.yEffect} 
               currentValue={config.yValue}
               onChange={(eff) => onUpdateMapping('y', eff)} 
             />
             <MappingControl 
               label="Z-AXIS (DIST)" 
               value={config.zEffect} 
               currentValue={config.zValue}
               onChange={(eff) => onUpdateMapping('z', eff)} 
             />
             <MappingControl 
               label="SPREAD" 
               value={config.spreadEffect} 
               currentValue={config.spreadValue}
               onChange={(eff) => onUpdateMapping('spread', eff)} 
             />
             <RotationControl 
               isActive={config.isRotationActive}
               value={config.rotationValue}
               onToggle={onToggleRotation}
             />
           </div>
       </div>
    </div>
  );
};

const DJDeck: React.FC<DJDeckProps> = ({ state, onSelectLoop, onUpdateMapping, onToggleRotation, onRandomize, onBpmChange }) => {
  return (
    <div className="flex flex-row w-full h-full bg-black text-white font-mono border-t border-gray-800">
      
      {/* Left Hand */}
      <div className="flex-1 min-w-0">
        <HandControlPanel 
            title="CHANNEL A" 
            config={state.leftHand} 
            side="left" 
            onUpdateMapping={(axis, eff) => onUpdateMapping('left', axis, eff)}
            onToggleRotation={() => onToggleRotation('left')}
            onRandomize={() => onRandomize('left')}
        />
      </div>

      {/* Center Bank */}
      <div className="flex-[1.5] border-r border-gray-800 p-4 flex flex-col min-w-[250px] overflow-hidden">
         <div className="mb-3 border-b border-gray-800 pb-2 flex-shrink-0 flex justify-between items-center">
            <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Sequence Library</h2>
            <div className="flex items-center gap-2">
                <label className="text-[9px] text-gray-600">BPM</label>
                <input 
                    type="number" 
                    value={state.bpm}
                    onChange={(e) => onBpmChange(parseInt(e.target.value) || 128)}
                    className="w-10 bg-black text-white text-[10px] border border-gray-800 focus:border-white px-1 py-0.5 text-center outline-none"
                />
            </div>
         </div>
         
         <div className="grid grid-cols-4 gap-4 overflow-y-auto flex-1 pr-2 custom-scrollbar">
            {CATEGORIES.map(cat => (
              <div key={cat} className="col-span-4 md:col-span-2 space-y-2">
                <h3 className="text-[9px] font-bold text-white bg-gray-900 px-1.5 py-0.5 inline-block uppercase">{cat}</h3>
                <div className="flex flex-col border-l border-gray-800 pl-3 space-y-0.5">
                  {AVAILABLE_LOOPS.filter(l => l.category === cat).map(loop => {
                    const isLeft = state.leftHand.activeLoopId === loop.id;
                    const isRight = state.rightHand.activeLoopId === loop.id;
                    
                    return (
                      <div key={loop.id} className="group flex items-center justify-between py-1 text-[11px] hover:text-white transition-colors text-gray-500">
                         <span className={`uppercase tracking-tight truncate mr-2 ${isLeft || isRight ? 'text-white font-bold' : ''}`}>
                           {loop.name}
                         </span>
                         
                         <div className="flex gap-1.5 flex-shrink-0">
                           <button 
                             onClick={() => onSelectLoop('left', loop.id)}
                             className={`w-4 h-4 flex items-center justify-center border text-[8px] transition-all ${isLeft ? 'bg-white text-black border-white' : 'border-gray-700 text-gray-700 hover:border-gray-500'}`}
                           >
                             A
                           </button>
                           <button 
                             onClick={() => onSelectLoop('right', loop.id)}
                             className={`w-4 h-4 flex items-center justify-center border text-[8px] transition-all ${isRight ? 'bg-white text-black border-white' : 'border-gray-700 text-gray-700 hover:border-gray-500'}`}
                           >
                             B
                           </button>
                         </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
         </div>
      </div>

      {/* Right Hand */}
      <div className="flex-1 min-w-0">
        <HandControlPanel 
            title="CHANNEL B" 
            config={state.rightHand} 
            side="right" 
            onUpdateMapping={(axis, eff) => onUpdateMapping('right', axis, eff)}
            onToggleRotation={() => onToggleRotation('right')}
            onRandomize={() => onRandomize('right')}
        />
      </div>

    </div>
  );
};

export default DJDeck;