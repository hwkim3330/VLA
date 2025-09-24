// Real Map Drawing Server with Persistent Storage
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'draw')));
app.use(express.json());

// Database file for persistent storage
const DB_FILE = path.join(__dirname, 'map-drawings.json');

// Drawing data storage
class DrawingDatabase {
    constructor() {
        this.drawings = [];
        this.users = new Map();
        this.loadFromFile();
    }

    loadFromFile() {
        try {
            if (fs.existsSync(DB_FILE)) {
                const data = fs.readFileSync(DB_FILE, 'utf8');
                this.drawings = JSON.parse(data);
                console.log(`Loaded ${this.drawings.length} drawings from database`);
            }
        } catch (error) {
            console.error('Error loading database:', error);
            this.drawings = [];
        }
    }

    saveToFile() {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(this.drawings, null, 2));
        } catch (error) {
            console.error('Error saving database:', error);
        }
    }

    addDrawing(drawing) {
        const newDrawing = {
            id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...drawing,
            timestamp: Date.now()
        };

        this.drawings.push(newDrawing);
        this.saveToFile();
        return newDrawing;
    }

    getDrawingsInBounds(bounds) {
        return this.drawings.filter(d => {
            if (d.type === 'polyline' || d.type === 'polygon') {
                // Check if any point is in bounds
                return d.latlngs.some(point =>
                    point[0] >= bounds.south && point[0] <= bounds.north &&
                    point[1] >= bounds.west && point[1] <= bounds.east
                );
            } else if (d.type === 'circle') {
                return d.center[0] >= bounds.south && d.center[0] <= bounds.north &&
                       d.center[1] >= bounds.west && d.center[1] <= bounds.east;
            } else if (d.type === 'marker' || d.type === 'pixel') {
                return d.latlng[0] >= bounds.south && d.latlng[0] <= bounds.north &&
                       d.latlng[1] >= bounds.west && d.latlng[1] <= bounds.east;
            }
            return false;
        });
    }

    deleteDrawing(id) {
        const index = this.drawings.findIndex(d => d.id === id);
        if (index !== -1) {
            this.drawings.splice(index, 1);
            this.saveToFile();
            return true;
        }
        return false;
    }

    clearArea(bounds) {
        const before = this.drawings.length;
        this.drawings = this.drawings.filter(d => {
            if (d.type === 'polyline' || d.type === 'polygon') {
                return !d.latlngs.some(point =>
                    point[0] >= bounds.south && point[0] <= bounds.north &&
                    point[1] >= bounds.west && point[1] <= bounds.east
                );
            } else if (d.type === 'marker' || d.type === 'pixel') {
                return !(d.latlng[0] >= bounds.south && d.latlng[0] <= bounds.north &&
                        d.latlng[1] >= bounds.west && d.latlng[1] <= bounds.east);
            }
            return true;
        });

        const deleted = before - this.drawings.length;
        if (deleted > 0) {
            this.saveToFile();
        }
        return deleted;
    }
}

