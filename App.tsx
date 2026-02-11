
import React, { useState, useEffect } from 'react';
import { Screen, User } from './types';
import AuthScreen from './components/AuthScreen';
import ChatScreen from './components/ChatScreen';
import VoiceScreen from './components/VoiceScreen';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>(Screen.AUTH);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('xino_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      setUser(parsedUser);
      setCurrentScreen(Screen.CHAT);
    }
  }, []);

  const handleLogin = (name: string, email: string) => {
    const userData = { name, email };
    localStorage.setItem('xino_user', JSON.stringify(userData));
    setUser(userData);
    setCurrentScreen(Screen.CHAT);
  };

  const handleLogout = () => {
    localStorage.removeItem('xino_user');
    setUser(null);
    setCurrentScreen(Screen.AUTH);
  };

  return (
    <div className="h-screen w-full bg-[#050505] overflow-hidden flex flex-col relative">
      {currentScreen === Screen.AUTH && (
        <AuthScreen onLogin={handleLogin} />
      )}
      {currentScreen === Screen.CHAT && user && (
        <ChatScreen 
          user={user} 
          onOpenVoice={() => setCurrentScreen(Screen.VOICE)} 
          onLogout={handleLogout}
        />
      )}
      {currentScreen === Screen.VOICE && (
        <VoiceScreen onClose={() => setCurrentScreen(Screen.CHAT)} />
      )}
    </div>
  );
};

export default App;
