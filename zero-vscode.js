// Zero VSCode - Simplified P2P Messenger (No NPM Required)
// Works in any modern browser with WebRTC support

const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Simple signaling server for WebRTC
const peers = new Map();
const rooms = new Map();

app.use(express.json());

// Phone/email registration
app.post('/api/register', (req, res) => {
    const { identifier, publicKey } = req.body; // identifier can be phone or email

    const userId = Buffer.from(identifier).toString('base64').substring(0, 10);
    peers.set(userId, {
        identifier,
        publicKey,
        lastSeen: Date.now()
    });

    res.json({
        success: true,
        userId,
        signalServer: 'wss://signal.p2pmsg.app' // Will use public WebRTC signaling
    });
});

// Get peer info
app.get('/api/peer/:id', (req, res) => {
    const peer = peers.get(req.params.id);
    if (peer) {
        res.json(peer);
    } else {
        res.status(404).json({ error: 'Peer not found' });
    }
});

// Simple room management
app.post('/api/room/create', (req, res) => {
    const roomId = 'room-' + Date.now();
    rooms.set(roomId, {
        created: Date.now(),
        members: []
    });
    res.json({ roomId });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Zero VSCode Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});