import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

function createSocket(token: string): Socket {
  let socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
  socketUrl = socketUrl.replace(/\/api\/?$/, '');

  return io(socketUrl, {
    transports: ['websocket'], // Force WebSocket to avoid polling sticky session issues
    autoConnect: false,
    withCredentials: true,
    auth: { token },
    reconnectionAttempts: 6,
    reconnectionDelay: 1000,
  });
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const socket = useMemo(() => (token ? createSocket(token) : null), [token]);
  const [connectedSocketId, setConnectedSocketId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) {
      return () => undefined;
    }

    let hadSuccessfulConnection = false;

    socket.on('connect', () => {
      setConnectedSocketId(socket.id ?? null);
      if (!hadSuccessfulConnection) {
        toast.success('Real-time connection established');
      }
      hadSuccessfulConnection = true;
    });

    socket.on('connect_error', (err) => {
      setConnectedSocketId(null);
      if (hadSuccessfulConnection) {
        toast.error(`Connection lost: ${err.message}`);
      }
    });

    socket.on('disconnect', (reason) => {
      setConnectedSocketId(null);
      if (hadSuccessfulConnection) {
        toast.warning(`Real-time connection lost: ${reason}`);
      }
    });

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.close();
    };
  }, [socket]);

  const value = useMemo(
    () => ({
      socket,
      isConnected: Boolean(socket?.id && connectedSocketId === socket.id),
    }),
    [connectedSocketId, socket],
  );

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

// Custom hook for listening to specific events
export function useSocketEvent<T = unknown>(
  eventName: string,
  callback: (data: T) => void
) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;

    socket.on(eventName, callback);

    return () => {
      socket.off(eventName, callback);
    };
  }, [socket, eventName, callback]);
}
