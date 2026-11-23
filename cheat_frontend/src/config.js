// config.js
const getWebSocketURL = () => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'ws://localhost:5050/ws';
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Study mode is served from a separate subdomain with a different nginx proxy path
    if (hostname === 'study.humanet.science') {
        return `${protocol}//${hostname}/cheat-ws/ws`;
    }
    return `${protocol}//${hostname}/ws`;
};

export const WS_URL = getWebSocketURL();

// Base URL of the HTTP API (same host as the WebSocket in production)
export const getAPIBaseURL = () => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:5050';
    }
    return `${window.location.protocol}//${hostname}`;
};
