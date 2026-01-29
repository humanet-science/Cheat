// config.js
const getWebSocketURL = () => {
    // If in development on the same machine, use localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'ws://localhost:5050/ws';
    }

    // In production, use wss:// (secure WebSocket) and no port
    // The protocol will match your page (ws for http, wss for https)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}/ws`;
};

export const WS_URL = getWebSocketURL();