const db = new DrawingDatabase();

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    // Register user
    socket.on('register', (userData) => {
        const user = {
            id: socket.id,
            name: userData.name || `User${Math.floor(Math.random() * 10000)}`,
            color: userData.color || '#FF0000',
            drawingCount: 0
        };

        db.users.set(socket.id, user);

        socket.emit('registered', {
            user,
            stats: {
                totalDrawings: db.drawings.length,
                activeUsers: db.users.size
            }
        });

        // Broadcast user count
        io.emit('userUpdate', {
            count: db.users.size,
            users: Array.from(db.users.values()).map(u => ({
                name: u.name,
                drawingCount: u.drawingCount
            }))
        });
    });

    // Request drawings in viewport
    socket.on('requestDrawings', (bounds) => {
        const drawings = db.getDrawingsInBounds(bounds);
        socket.emit('drawings', drawings);
    });

    // Handle new drawing
    socket.on('draw', (drawingData) => {
        const user = db.users.get(socket.id);
        if (!user) return;

        // Add user info to drawing
        drawingData.userName = user.name;
        drawingData.userId = socket.id;

        // Save to database
        const drawing = db.addDrawing(drawingData);

        // Update user stats
        user.drawingCount++;

        // Broadcast to all clients
        io.emit('newDrawing', drawing);

        // Update stats
        io.emit('stats', {
            totalDrawings: db.drawings.length,
            activeUsers: db.users.size
        });
    });

    // Handle drawing deletion
    socket.on('deleteDrawing', (drawingId) => {
        const user = db.users.get(socket.id);
        if (!user) return;

        const drawing = db.drawings.find(d => d.id === drawingId);
        if (drawing && (drawing.userId === socket.id || user.isAdmin)) {
            if (db.deleteDrawing(drawingId)) {
                io.emit('drawingDeleted', drawingId);
            }
        }
    });

    // Handle clear area
    socket.on('clearArea', (bounds) => {
        const deleted = db.clearArea(bounds);
        if (deleted > 0) {
            io.emit('areaCleared', { bounds, count: deleted });
        }
    });

    // Handle chat messages
    socket.on('chatMessage', (message) => {
        const user = db.users.get(socket.id);
        if (!user) return;

        io.emit('chatMessage', {
            user: user.name,
            message: message.text,
            location: message.location,
            timestamp: Date.now()
        });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        db.users.delete(socket.id);

        io.emit('userUpdate', {
            count: db.users.size,
            users: Array.from(db.users.values()).map(u => ({
                name: u.name,
                drawingCount: u.drawingCount
            }))
        });
    });
});

// REST API endpoints
app.get('/api/stats', (req, res) => {
    res.json({
        totalDrawings: db.drawings.length,
        activeUsers: db.users.size,
        drawings: db.drawings.length,
        lastUpdate: Date.now()
    });
});

app.get('/api/drawings', (req, res) => {
    const { north, south, east, west } = req.query;

    if (north && south && east && west) {
        const bounds = {
            north: parseFloat(north),
            south: parseFloat(south),
            east: parseFloat(east),
            west: parseFloat(west)
        };
        res.json(db.getDrawingsInBounds(bounds));
    } else {
        res.json(db.drawings);
    }
});

app.post('/api/export', (req, res) => {
    const { format } = req.body;

    if (format === 'geojson') {
        const geojson = {
            type: 'FeatureCollection',
            features: db.drawings.map(d => {
                if (d.type === 'polyline') {
                    return {
                        type: 'Feature',
                        properties: {
                            id: d.id,
                            color: d.color,
                            weight: d.weight,
                            userName: d.userName
                        },
                        geometry: {
                            type: 'LineString',
                            coordinates: d.latlngs.map(ll => [ll[1], ll[0]])
                        }
                    };
                } else if (d.type === 'polygon') {
                    return {
                        type: 'Feature',
                        properties: {
                            id: d.id,
                            color: d.color,
                            fillColor: d.fillColor,
                            userName: d.userName
                        },
                        geometry: {
                            type: 'Polygon',
                            coordinates: [d.latlngs.map(ll => [ll[1], ll[0]])]
                        }
                    };
                } else if (d.type === 'marker') {
                    return {
                        type: 'Feature',
                        properties: {
                            id: d.id,
                            text: d.text,
                            userName: d.userName
                        },
                        geometry: {
                            type: 'Point',
                            coordinates: [d.latlng[1], d.latlng[0]]
                        }
                    };
                }
            }).filter(f => f)
        };

        res.json(geojson);
    } else {
        res.json(db.drawings);
    }
});

const PORT = process.env.PORT || 3005;
server.listen(PORT, () => {
    console.log(`
    🎨 Map Drawing Server Started!
    ================================
    Server: http://localhost:${PORT}

    Features:
    ✅ Real persistent drawing storage
    ✅ Multiple drawing tools (pen, shapes, markers)
    ✅ Real-time collaboration
    ✅ Export to GeoJSON
    ✅ Undo/Redo support
    ✅ Layer management

    Database: ${DB_FILE}
    Drawings: ${db.drawings.length} loaded

    Open http://localhost:${PORT} to start drawing!
    `);
});