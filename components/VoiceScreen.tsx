import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

interface VoiceScreenProps {
  onClose: () => void;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const VoiceScreen: React.FC<VoiceScreenProps> = ({ onClose }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'speaking' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const [inputTranscription, setInputTranscription] = useState('');
  const [outputTranscription, setOutputTranscription] = useState('');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    return () => cleanup();
  }, []);

  const cleanup = () => {
    cancelAnimationFrame(animationFrameRef.current);
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
    }
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch(e) {}
    }
  };

  const startNeuralConnection = async () => {
    setStatus('connecting');
    setErrorMessage(null);
    
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      audioContextRef.current = audioCtx;
      outputAudioContextRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
      });
      
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

      analyzerRef.current = audioCtx.createAnalyser();
      analyzerRef.current.fftSize = 64;
      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);

      const updateVisuals = () => {
        if (analyzerRef.current) {
          analyzerRef.current.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          setAudioLevel(average);
        }
        animationFrameRef.current = requestAnimationFrame(updateVisuals);
      };
      updateVisuals();

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus('listening');
            if (!audioContextRef.current) return;
            const source = audioContextRef.current.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                int16[i] = Math.max(-1, Math.min(1, inputData[i])) * 32768;
              }
              const pcmBlob = { 
                data: encode(new Uint8Array(int16.buffer)), 
                mimeType: 'audio/pcm;rate=16000' 
              };
              sessionPromise.then(s => {
                if (s) s.sendRealtimeInput({ media: pcmBlob });
              }).catch(err => console.error("Realtime input failed", err));
            };
            
            source.connect(analyzerRef.current!);
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              setInputTranscription(message.serverContent.inputTranscription.text);
              setOutputTranscription('');
            }
            if (message.serverContent?.outputTranscription) {
              setOutputTranscription(message.serverContent.outputTranscription.text);
              setInputTranscription('');
            }

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              setStatus('speaking');
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setStatus('listening');
              };
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setStatus('listening');
            }
          },
          onerror: (e) => {
            console.error("Neural Link Error:", e);
            setStatus('error');
            setErrorMessage("Connection to neural core lost or API key invalid.");
          },
          onclose: () => onClose()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: 'You are Xino, a hyper-advanced neural assistant. All responses must be in English. Respond with short, concise, high-impact verbal bursts. Be professional and cold.'
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      console.error("Hardware initialization error:", err);
      setStatus('error');
      setErrorMessage(err.name === 'NotAllowedError' ? "Mic access denied." : "Hardware fault.");
    }
  };

  const isSpeaking = status === 'speaking';
  const primaryColor = isSpeaking ? '#00FF94' : '#00B2FF';

  return (
    <div className="fixed inset-0 z-[100] bg-[#010101] flex flex-col items-center justify-center font-mono overflow-hidden">
      {/* HUD Background Layers */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_#ffffff08_1px,_transparent_1px)] bg-[length:32px_32px]" />
        <div className="absolute top-0 left-0 w-full h-full border-[20px] border-white/5 pointer-events-none" />
      </div>

      {/* Decorative Corner HUDs */}
      <div className="absolute top-6 left-6 flex flex-col gap-2 p-4 border-l-2 border-t-2" style={{ borderColor: `${primaryColor}40` }}>
        <div className="text-[8px] font-black tracking-[0.4em] opacity-40 text-white">XINO_NATIVE_LINK</div>
        <div className={`text-[12px] font-black tracking-[0.2em] uppercase transition-colors duration-700 ${isSpeaking ? 'text-[#00FF94]' : 'text-[#00B2FF]'}`}>
          ST_PROTOCOL:: {status}
        </div>
      </div>

      <div className="absolute top-6 right-6 flex flex-col items-end gap-1 p-4 border-r-2 border-t-2" style={{ borderColor: `${primaryColor}40` }}>
        <div className="flex gap-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-1 h-3 bg-white/10" style={{ backgroundColor: i < 4 ? primaryColor : 'transparent' }} />
          ))}
        </div>
        <div className="text-[8px] font-black tracking-widest text-white/40 uppercase">Signal Strength 98%</div>
      </div>

      {/* Close Button */}
      <button onClick={onClose} className="absolute bottom-10 right-10 w-12 h-12 group flex items-center justify-center z-[110]">
        <div className="absolute inset-0 border border-white/10 group-hover:border-red-500/50 transition-all rounded-full" />
        <div className="relative text-[10px] text-white/40 group-hover:text-red-500 font-black tracking-tighter transition-colors">ESC</div>
      </button>

      {/* Central Neural Interface */}
      <div className="relative w-full max-w-lg h-96 flex items-center justify-center">
        {/* Glow Sphere */}
        <div 
          className="absolute w-64 h-64 blur-[180px] rounded-full opacity-20 transition-all duration-1000"
          style={{ backgroundColor: primaryColor }}
        />
        
        {status === 'idle' ? (
          <button 
            onClick={startNeuralConnection}
            className="group relative flex flex-col items-center justify-center z-20 animate-in zoom-in-95 duration-700"
          >
            <div className="w-48 h-48 rounded-full border border-white/5 flex items-center justify-center relative bg-black/40 backdrop-blur-sm">
               <div className="absolute inset-0 rounded-full border border-[#00B2FF]/20 animate-[ping_3s_infinite]" />
               <div className="w-24 h-24 bg-gradient-to-tr from-[#00B2FF] to-[#00FF94] rounded-full flex items-center justify-center text-black shadow-[0_0_50px_rgba(0,178,255,0.3)] group-hover:scale-110 transition-transform duration-500">
                  <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                  </svg>
               </div>
            </div>
            <span className="mt-10 text-[11px] font-black tracking-[0.8em] text-[#00B2FF] uppercase group-hover:text-white transition-colors">Initialize Neural Link</span>
          </button>
        ) : (
          <div className="relative w-full h-full flex items-center justify-center">
             {/* Wavy Waveform Visualizer */}
             <div className="flex items-center justify-center gap-[6px] h-32 w-full px-12">
                {[...Array(24)].map((_, i) => {
                  const delay = i * 0.05;
                  const heightFactor = Math.sin(i * 0.5) * 0.3 + 0.7;
                  const scaledLevel = (audioLevel / 255) * 100 * heightFactor;
                  
                  return (
                    <div 
                      key={i}
                      className="w-[3px] rounded-full transition-all duration-75"
                      style={{ 
                        height: `${8 + scaledLevel}px`,
                        backgroundColor: primaryColor,
                        boxShadow: `0 0 15px ${primaryColor}80, 0 0 30px ${primaryColor}30`,
                        opacity: 0.3 + (scaledLevel / 100),
                        transition: 'height 0.1s cubic-bezier(0.4, 0, 0.2, 1)'
                      }}
                    />
                  );
                })}
             </div>
             
             {/* Pulse Rings */}
             <div 
              className={`absolute w-72 h-72 border-2 rounded-full opacity-5 transition-all duration-1000 ${isSpeaking ? 'animate-[ping_2s_infinite]' : 'animate-pulse'}`}
              style={{ borderColor: primaryColor }}
             />
          </div>
        )}
      </div>

      {/* HUD Message Display */}
      <div className="absolute bottom-32 w-full max-w-2xl px-12 flex flex-col items-center pointer-events-none min-h-[120px] justify-center">
        <div className="w-full space-y-6">
          {inputTranscription && (
            <div className="flex flex-col items-start animate-in fade-in slide-in-from-left-4 duration-500">
               <div className="flex items-center gap-2 mb-2">
                 <div className="w-1.5 h-1.5 bg-[#00B2FF] rounded-full" />
                 <span className="text-[8px] text-[#00B2FF] font-black tracking-[0.4em] uppercase">LINK::INPUT</span>
               </div>
               <p className="text-[14px] text-white/70 font-medium italic border-l border-white/10 pl-6 py-1 leading-relaxed max-w-[80%]">
                 "{inputTranscription}"
               </p>
            </div>
          )}
          {outputTranscription && (
            <div className="flex flex-col items-end animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="flex items-center gap-2 mb-2">
                 <span className="text-[8px] text-[#00FF94] font-black tracking-[0.4em] uppercase">CORE::REPLY</span>
                 <div className="w-1.5 h-1.5 bg-[#00FF94] rounded-full animate-pulse" />
               </div>
               <p className="text-[14px] text-[#00FF94] font-bold border-r border-[#00FF94]/20 pr-6 py-1 text-right leading-relaxed max-w-[80%] uppercase tracking-tight">
                 {outputTranscription}
               </p>
            </div>
          )}
        </div>
      </div>

      {/* HUD Footer Information */}
      <div className="absolute bottom-10 left-10 flex flex-col gap-1 text-[8px] font-bold tracking-widest text-white/20 uppercase">
        <div>CORE_VERSION: XINO_BETA_2.5</div>
        <div>ENCRYPTION: AES_256_LIVE</div>
      </div>

      {/* Error HUD Overlay */}
      {status === 'error' && (
        <div className="absolute inset-0 bg-[#050505]/95 backdrop-blur-2xl z-[60] flex flex-col items-center justify-center p-12 text-center">
          <div className="w-32 h-32 rounded-full border-2 border-red-500/20 flex items-center justify-center mb-10 relative">
            <div className="absolute inset-0 rounded-full border border-red-500 animate-ping opacity-20" />
            <div className="text-red-500 text-6xl font-thin">!</div>
          </div>
          <h2 className="text-3xl font-black text-white mb-4 tracking-[0.6em] uppercase">Neural Fault</h2>
          <p className="text-red-500/60 text-[10px] mb-12 max-w-xs font-bold leading-relaxed tracking-widest uppercase">{errorMessage}</p>
          <div className="flex flex-col gap-6 w-full max-w-xs">
            <button 
              onClick={startNeuralConnection}
              className="px-12 py-5 bg-red-500 text-black text-[11px] font-black tracking-[0.4em] hover:bg-white transition-all rounded-full uppercase shadow-[0_0_40px_rgba(239,68,68,0.3)]"
            >
              Restart Protocol
            </button>
            <button onClick={onClose} className="text-white/30 text-[9px] font-black tracking-[0.4em] uppercase hover:text-white transition-colors">
              Exit Core
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceScreen;