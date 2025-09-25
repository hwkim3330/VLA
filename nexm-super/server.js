// NEXM Super - All-in-One Messenger with Token Economy
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Database files
const USERS_DB = path.join(__dirname, 'users.json');
const MESSAGES_DB = path.join(__dirname, 'messages.json');
const PIXELS_DB = path.join(__dirname, 'pixels.json');
const TOKENS_DB = path.join(__dirname, 'tokens.json');
const NODES_DB = path.join(__dirname, 'nodes.json');

// Token Economy System
class TokenEconomy {
    constructor() {
        this.balances = new Map();
        this.transactions = [];
        this.totalSupply = 1000000; // 1M tokens
        this.miningReward = 10; // tokens per block
        this.messageReward = 0.1; // tokens per message relayed
        this.pixelCost = 0.5; // tokens per pixel
        this.loadFromFile();
    }

    loadFromFile() {
        try {
            if (fs.existsSync(TOKENS_DB)) {
                const data = JSON.parse(fs.readFileSync(TOKENS_DB, 'utf8'));
                this.balances = new Map(data.balances);
                this.transactions = data.transactions;
                this.totalSupply = data.totalSupply;
            }
        } catch (error) {
            console.error('Error loading token database:', error);
        }
    }

    saveToFile() {
        const data = {
            balances: Array.from(this.balances.entries()),
            transactions: this.transactions,
            totalSupply: this.totalSupply
        };
        fs.writeFileSync(TOKENS_DB, JSON.stringify(data, null, 2));
    }

    getBalance(userId) {
        return this.balances.get(userId) || 0;
    }

    transfer(fromUserId, toUserId, amount) {
        const fromBalance = this.getBalance(fromUserId);

        if (fromBalance < amount) {
            return { success: false, error: 'Insufficient balance' };
        }

        this.balances.set(fromUserId, fromBalance - amount);
        this.balances.set(toUserId, this.getBalance(toUserId) + amount);

        const transaction = {
            id: crypto.randomBytes(16).toString('hex'),
            from: fromUserId,
            to: toUserId,
            amount: amount,
            timestamp: Date.now(),
            type: 'transfer'
        };

        this.transactions.push(transaction);
        this.saveToFile();

        return { success: true, transaction };
    }

    reward(userId, amount, reason) {
        this.balances.set(userId, this.getBalance(userId) + amount);

        const transaction = {
            id: crypto.randomBytes(16).toString('hex'),
            to: userId,
            amount: amount,
            reason: reason,
            timestamp: Date.now(),
            type: 'reward'
        };

        this.transactions.push(transaction);
        this.saveToFile();

        return transaction;
    }

    deduct(userId, amount, reason) {
        const balance = this.getBalance(userId);

        if (balance < amount) {
            return { success: false, error: 'Insufficient balance' };
        }

        this.balances.set(userId, balance - amount);

        const transaction = {
            id: crypto.randomBytes(16).toString('hex'),
            from: userId,
            amount: amount,
            reason: reason,
            timestamp: Date.now(),
            type: 'deduction'
        };

        this.transactions.push(transaction);
        this.saveToFile();

        return { success: true, transaction };
    }
}

// Pixel Art System
class PixelCanvas {
    constructor() {
        this.width = 200;  // 200x200 grid
        this.height = 200;
        this.pixels = new Map();
        this.pixelOwners = new Map();
        this.loadFromFile();
    }

    loadFromFile() {
        try {
            if (fs.existsSync(PIXELS_DB)) {
                const data = JSON.parse(fs.readFileSync(PIXELS_DB, 'utf8'));
                this.pixels = new Map(data.pixels);
                this.pixelOwners = new Map(data.pixelOwners);
            }
        } catch (error) {
            console.error('Error loading pixels database:', error);
        }
    }

    saveToFile() {
        const data = {
            pixels: Array.from(this.pixels.entries()),
            pixelOwners: Array.from(this.pixelOwners.entries())
        };
        fs.writeFileSync(PIXELS_DB, JSON.stringify(data, null, 2));
    }

    placePixel(x, y, color, userId) {
        const key = `${x},${y}`;
        this.pixels.set(key, color);
        this.pixelOwners.set(key, {
            userId: userId,
            timestamp: Date.now()
        });
        this.saveToFile();
        return true;
    }

    getPixel(x, y) {
        return this.pixels.get(`${x},${y}`) || '#FFFFFF';
    }

    getArea(x1, y1, x2, y2) {
        const pixels = [];
        for (let y = y1; y <= y2; y++) {
            for (let x = x1; x <= x2; x++) {
                const color = this.getPixel(x, y);
                if (color !== '#FFFFFF') {
                    pixels.push({ x, y, color });
                }
            }
        }
        return pixels;
    }
}

// Node Management System
class NodeManager {
    constructor() {
        this.nodes = new Map();
        this.nodeStats = new Map();
        this.loadFromFile();
    }

    loadFromFile() {
        try {
            if (fs.existsSync(NODES_DB)) {
                const data = JSON.parse(fs.readFileSync(NODES_DB, 'utf8'));
                this.nodes = new Map(data.nodes);
                this.nodeStats = new Map(data.nodeStats);
            }
        } catch (error) {
            console.error('Error loading nodes database:', error);
        }
    }

    saveToFile() {
        const data = {
            nodes: Array.from(this.nodes.entries()),
            nodeStats: Array.from(this.nodeStats.entries())
        };
        fs.writeFileSync(NODES_DB, JSON.stringify(data, null, 2));
    }

    registerNode(nodeId, nodeInfo) {
        this.nodes.set(nodeId, {
            ...nodeInfo,
            registeredAt: Date.now(),
            status: 'active'
        });

        this.nodeStats.set(nodeId, {
            messagesRelayed: 0,
            pixelsServed: 0,
            uptime: 0,
            totalRewards: 0
        });

        this.saveToFile();
    }

    updateNodeStats(nodeId, stat, value) {
        const stats = this.nodeStats.get(nodeId) || {};
        stats[stat] = (stats[stat] || 0) + value;
        this.nodeStats.set(nodeId, stats);
        this.saveToFile();
    }
}

// Initialize systems
const tokenEconomy = new TokenEconomy();
const pixelCanvas = new PixelCanvas();
const nodeManager = new NodeManager();

// Admin credentials (hardcoded for simplicity)
const ADMIN_PASSWORD = 'admin'; // Simple admin password

// Connected users
const users = new Map();
const adminUsers = new Set(); // Track admin users
const messages = [];

// Socket.io handlers
io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // User registration
    socket.on('register', (userData) => {
        const user = {
            id: socket.id,
            username: userData.username,
            phone: userData.phone || null,
            publicKey: userData.publicKey,
            isNode: userData.isNode || false,
            isAdmin: false, // Default to false
            joinedAt: Date.now()
        };

        // Check if admin login
        if (userData.adminPassword && userData.adminPassword === ADMIN_PASSWORD) {
            user.isAdmin = true;
            adminUsers.add(socket.id);
            console.log(`Admin user logged in: ${user.username}`);
        }

        users.set(socket.id, user);

        // Give welcome bonus (admins get unlimited tokens)
        if (user.isAdmin) {
            tokenEconomy.reward(socket.id, 999999, 'Admin privileges');
        } else if (tokenEconomy.getBalance(socket.id) === 0) {
            tokenEconomy.reward(socket.id, 100, 'Welcome bonus');
        }

        // Register as node if requested
        if (user.isNode) {
            nodeManager.registerNode(socket.id, {
                username: user.username,
                ip: socket.handshake.address
            });
        }

        socket.emit('registered', {
            userId: socket.id,
            balance: tokenEconomy.getBalance(socket.id),
            isAdmin: user.isAdmin,
            canvasSize: { width: pixelCanvas.width, height: pixelCanvas.height }
        });

        // Send initial data
        socket.emit('stats', {
            users: users.size,
            totalPixels: pixelCanvas.pixels.size,
            totalTransactions: tokenEconomy.transactions.length,
            activeNodes: nodeManager.nodes.size
        });

        io.emit('userUpdate', {
            count: users.size,
            users: Array.from(users.values()).map(u => ({
                username: u.username,
                balance: tokenEconomy.getBalance(u.id),
                isNode: u.isNode
            }))
        });
    });

    // Messaging with token rewards
    socket.on('sendMessage', (data) => {
        const user = users.get(socket.id);
        if (!user) return;

        const message = {
            id: crypto.randomBytes(8).toString('hex'),
            from: user.username,
            to: data.to,
            content: data.content,
            encrypted: data.encrypted || false,
            timestamp: Date.now()
        };

        messages.push(message);

        // Reward nodes for relaying
        nodeManager.nodes.forEach((node, nodeId) => {
            if (node.status === 'active') {
                tokenEconomy.reward(nodeId, tokenEconomy.messageReward, 'Message relay');
                nodeManager.updateNodeStats(nodeId, 'messagesRelayed', 1);
                nodeManager.updateNodeStats(nodeId, 'totalRewards', tokenEconomy.messageReward);
            }
        });

        // Broadcast message
        if (data.to === 'all') {
            io.emit('newMessage', message);
        } else {
            // Find recipient
            for (const [socketId, u] of users.entries()) {
                if (u.username === data.to) {
                    io.to(socketId).emit('newMessage', message);
                    break;
                }
            }
            socket.emit('newMessage', message); // Echo to sender
        }

        // Update balance
        socket.emit('balanceUpdate', tokenEconomy.getBalance(socket.id));
    });

    // Pixel placement with token cost
    socket.on('placePixel', (data) => {
        const user = users.get(socket.id);
        if (!user) return;

        // Admins can place pixels for free with no cooldown
        if (!user.isAdmin) {
            // Check balance for regular users
            const cost = tokenEconomy.pixelCost;
            const deduction = tokenEconomy.deduct(socket.id, cost, 'Pixel placement');

            if (!deduction.success) {
                socket.emit('pixelError', { error: 'Insufficient tokens' });
                return;
            }
        }

        // Place pixel
        pixelCanvas.placePixel(data.x, data.y, data.color, socket.id);

        // Broadcast pixel update
        io.emit('pixelPlaced', {
            x: data.x,
            y: data.y,
            color: data.color,
            user: user.username
        });

        // Reward nodes
        nodeManager.nodes.forEach((node, nodeId) => {
            if (node.status === 'active') {
                const reward = tokenEconomy.pixelCost * 0.2; // 20% goes to nodes
                tokenEconomy.reward(nodeId, reward, 'Pixel service');
                nodeManager.updateNodeStats(nodeId, 'pixelsServed', 1);
            }
        });

        // Update balance
        socket.emit('balanceUpdate', tokenEconomy.getBalance(socket.id));
    });

    // Request pixels in area
    socket.on('requestPixels', (data) => {
        const pixels = pixelCanvas.getArea(
            data.x1 || 0,
            data.y1 || 0,
            data.x2 || pixelCanvas.width,
            data.y2 || pixelCanvas.height
        );
        socket.emit('pixels', pixels);
    });

    // Token transfer
    socket.on('transfer', (data) => {
        const user = users.get(socket.id);
        if (!user) return;

        // Find recipient
        let recipientId = null;
        for (const [socketId, u] of users.entries()) {
            if (u.username === data.to) {
                recipientId = socketId;
                break;
            }
        }

        if (!recipientId) {
            socket.emit('transferError', { error: 'Recipient not found' });
            return;
        }

        const result = tokenEconomy.transfer(socket.id, recipientId, data.amount);

        if (result.success) {
            socket.emit('transferSuccess', result.transaction);
            io.to(recipientId).emit('tokenReceived', {
                from: user.username,
                amount: data.amount,
                transaction: result.transaction
            });

            // Update balances
            socket.emit('balanceUpdate', tokenEconomy.getBalance(socket.id));
            io.to(recipientId).emit('balanceUpdate', tokenEconomy.getBalance(recipientId));
        } else {
            socket.emit('transferError', { error: result.error });
        }
    });

    // Mining simulation (for nodes)
    socket.on('startMining', () => {
        const user = users.get(socket.id);
        if (!user || !user.isNode) return;

        // Simulate mining every 30 seconds
        const miningInterval = setInterval(() => {
            if (!users.has(socket.id)) {
                clearInterval(miningInterval);
                return;
            }

            const reward = tokenEconomy.miningReward;
            tokenEconomy.reward(socket.id, reward, 'Mining reward');
            nodeManager.updateNodeStats(socket.id, 'totalRewards', reward);

            socket.emit('miningReward', {
                amount: reward,
                balance: tokenEconomy.getBalance(socket.id)
            });
        }, 30000);

        socket.on('disconnect', () => {
            clearInterval(miningInterval);
        });
    });

    // Get transaction history
    socket.on('getTransactions', () => {
        const userTransactions = tokenEconomy.transactions.filter(t =>
            t.from === socket.id || t.to === socket.id
        ).slice(-50); // Last 50 transactions

        socket.emit('transactions', userTransactions);
    });

    // Get leaderboard
    socket.on('getLeaderboard', () => {
        const leaderboard = Array.from(tokenEconomy.balances.entries())
            .map(([userId, balance]) => {
                const user = users.get(userId);
                return {
                    username: user ? user.username : 'Unknown',
                    balance: balance,
                    isNode: user ? user.isNode : false
                };
            })
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 10);

        socket.emit('leaderboard', leaderboard);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        const user = users.get(socket.id);
        if (user && user.isNode) {
            const node = nodeManager.nodes.get(socket.id);
            if (node) {
                node.status = 'offline';
                nodeManager.saveToFile();
            }
        }

        users.delete(socket.id);

        io.emit('userUpdate', {
            count: users.size,
            users: Array.from(users.values()).map(u => ({
                username: u.username,
                balance: tokenEconomy.getBalance(u.id),
                isNode: u.isNode
            }))
        });
    });
});

// REST API endpoints
app.get('/api/stats', (req, res) => {
    res.json({
        users: users.size,
        messages: messages.length,
        pixels: pixelCanvas.pixels.size,
        transactions: tokenEconomy.transactions.length,
        nodes: nodeManager.nodes.size,
        totalSupply: tokenEconomy.totalSupply,
        circulatingSupply: Array.from(tokenEconomy.balances.values()).reduce((a, b) => a + b, 0)
    });
});

app.get('/api/canvas', (req, res) => {
    const allPixels = [];
    for (let y = 0; y < pixelCanvas.height; y++) {
        for (let x = 0; x < pixelCanvas.width; x++) {
            const color = pixelCanvas.getPixel(x, y);
            if (color !== '#FFFFFF') {
                allPixels.push({ x, y, color });
            }
        }
    }
    res.json(allPixels);
});

app.get('/api/nodes', (req, res) => {
    const nodeList = Array.from(nodeManager.nodes.entries()).map(([id, node]) => ({
        id: id.substring(0, 8) + '...',
        username: node.username,
        status: node.status,
        stats: nodeManager.nodeStats.get(id)
    }));
    res.json(nodeList);
});

const PORT = process.env.PORT || 3006;
server.listen(PORT, () => {
    console.log(`
    🚀 NEXM Super Messenger Started!
    ====================================
    Server: http://localhost:${PORT}

    ✨ Features:
    • 💬 E2E Encrypted Messaging
    • 🎨 Pixel Art Canvas (200x200)
    • 💰 Token Economy System
    • ⛏️ Node Mining Rewards
    • 💸 P2P Token Trading
    • 📊 Real-time Statistics
    • 🏆 Leaderboard System

    💰 Token Economics:
    • Welcome Bonus: 100 NEXM
    • Message Relay: 0.1 NEXM/msg
    • Pixel Cost: 0.5 NEXM/pixel
    • Mining Reward: 10 NEXM/block
    • Node Reward: 20% of fees

    Open http://localhost:${PORT} to start!
    `);
});