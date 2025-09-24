// MapPlace Server - Real-time collaborative map drawing
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Map data storage
class MapCanvas {
    constructor() {
        // Using real coordinates (Seoul area as example)
        this.bounds = {
            north: 37.7,    // 북쪽 경계
            south: 37.4,    // 남쪽 경계
            east: 127.2,    // 동쪽 경계
            west: 126.8     // 서쪽 경계
        };

        this.resolution = 1000; // 1000x1000 pixels for the area
        this.pixels = new Map(); // Store as "lat,lng" -> {color, user, time}
        this.users = new Map();
        this.cooldowns = new Map();
        this.stats = {
            totalPixels: 0,
            activeUsers: 0,
            topAreas: new Map()
        };
    }

    // Convert lat/lng to pixel coordinates
    latLngToPixel(lat, lng) {
        const x = Math.floor(((lng - this.bounds.west) / (this.bounds.east - this.bounds.west)) * this.resolution);
        const y = Math.floor(((this.bounds.north - lat) / (this.bounds.north - this.bounds.south)) * this.resolution);
        return { x, y };
    }

    // Convert pixel to lat/lng
    pixelToLatLng(x, y) {
        const lat = this.bounds.north - (y / this.resolution) * (this.bounds.north - this.bounds.south);
        const lng = this.bounds.west + (x / this.resolution) * (this.bounds.east - this.bounds.west);
        return { lat, lng };
    }

    // Place a pixel on the map
    placePixel(lat, lng, color, userId, userName) {
        const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

        // Check cooldown
        const lastPlace = this.cooldowns.get(userId) || 0;
        const now = Date.now();
        if (now - lastPlace < 5000) {
            return { success: false, cooldown: 5000 - (now - lastPlace) };
        }

        // Place the pixel
        this.pixels.set(key, {
            color,
            userId,
            userName,
            time: now
        });

        this.cooldowns.set(userId, now);
        this.stats.totalPixels++;

        // Track area activity
        const areaKey = `${Math.floor(lat * 10)},${Math.floor(lng * 10)}`;
        this.stats.topAreas.set(areaKey, (this.stats.topAreas.get(areaKey) || 0) + 1);

        return { success: true, pixel: { lat, lng, color, userName } };
    }

    // Get all pixels in a region
    getPixelsInRegion(bounds) {
        const pixels = [];
        for (const [key, data] of this.pixels.entries()) {
            const [lat, lng] = key.split(',').map(Number);
            if (lat >= bounds.south && lat <= bounds.north &&
                lng >= bounds.west && lng <= bounds.east) {
                pixels.push({ lat, lng, ...data });
            }
        }
        return pixels;
    }
}

const mapCanvas = new MapCanvas();

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Register user
    socket.on('register', (data) => {
        const user = {
            id: socket.id,
            name: data.name || `User${Math.floor(Math.random() * 10000)}`,
            color: data.color || '#FF0000',
            pixelCount: 0
        };

        mapCanvas.users.set(socket.id, user);
        mapCanvas.stats.activeUsers = mapCanvas.users.size;

        // Send initial data
        socket.emit('registered', {
            user,
            bounds: mapCanvas.bounds,
            stats: mapCanvas.stats
        });

        // Send existing pixels in view
        socket.on('requestPixels', (bounds) => {
            const pixels = mapCanvas.getPixelsInRegion(bounds);
            socket.emit('pixels', pixels);
        });

        // Broadcast user count
        io.emit('userCount', mapCanvas.stats.activeUsers);
    });

    // Handle pixel placement
    socket.on('placePixel', (data) => {
        const user = mapCanvas.users.get(socket.id);
        if (!user) return;

        const result = mapCanvas.placePixel(
            data.lat,
            data.lng,
            data.color,
            socket.id,
            user.name
        );

        if (result.success) {
            // Update user stats
            user.pixelCount++;

            // Broadcast to all clients
            io.emit('pixelPlaced', result.pixel);

            // Send success to placer
            socket.emit('placeResult', { success: true });

            // Update global stats
            io.emit('stats', {
                totalPixels: mapCanvas.stats.totalPixels,
                activeUsers: mapCanvas.stats.activeUsers
            });
        } else {
            // Send cooldown error
            socket.emit('placeResult', {
                success: false,
                cooldown: result.cooldown
            });
        }
    });

    // Handle chat messages
    socket.on('chatMessage', (message) => {
        const user = mapCanvas.users.get(socket.id);
        if (!user) return;

        io.emit('chatMessage', {
            user: user.name,
            message: message,
            time: Date.now()
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        mapCanvas.users.delete(socket.id);
        mapCanvas.stats.activeUsers = mapCanvas.users.size;
        io.emit('userCount', mapCanvas.stats.activeUsers);
    });
});

// REST API endpoints
app.get('/api/stats', (req, res) => {
    res.json({
        totalPixels: mapCanvas.stats.totalPixels,
        activeUsers: mapCanvas.stats.activeUsers,
        topAreas: Array.from(mapCanvas.stats.topAreas.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([key, count]) => {
                const [lat, lng] = key.split(',').map(Number);
                return { lat: lat / 10, lng: lng / 10, count };
            })
    });
});

app.get('/api/heatmap', (req, res) => {
    const heatmapData = [];
    for (const [key, data] of mapCanvas.pixels.entries()) {
        const [lat, lng] = key.split(',').map(Number);
        heatmapData.push({ lat, lng, intensity: 1 });
    }
    res.json(heatmapData);
});

const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
    console.log(`
    🗺️  MapPlace Server Started!
    ================================
    Server: http://localhost:${PORT}

    Features:
    - Real-time pixel placement on map
    - 5 second cooldown per user
    - Live user count & stats
    - Chat system
    - Seoul area map (expandable)

    Open http://localhost:${PORT} to start!
    `);
});