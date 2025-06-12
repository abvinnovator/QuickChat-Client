import React, { useState, useEffect, useRef } from 'react';
import { Send, Users, MessageCircle, SkipForward, Wifi, WifiOff, User } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

// Types
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'partner';
  timestamp: number;
}

interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'waiting' | 'connected';
  partnerId?: string;
}

const ChatApp: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [connection, setConnection] = useState<ConnectionState>({ status: 'disconnected' });
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const serverUrl = process.env.NODE_ENV === 'production' 
      ? window.location.origin  // Use same origin in production
      : 'http://localhost:3001'; // Development server
      
    socketRef.current = io(serverUrl, {
      transports: ['websocket', 'polling']
    });
    
    const socket = socketRef.current;

    // Connection events
    socket.on('connect', () => {
      console.log('Connected to server');
      setConnection({ status: 'disconnected' }); // Ready to find partner
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnection({ status: 'disconnected' });
      setMessages([]);
      setIsTyping(false);
    });

    // Online users count
    socket.on('online_count', (count: number) => {
      setOnlineUsers(count);
    });

    // Partner matching events
    socket.on('waiting_for_partner', () => {
      setConnection({ status: 'waiting' });
      setMessages([{
        id: 'system_' + Date.now(),
        text: 'Looking for someone to chat with...',
        sender: 'user',
        timestamp: Date.now()
      }]);
    });

    socket.on('partner_found', (data: { partnerId: string; message: string }) => {
      setConnection({ status: 'connected', partnerId: data.partnerId });
      setMessages([{
        id: 'system_1',
        text: data.message,
        sender: 'user',
        timestamp: Date.now()
      }]);
    });

    socket.on('partner_disconnected', (data: { message: string }) => {
      setConnection({ status: 'waiting' });
      setMessages(prev => [...prev, {
        id: 'system_' + Date.now(),
        text: data.message,
        sender: 'user',
        timestamp: Date.now()
      }]);
      setIsTyping(false);
    });

    // Message events
    socket.on('message_received', (message: Message) => {
      setMessages(prev => [...prev, message]);
      setIsTyping(false);
    });

    // Typing indicators
    socket.on('partner_typing_start', () => {
      setIsTyping(true);
    });

    socket.on('partner_typing_stop', () => {
      setIsTyping(false);
    });

    // Error handling
    socket.on('error', (error: { message: string }) => {
      console.error('Socket error:', error.message);
      // You can add toast notifications here
    });

    // Cleanup
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleConnect = () => {
    if (socketRef.current && connection.status === 'disconnected') {
      setConnection({ status: 'connecting' });
      socketRef.current.emit('find_partner');
    }
  };

  const handleSendMessage = (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();
    
    if (!currentMessage.trim() || connection.status !== 'connected' || !socketRef.current) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      text: currentMessage,
      sender: 'user',
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, newMessage]);
    
    // Send to server
    socketRef.current.emit('send_message', {
      text: currentMessage
    });
    
    setCurrentMessage('');
    
    // Stop typing indicator
    socketRef.current.emit('typing_stop');
  };

  const handleNext = () => {
    if (connection.status === 'connected' && socketRef.current) {
      socketRef.current.emit('next_partner');
      setConnection({ status: 'waiting' });
      setMessages(prev => [...prev, {
        id: 'system_' + Date.now(),
        text: 'Looking for a new partner...',
        sender: 'user',
        timestamp: Date.now()
      }]);
      setIsTyping(false);
    }
  };

  const handleDisconnect = () => {
    if (socketRef.current) {
      socketRef.current.emit('disconnect_chat');
      setConnection({ status: 'disconnected' });
      setMessages([]);
      setIsTyping(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentMessage(e.target.value);
    
    // Handle typing indicators
    if (connection.status === 'connected' && socketRef.current) {
      socketRef.current.emit('typing_start');
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout to stop typing indicator
      typingTimeoutRef.current = setTimeout(() => {
        if (socketRef.current) {
          socketRef.current.emit('typing_stop');
        }
      }, 1000);
    }
  };

  const getStatusColor = () => {
    switch (connection.status) {
      case 'connected': return 'text-green-500';
      case 'connecting': 
      case 'waiting': return 'text-yellow-500';
      default: return 'text-red-500';
    }
  };

  const getStatusText = () => {
    switch (connection.status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'waiting': return 'Finding partner...';
      default: return 'Disconnected';
    }
  };

  const getStatusIcon = () => {
    return connection.status === 'connected' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <MessageCircle className="w-8 h-8 text-indigo-600" />
            <h1 className="text-xl font-bold text-gray-800">RandomChat</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Users className="w-4 h-4" />
              <span>{onlineUsers} online</span>
            </div>
            
            <div className={`flex items-center space-x-2 text-sm ${getStatusColor()}`}>
              {getStatusIcon()}
              <span>{getStatusText()}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 max-w-4xl mx-auto w-full flex flex-col bg-white shadow-lg rounded-t-lg mt-4 overflow-hidden">
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {connection.status === 'disconnected' && (
            <div className="text-center py-12">
              <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Welcome to RandomChat</h2>
              <p className="text-gray-500 mb-6">Connect with strangers from around the world</p>
              <button
                onClick={handleConnect}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-medium transition-colors"
              >
                Start Chatting
              </button>
            </div>
          )}

          {connection.status === 'connecting' && (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600">Connecting to server...</p>
            </div>
          )}

          {connection.status === 'waiting' && (
            <div className="text-center py-12">
              <div className="animate-bounce w-8 h-8 bg-indigo-600 rounded-full mx-auto mb-4"></div>
              <p className="text-gray-600">Looking for someone to chat with...</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.sender === 'user'
                    ? 'bg-indigo-600 text-white'
                    : message.text.includes('connected') || message.text.includes('disconnected') || message.text.includes('Looking for')
                    ? 'bg-gray-200 text-gray-700 text-center italic'
                    : 'bg-white text-gray-800 shadow-sm border'
                }`}
              >
                <p className="text-sm">{message.text}</p>
                <p className={`text-xs mt-1 ${
                  message.sender === 'user' ? 'text-indigo-200' : 'text-gray-500'
                }`}>
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-800 px-4 py-2 rounded-lg shadow-sm border">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 p-4 bg-white">
          <div className="flex space-x-2 mb-3">
            {connection.status === 'connected' && (
              <>
                <button
                  onClick={handleNext}
                  className="flex items-center space-x-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>Next</span>
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>

          <div className="flex space-x-2">
            <input
              type="text"
              value={currentMessage}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && currentMessage.trim() && connection.status === 'connected') {
                  handleSendMessage(e);
                }
              }}
              placeholder={
                connection.status === 'connected' 
                  ? "Type your message..." 
                  : "Connect to start chatting"
              }
              disabled={connection.status !== 'connected'}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              maxLength={500}
            />
            <button
              onClick={handleSendMessage}
              disabled={!currentMessage.trim() || connection.status !== 'connected'}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          
          <div className="text-xs text-gray-500 mt-2 text-center">
            Be respectful and follow community guidelines
          </div>
        </div>
      </main>
    </div>
  );
};

export default ChatApp;