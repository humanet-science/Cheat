import { createContext, useContext, useState } from 'react';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const [ws, setWs] = useState(null);

  return (
    <WebSocketContext.Provider value={{ ws, setWs }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export const useWebSocket = () => useContext(WebSocketContext);