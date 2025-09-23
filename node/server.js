const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Node information
const nodeInfo = {
    id: crypto.randomBytes(16).toString('hex'),
    port: process.env.PORT || 8080,
    publicKey: null,
    reputation: 100,
    messageCount: 0,
    rewards: 0,
    connections: new Map(),
    peers: new Map()
};

// Generate node keypair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
nodeInfo.publicKey = publicKey;

// Connected clients
const clients = new Map();
const messageQueue = new Map();

// Reward calculation
function calculateReward(messageSize, priority = 1) {
    const baseReward = 0.001; // Base reward per message
    const sizeBonus = messageSize / 10000; // Bonus based on message size
    return (baseReward + sizeBonus) * priority;
}

// Peer discovery
const knownNodes = new Set();
if (process.env.BOOTSTRAP_NODES) {
    process.env.BOOTSTRAP_NODES.split(',').forEach(node => knownNodes.add(node));
}

io.on('connection', (socket) => {
    console.log(`[Node ${nodeInfo.id}] New client connected: ${socket.id}`);

    // Register client
    socket.on('register', (data) => {
        const clientId = data.userId || crypto.randomBytes(8).toString('hex');
        clients.set(socket.id, {
            id: clientId,
            socket: socket,
            publicKey: data.publicKey,
            timestamp: Date.now()
        });

        socket.emit('registered', {
            nodeId: nodeInfo.id,
            clientId: clientId,
            nodePublicKey: nodeInfo.publicKey
        });

        // Send node stats
        socket.emit('nodeStats', {
            nodeId: nodeInfo.id,
            reputation: nodeInfo.reputation,
            messageCount: nodeInfo.messageCount,
            rewards: nodeInfo.rewards.toFixed(6),
            connectedClients: clients.size,
            connectedPeers: nodeInfo.peers.size
        });
    });

    // Handle direct messages with E2E encryption
    socket.on('sendMessage', async (data) => {
        try {
            const { recipientId, encryptedContent, signature } = data;
            const sender = clients.get(socket.id);

            if (!sender) {
                socket.emit('error', { message: 'Not registered' });
                return;
            }

            // Process reward
            const reward = calculateReward(Buffer.byteLength(encryptedContent));
            nodeInfo.rewards += reward;
            nodeInfo.messageCount++;

            // Find recipient locally
            let recipientFound = false;
            for (const [socketId, client] of clients.entries()) {
                if (client.id === recipientId) {
                    client.socket.emit('newMessage', {
                        senderId: sender.id,
                        encryptedContent: encryptedContent,
                        signature: signature,
                        timestamp: Date.now(),
                        nodeId: nodeInfo.id
                    });
                    recipientFound = true;
                    break;
                }
            }

            // If not found locally, relay to peer nodes
            if (!recipientFound) {
                broadcastToPeers('relayMessage', {
                    senderId: sender.id,
                    recipientId: recipientId,
                    encryptedContent: encryptedContent,
                    signature: signature,
                    timestamp: Date.now(),
                    originNode: nodeInfo.id
                });
            }

            socket.emit('messageSent', {
                success: true,
                reward: reward.toFixed(6)
            });

            // Update stats
            broadcastNodeStats();

        } catch (error) {
            console.error('Message send error:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Handle room messages
    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);
        socket.emit('joinedRoom', { roomId });

        // Notify others in room
        socket.to(roomId).emit('userJoinedRoom', {
            userId: clients.get(socket.id)?.id,
            roomId: roomId
        });
    });

    socket.on('sendRoomMessage', (data) => {
        const { roomId, encryptedContent } = data;
        const sender = clients.get(socket.id);

        if (!sender) return;

        // Calculate reward for group message
        const reward = calculateReward(Buffer.byteLength(encryptedContent), 1.5);
        nodeInfo.rewards += reward;
        nodeInfo.messageCount++;

        io.to(roomId).emit('roomMessage', {
            senderId: sender.id,
            roomId: roomId,
            encryptedContent: encryptedContent,
            timestamp: Date.now()
        });

        socket.emit('messageSent', {
            success: true,
            reward: reward.toFixed(6)
        });

        broadcastNodeStats();
    });

    // WebRTC Signaling
    socket.on('offer', (data) => {
        const target = findClientByUserId(data.targetId);
        if (target) {
            target.socket.emit('offer', {
                offer: data.offer,
                senderId: clients.get(socket.id)?.id
            });
        }
    });

    socket.on('answer', (data) => {
        const target = findClientByUserId(data.targetId);
        if (target) {
            target.socket.emit('answer', {
                answer: data.answer,
                senderId: clients.get(socket.id)?.id
            });
        }
    });

    socket.on('ice-candidate', (data) => {
        const target = findClientByUserId(data.targetId);
        if (target) {
            target.socket.emit('ice-candidate', {
                candidate: data.candidate,
                senderId: clients.get(socket.id)?.id
            });
        }
    });

    // Node peer management
    socket.on('connectToPeer', (peerUrl) => {
        connectToPeerNode(peerUrl);
    });

    socket.on('disconnect', () => {
        console.log(`[Node ${nodeInfo.id}] Client disconnected: ${socket.id}`);
        clients.delete(socket.id);
        broadcastNodeStats();
    });
});

// Helper functions
function findClientByUserId(userId) {
    for (const [socketId, client] of clients.entries()) {
        if (client.id === userId) {
            return client;
        }
    }
    return null;
}

function broadcastNodeStats() {
    const stats = {
        nodeId: nodeInfo.id,
        reputation: nodeInfo.reputation,
        messageCount: nodeInfo.messageCount,
        rewards: nodeInfo.rewards.toFixed(6),
        connectedClients: clients.size,
        connectedPeers: nodeInfo.peers.size
    };

    io.emit('nodeStats', stats);
}

function broadcastToPeers(event, data) {
    nodeInfo.peers.forEach(peer => {
        if (peer.socket && peer.socket.connected) {
            peer.socket.emit(event, data);
        }
    });
}

function connectToPeerNode(peerUrl) {
    const ioClient = require('socket.io-client');
    const peerSocket = ioClient(peerUrl);

    peerSocket.on('connect', () => {
        console.log(`Connected to peer node: ${peerUrl}`);
        nodeInfo.peers.set(peerUrl, { url: peerUrl, socket: peerSocket });

        peerSocket.emit('peerHandshake', {
            nodeId: nodeInfo.id,
            publicKey: nodeInfo.publicKey,
            reputation: nodeInfo.reputation
        });
    });

    peerSocket.on('relayMessage', (data) => {
        // Relay message to local clients
        const recipient = findClientByUserId(data.recipientId);
        if (recipient) {
            recipient.socket.emit('newMessage', data);
        } else {
            // Continue relaying to other peers
            broadcastToPeers('relayMessage', data);
        }
    });

    peerSocket.on('disconnect', () => {
        console.log(`Disconnected from peer: ${peerUrl}`);
        nodeInfo.peers.delete(peerUrl);
    });
}

// REST API endpoints
app.get('/api/node/info', (req, res) => {
    res.json({
        nodeId: nodeInfo.id,
        publicKey: nodeInfo.publicKey,
        reputation: nodeInfo.reputation,
        messageCount: nodeInfo.messageCount,
        rewards: nodeInfo.rewards.toFixed(6),
        connectedClients: clients.size,
        connectedPeers: nodeInfo.peers.size,
        uptime: process.uptime()
    });
});

app.get('/api/node/peers', (req, res) => {
    res.json({
        peers: Array.from(nodeInfo.peers.keys())
    });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`
    ╔════════════════════════════════════════╗
    ║     P2P Messenger Node Started         ║
    ╠════════════════════════════════════════╣
    ║  Node ID: ${nodeInfo.id.substring(0, 16)}...  ║
    ║  Port: ${PORT}                            ║
    ║  Status: ONLINE                        ║
    ║  Rewards System: ACTIVE                ║
    ╚════════════════════════════════════════╝

    Node URL: http://localhost:${PORT}
    API Endpoint: http://localhost:${PORT}/api/node/info
    `);
});