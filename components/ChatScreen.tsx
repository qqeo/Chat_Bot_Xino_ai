import { User, Message, Suggestion } from '../types';
import { sendMessageToGeminiStream } from '../services/geminiService';
import React, { useState, useRef, useEffect } from 'react';

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

interface ChatScreenProps {
  user: User;
  onOpenVoice: () => void;
  onLogout: () => void;
}

const SUGGESTIONS: Suggestion[] = [
  { id: '1', title: 'File Analysis', subtitle: 'Analyze this document for me', icon: '📁' },
  { id: '2', title: 'Education', subtitle: 'Summarize my study notes', icon: '🎓' },
  { id: '3', title: 'Vision', subtitle: 'What is in this image?', icon: '👁️' },
];

const ChatScreen: React.FC<ChatScreenProps> = ({ user, onOpenVoice, onLogout }) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{file: File, preview: string, base64: string, type: 'image' | 'video' | 'doc'} | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  
  // Settings States
  const [theme, setTheme] = useState(localStorage.getItem('xino_theme') || 'dark');
  const [highContrast, setHighContrast] = useState(localStorage.getItem('xino_contrast') === 'true');
  const [saveHistory, setSaveHistory] = useState(localStorage.getItem('xino_save_history') !== 'false');

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('xino_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-contrast', highContrast ? 'high' : 'normal');
    localStorage.setItem('xino_contrast', String(highContrast));
  }, [highContrast]);

  useEffect(() => {
    const saved = localStorage.getItem(`xino_sessions_${user.email}`);
    if (saved && saveHistory) {
      setSessions(JSON.parse(saved));
    }
    const savedPic = localStorage.getItem(`xino_avatar_${user.email}`);
    if (savedPic) setProfileImage(savedPic);
  }, [user.email, saveHistory]);

  useEffect(() => {
    if (saveHistory) {
      localStorage.setItem(`xino_sessions_${user.email}`, JSON.stringify(sessions));
    }
  }, [sessions, user.email, saveHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isTyping]);

  const saveCurrentToHistory = () => {
    if (messages.length === 0 || !saveHistory) return;
    const firstUserMsg = messages.find(m => m.role === 'user')?.content || "New Conversation";
    const title = firstUserMsg.substring(0, 30) + (firstUserMsg.length > 30 ? "..." : "");

    if (currentSessionId) {
      setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages, title } : s));
    } else {
      const newId = Date.now().toString();
      const newSession: ChatSession = { id: newId, title, messages, timestamp: Date.now() };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newId);
    }
  };

  const createNewSession = () => {
    saveCurrentToHistory();
    setCurrentSessionId(null);
    setMessages([]);
    setInputValue('');
    setSelectedFile(null);
    setIsSidebarOpen(false);
  };

  const selectSession = (sessionId: string) => {
    saveCurrentToHistory();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setCurrentSessionId(sessionId);
      setMessages(session.messages);
      setIsSidebarOpen(false);
    }
  };

  const deleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(updatedSessions);
    if (currentSessionId === sessionId) {
      setMessages([]);
      setCurrentSessionId(null);
    }
  };

  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result?.toString().split(',')[1] || "");
      reader.onerror = error => reject(error);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await convertToBase64(file);
    const type: 'image' | 'video' | 'doc' = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'doc';
    const preview = type === 'image' ? URL.createObjectURL(file) : '';
    setSelectedFile({ file, preview, base64, type });
  };

  const handleAvatarUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setProfileImage(base64);
      localStorage.setItem(`xino_avatar_${user.email}`, base64);
    };
    reader.readAsDataURL(file);
  };

  const handleWipeHistory = () => {
    if (confirm("Are you sure you want to wipe all neural logs? This cannot be undone.")) {
      setSessions([]);
      setMessages([]);
      setCurrentSessionId(null);
      localStorage.removeItem(`xino_sessions_${user.email}`);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() && !selectedFile) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      attachment: selectedFile ? {
        type: selectedFile.type,
        url: selectedFile.preview || '',
        name: selectedFile.file.name
      } : undefined,
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInputValue('');
    setSelectedFile(null);
    setIsTyping(true);

    const history = newMessages.map(m => ({
      role: m.role === 'user' ? 'user' as const : 'model' as const,
      parts: [{ text: m.content }]
    }));

    let aiContent = "";
    const aiMsgId = (Date.now() + 1).toString();

    try {
      await sendMessageToGeminiStream(
        userMsg.content,
        history,
        user.name,
        (chunk) => {
          setIsTyping(false);
          if (chunk.startsWith('[IMAGE_EDIT_COMPLETE]')) {
             const imageUrl = chunk.replace('[IMAGE_EDIT_COMPLETE] ', '');
             setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === 'assistant') {
                  last.attachment = { type: 'image', url: imageUrl, name: 'edited_visual.png' };
                  return [...updated];
                }
                return [...prev, {
                  id: aiMsgId,
                  role: 'assistant',
                  content: "Neural edit sequence complete.",
                  attachment: { type: 'image', url: imageUrl, name: 'edited_visual.png' },
                  timestamp: Date.now()
                }];
             });
          } else {
            aiContent += chunk;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && last.id === aiMsgId) {
                return [...prev.slice(0, -1), { ...last, content: aiContent }];
              }
              return [...prev, { id: aiMsgId, role: 'assistant', content: aiContent, timestamp: Date.now() }];
            });
          }
        },
        userMsg.attachment ? { data: selectedFile?.base64 || "", mimeType: selectedFile?.file.type || "" } : undefined
      );
    } catch (error) {
      setIsTyping(false);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: "Neural link timeout. Core offline.", timestamp: Date.now() }]);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-custom-main">
      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-[280px] bg-custom-sidebar border-r border-custom z-50 transform transition-transform duration-300 ease-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xs font-black tracking-[0.4em] uppercase text-custom-sub">Neural_Logs</h2>
            <button onClick={createNewSession} className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <span className="text-xl">⊕</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {sessions.map(session => (
              <div 
                key={session.id}
                onClick={() => selectSession(session.id)}
                className={`group flex items-center justify-between p-4 rounded-2xl cursor-pointer border transition-all ${currentSessionId === session.id ? 'bg-[#00FF94]/10 border-[#00FF94]/20' : 'border-transparent hover:bg-white/5'}`}
              >
                <div className="flex flex-col gap-1 overflow-hidden">
                  <span className={`text-xs font-bold truncate ${currentSessionId === session.id ? 'text-[#00FF94]' : 'text-custom-main'}`}>
                    {session.title}
                  </span>
                  <span className="text-[10px] text-custom-sub font-mono">
                    {new Date(session.timestamp).toLocaleDateString()}
                  </span>
                </div>
                <button 
                  onClick={(e) => deleteSession(e, session.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                >
                  <span className="text-sm">×</span>
                </button>
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="text-center py-12 px-4 opacity-30">
                <div className="text-2xl mb-2">∅</div>
                <p className="text-[10px] font-bold tracking-widest uppercase">No Neural Logs Found</p>
              </div>
            )}
          </div>

          <div className="mt-auto pt-6 border-t border-custom">
             <button onClick={() => { setIsProfileOpen(true); setIsSidebarOpen(false); }} className="w-full flex items-center gap-3 p-3 hover:bg-white/5 rounded-2xl transition-all">
                <div className="w-8 h-8 rounded-full overflow-hidden border border-custom bg-zinc-900">
                  {profileImage ? <img src={profileImage} alt="User" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-bold">{user.name[0]}</div>}
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold truncate max-w-[140px] text-custom-main">{user.name}</div>
                  <div className="text-[9px] text-custom-sub font-mono uppercase tracking-tighter">Verified_Link</div>
                </div>
             </button>
          </div>
        </div>
      </aside>

      {/* Profile/Settings Modal */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="glass-card w-full max-w-sm rounded-[32px] overflow-hidden flex flex-col shadow-2xl">
              <div className="p-8 space-y-8">
                 <div className="flex justify-between items-center">
                    <h2 className="text-xs font-black tracking-[0.4em] uppercase text-custom-sub">
                      {isSettingsOpen ? "APP_CORE_SETTINGS" : "USER_NEURAL_PROFILE"}
                    </h2>
                    <button onClick={() => { setIsProfileOpen(false); setIsSettingsOpen(false); }} className="text-custom-sub hover:text-white transition-colors">
                      <span className="text-2xl">×</span>
                    </button>
                 </div>

                 {!isSettingsOpen ? (
                    <div className="space-y-8 animate-in slide-in-from-bottom-2">
                       <div className="flex flex-col items-center gap-4">
                          <div className="relative group">
                            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-custom bg-zinc-900 neon-glow">
                               {profileImage ? <img src={profileImage} alt="Profile" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-4xl font-bold">{user.name[0]}</div>}
                            </div>
                            <button 
                              onClick={() => profileInputRef.current?.click()}
                              className="absolute bottom-0 right-0 w-8 h-8 bg-[#00FF94] text-black rounded-full flex items-center justify-center text-xs shadow-lg group-hover:scale-110 transition-transform"
                            >
                              ✎
                            </button>
                            <input type="file" ref={profileInputRef} className="hidden" accept="image/*" onChange={handleAvatarUpdate} />
                          </div>
                          <div className="text-center">
                            <h3 className="text-xl font-bold text-custom-main">{user.name}</h3>
                            <p className="text-[10px] text-custom-sub font-mono uppercase tracking-[0.2em]">{user.email}</p>
                          </div>
                       </div>

                       <div className="grid grid-cols-2 gap-3">
                          <button onClick={() => setIsSettingsOpen(true)} className="flex flex-col items-center gap-2 p-4 bg-white/5 border border-custom rounded-2xl hover:bg-white/10 transition-all">
                             <span className="text-lg">⚙</span>
                             <span className="text-[9px] font-black uppercase tracking-widest">Settings</span>
                          </button>
                          <button onClick={onOpenVoice} className="flex flex-col items-center gap-2 p-4 bg-white/5 border border-custom rounded-2xl hover:bg-white/10 transition-all">
                             <span className="text-lg">🎙</span>
                             <span className="text-[9px] font-black uppercase tracking-widest">Voice Link</span>
                          </button>
                       </div>

                       <button 
                        onClick={() => { onLogout(); setIsProfileOpen(false); }} 
                        className="w-full py-4 text-red-500 font-black text-[10px] uppercase tracking-[0.4em] bg-red-500/5 border border-red-500/20 rounded-2xl hover:bg-red-500 hover:text-black transition-all"
                       >
                         Disconnect_Session
                       </button>
                    </div>
                 ) : (
                    <div className="space-y-6 animate-in slide-in-from-right-4">
                       <div className="space-y-4">
                          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                             <span className="text-[10px] font-bold uppercase tracking-widest">Visual Mode</span>
                             <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="px-3 py-1 bg-[#00FF94] text-black text-[8px] font-black uppercase rounded-full">
                               {theme === 'dark' ? 'Neon Dark' : 'Quartz Light'}
                             </button>
                          </div>
                          
                          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                             <span className="text-[10px] font-bold uppercase tracking-widest">High Contrast</span>
                             <input 
                              type="checkbox" 
                              checked={highContrast} 
                              onChange={(e) => setHighContrast(e.target.checked)}
                              className="w-5 h-5 accent-[#00FF94] bg-transparent border border-custom rounded"
                             />
                          </div>

                          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                             <span className="text-[10px] font-bold uppercase tracking-widest">Save Neural History</span>
                             <input 
                              type="checkbox" 
                              checked={saveHistory} 
                              onChange={(e) => setSaveHistory(e.target.checked)}
                              className="w-5 h-5 accent-[#00FF94] bg-transparent border border-custom rounded"
                             />
                          </div>
                       </div>

                       <div className="space-y-3 pt-4 border-t border-custom">
                          <button 
                            onClick={handleWipeHistory}
                            className="w-full py-2 text-[9px] font-black uppercase tracking-widest text-red-400/60 hover:text-red-500 transition-colors"
                          >
                            Wipe Neural Logs
                          </button>
                          
                          <button 
                            onClick={() => { onLogout(); setIsProfileOpen(false); }}
                            className="w-full py-3 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-black uppercase tracking-[0.4em] rounded-xl hover:bg-red-500 hover:text-black transition-all"
                          >
                            Disconnect_Protocol
                          </button>

                          <button 
                            onClick={() => setIsSettingsOpen(false)}
                            className="w-full py-4 bg-[#00FF94] text-black text-[10px] font-black uppercase tracking-[0.4em] rounded-2xl"
                          >
                            Save & Return
                          </button>
                       </div>
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between glass-card border-b border-custom sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
            <span className="text-xl">☰</span>
          </button>
          <div className="flex flex-col">
            <h1 className="text-xs font-black tracking-[0.4em] uppercase gradient-text">Xino</h1>
            <span className="text-[8px] font-bold tracking-widest text-custom-sub uppercase">Neural_Network</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsProfileOpen(true)} 
            className="w-10 h-10 rounded-xl overflow-hidden border border-custom bg-zinc-900 transition-transform active:scale-95 neon-glow"
            style={{ 
              boxShadow: theme === 'dark' ? '0 0 10px rgba(0, 255, 148, 0.4)' : '0 0 10px rgba(0, 178, 255, 0.2)' 
            }}
          >
             {profileImage ? <img src={profileImage} alt="Profile" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-xs">{user.name[0]}</div>}
          </button>
        </div>
      </header>

      {/* Message Feed */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center max-w-lg mx-auto space-y-12">
            <div className="text-center space-y-4 animate-in fade-in zoom-in-95 duration-1000">
               <div className="w-24 h-24 bg-gradient-to-tr from-[#00FF94] to-[#00B2FF] rounded-[32px] mx-auto flex items-center justify-center neon-glow floating">
                 <span className="text-4xl font-black text-black">X</span>
               </div>
               <h2 className="text-2xl font-black tracking-tighter">Systems Online, {user.name.split(' ')[0]}</h2>
               <p className="text-custom-sub text-sm">How may I assist your neural processing today?</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
               {SUGGESTIONS.map(s => (
                 <button 
                  key={s.id}
                  onClick={() => setInputValue(s.subtitle)}
                  className="flex flex-col items-start p-5 bg-white/5 border border-custom rounded-3xl hover:bg-white/10 hover:border-[#00FF94]/30 transition-all text-left group"
                 >
                   <span className="text-2xl mb-4 grayscale group-hover:grayscale-0 transition-all">{s.icon}</span>
                   <span className="text-xs font-black uppercase tracking-widest mb-1 text-custom-main">{s.title}</span>
                   <span className="text-[10px] text-custom-sub">{s.subtitle}</span>
                 </button>
               ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
              <div className={`max-w-[85%] rounded-[24px] p-4 ${msg.role === 'user' ? 'message-bubble-user rounded-tr-none' : 'message-bubble-ai rounded-tl-none'}`}>
                {msg.attachment && (
                  <div className="mb-3 rounded-xl overflow-hidden border border-white/10">
                    {msg.attachment.type === 'image' ? (
                      <img src={msg.attachment.url} alt="Attachment" className="w-full max-h-64 object-cover" />
                    ) : (
                      <div className="p-4 bg-black/20 flex items-center gap-3">
                         <span className="text-2xl">{msg.attachment.type === 'video' ? '🎬' : '📄'}</span>
                         <span className="text-[10px] font-bold uppercase truncate">{msg.attachment.name}</span>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
              <span className="text-[8px] font-bold tracking-widest text-custom-sub mt-2 uppercase">
                {msg.role === 'assistant' ? 'XINO' : 'NEURAL_INPUT'} • {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            </div>
          ))
        )}
        {isTyping && (
          <div className="flex items-center gap-2 text-custom-sub animate-pulse">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-[#00FF94] rounded-full" />
              <div className="w-1.5 h-1.5 bg-[#00FF94] rounded-full opacity-50" />
              <div className="w-1.5 h-1.5 bg-[#00FF94] rounded-full opacity-20" />
            </div>
            <span className="text-[9px] font-black tracking-widest uppercase">Processing_Data...</span>
          </div>
        )}
      </main>

      {/* Input Bar */}
      <footer className="p-6">
        <div className="max-w-4xl mx-auto">
           {selectedFile && (
             <div className="mb-4 flex items-center gap-4 p-3 bg-[#00FF94]/5 border border-[#00FF94]/20 rounded-2xl animate-in slide-in-from-bottom-2">
                <div className="w-12 h-12 rounded-lg overflow-hidden border border-white/10 bg-black/40">
                   {selectedFile.type === 'image' ? (
                     <img src={selectedFile.preview} className="w-full h-full object-cover" />
                   ) : (
                     <div className="w-full h-full flex items-center justify-center text-xl">📄</div>
                   )}
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-black uppercase text-custom-main">{selectedFile.file.name}</div>
                  <div className="text-[9px] text-custom-sub uppercase">Ready for neural injection</div>
                </div>
                <button onClick={() => setSelectedFile(null)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-colors">×</button>
             </div>
           )}

           <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-[#00FF94] to-[#00B2FF] opacity-10 blur-xl group-focus-within:opacity-20 transition-opacity" />
              <div className="glass-card flex items-end gap-2 p-3 rounded-[28px] relative border-custom">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 text-custom-sub hover:text-[#00FF94] hover:bg-white/5 rounded-2xl transition-all"
                >
                  <span className="text-xl">⊕</span>
                </button>
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Initiate communication..."
                  className="flex-1 bg-transparent border-none focus:outline-none text-sm py-3 px-2 min-h-[44px] max-h-32 resize-none placeholder:text-custom-sub"
                  rows={1}
                />

                <div className="flex items-center gap-2">
                  <button 
                    onClick={onOpenVoice}
                    className="p-3 bg-[#00B2FF]/10 text-[#00B2FF] border border-[#00B2FF]/20 rounded-2xl hover:bg-[#00B2FF] hover:text-black transition-all shadow-lg shadow-[#00B2FF]/10"
                  >
                    <span className="text-sm">🎙</span>
                  </button>
                  <button 
                    onClick={handleSendMessage}
                    disabled={!inputValue.trim() && !selectedFile}
                    className="p-3 bg-[#00FF94] text-black rounded-2xl disabled:opacity-20 disabled:grayscale transition-all hover:scale-105 active:scale-95 shadow-lg shadow-[#00FF94]/20"
                  >
                    <span className="text-sm font-black tracking-widest">SEND</span>
                  </button>
                </div>
              </div>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatScreen;