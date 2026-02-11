import React, { useState, useEffect } from 'react';

interface AuthScreenProps {
  onLogin: (name: string, email: string) => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState(localStorage.getItem('xino_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('xino_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const lowerEmail = email.toLowerCase().trim();
    const storageKey = `xino_account_${lowerEmail}`;
    const savedAccount = localStorage.getItem(storageKey);

    if (isLogin) {
      if (!savedAccount) {
        setError("Neural link failed: No account found for this email. Please create an account first.");
        return;
      }

      const accountData = JSON.parse(savedAccount);
      if (accountData.password !== password) {
        setError("Authentication error: Incorrect encryption key (password).");
        return;
      }

      onLogin(accountData.name, accountData.email);
    } else {
      if (savedAccount) {
        setError("Collision detected: An account with this email already exists.");
        return;
      }

      if (!name.trim()) {
        setError("Data missing: Please provide your full name.");
        return;
      }

      const newAccount = { name, email: lowerEmail, password };
      localStorage.setItem(storageKey, JSON.stringify(newAccount));
      
      const registry = JSON.parse(localStorage.getItem('xino_registry') || '[]');
      if (!registry.includes(lowerEmail)) {
        registry.push(lowerEmail);
        localStorage.setItem('xino_registry', JSON.stringify(registry));
      }

      onLogin(name, lowerEmail);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-custom-main transition-colors duration-500 relative">
      {/* Theme Toggle Button */}
      <button 
        onClick={toggleTheme}
        className="absolute top-8 left-8 p-3 glass-card rounded-2xl hover:scale-110 active:scale-95 transition-all z-50 flex items-center justify-center border-custom"
        title="Toggle Theme"
      >
        <span className="text-xl">
          {theme === 'dark' ? '☀️' : '🌙'}
        </span>
      </button>

      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-gradient-to-tr from-[#00FF94] to-[#00B2FF] rounded-3xl mx-auto flex items-center justify-center neon-glow floating">
            <span className="text-3xl font-bold text-black">X</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tighter mt-4 text-custom-main">XINO AI</h1>
          <p className="text-custom-sub font-medium">
            {isLogin ? 'Establish your secure connection' : 'Initialize your neural link'}
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-xs text-center animate-in shake duration-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest text-custom-sub ml-1 font-bold">Your Identity Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-custom rounded-2xl px-5 py-4 focus:outline-none focus:border-[#00FF94] transition-all text-sm text-custom-main"
                placeholder="Full Name"
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-custom-sub ml-1 font-bold">Email Hash</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-custom rounded-2xl px-5 py-4 focus:outline-none focus:border-[#00FF94] transition-all text-sm text-custom-main"
              placeholder="email@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-custom-sub ml-1 font-bold">Encryption Key</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/5 border border-custom rounded-2xl px-5 py-4 focus:outline-none focus:border-[#00FF94] transition-all text-sm text-custom-main"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-[#00FF94] text-black font-bold rounded-2xl hover:brightness-110 transition-all active:scale-95 shadow-lg shadow-[#00FF94]/20 text-xs tracking-[0.2em]"
          >
            {isLogin ? 'AUTHENTICATE' : 'GENERATE ACCOUNT'}
          </button>
        </form>

        <div className="text-center">
          <button 
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-custom-sub text-xs hover:text-[#00FF94] transition-colors font-medium uppercase tracking-widest"
          >
            {isLogin ? "New user? Register Identity" : "Existing Link? Return to Login"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;