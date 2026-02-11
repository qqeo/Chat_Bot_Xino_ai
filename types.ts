
export enum Screen {
  AUTH = 'AUTH',
  CHAT = 'CHAT',
  VOICE = 'VOICE'
}

export interface User {
  name: string;
  email: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachment?: {
    type: 'image' | 'video' | 'doc';
    url: string;
    name: string;
  };
  timestamp: number;
}

export interface Suggestion {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
}
