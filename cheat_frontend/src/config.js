// config.js
const getWebSocketURL = () => {
    // If in development on the same machine, use localhost
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'ws://localhost:5050/ws';
    }

    // Otherwise, use the current hostname (or hardcode your laptop's IP)
    return `ws://${window.location.hostname}:5050/ws`;

    // Or hardcode for testing:
    // return 'ws://192.168.1.X:5050/ws';
};

export const WS_URL = getWebSocketURL();