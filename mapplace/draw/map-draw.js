// Map Drawing Application - Real-time collaborative drawing on real maps

class MapDraw {
    constructor() {
        this.map = null;
        this.socket = null;
        this.currentTool = 'pen';
        this.currentColor = '#FF0000';
        this.strokeWidth = 3;
        this.opacity = 1;

        this.isDrawing = false;
        this.currentPath = [];
        this.drawings = new Map();
        this.myDrawings = [];
        this.undoStack = [];
        this.redoStack = [];

        this.drawnItems = new L.FeatureGroup();
        this.currentPolyline = null;

        this.userName = this.generateUserName();
        this.userId = 'user_' + Math.random().toString(36).substr(2, 9);

        this.colors = [
            '#FF0000', '#FF6B6B', '#FF1744', '#E91E63',
            '#9C27B0', '#673AB7', '#3F51B5', '#2196F3',
            '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
            '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107',
            '#FF9800', '#FF5722', '#795548', '#9E9E9E',
            '#607D8B', '#000000', '#FFFFFF', '#FFD700'
        ];

        this.init();
    }

    init() {
        this.initMap();
        this.initSocket();
        this.setupTools();
        this.setupColorPalette();
        this.setupControls();
        this.setupDrawingHandlers();
    }

    initMap() {
        // Initialize map (Seoul center)
        this.map = L.map('map', {
            center: [37.5665, 126.9780],
            zoom: 13,
            minZoom: 3,
            maxZoom: 19
        });

        // Add OSM tile layer
        this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        // Add drawing layer
        this.drawnItems.addTo(this.map);

        // Get user location if available
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                this.map.setView([position.coords.latitude, position.coords.longitude], 15);
            });
        }

        // Load drawings when map moves
        this.map.on('moveend', () => this.loadVisibleDrawings());
    }

    initSocket() {
        this.socket = io(window.location.origin);

        this.socket.on('connect', () => {
            console.log('Connected to server');

            // Register user
            this.socket.emit('register', {
                name: this.userName,
                color: this.currentColor
            });
        });

        this.socket.on('registered', (data) => {
            console.log('Registered:', data);
            this.updateStats(data.stats);
            this.loadVisibleDrawings();
        });

        this.socket.on('drawings', (drawings) => {
            drawings.forEach(drawing => {
                if (!this.drawings.has(drawing.id)) {
                    this.addDrawingToMap(drawing);
                }
            });
        });

        this.socket.on('newDrawing', (drawing) => {
            if (!this.drawings.has(drawing.id)) {
                this.addDrawingToMap(drawing);
                this.showNotification(`${drawing.userName}님이 그림을 그렸습니다`);
            }
        });

        this.socket.on('drawingDeleted', (drawingId) => {
            this.removeDrawingFromMap(drawingId);
        });

        this.socket.on('areaCleared', (data) => {
            this.showNotification(`${data.count}개의 그림이 삭제되었습니다`);
            this.loadVisibleDrawings();
        });

        this.socket.on('userUpdate', (data) => {
            document.getElementById('userCount').textContent = data.count;
            this.updateUserList(data.users);
        });

        this.socket.on('stats', (stats) => {
            this.updateStats(stats);
        });
    }

    setupTools() {
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;

                // Update cursor
                this.updateCursor();
            });
        });
    }

    setupColorPalette() {
        const palette = document.getElementById('colorPalette');

        this.colors.forEach((color, index) => {
            const btn = document.createElement('button');
            btn.className = 'color-btn';
            btn.style.backgroundColor = color;

            if (index === 0) btn.classList.add('active');

            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentColor = color;
            });

            palette.appendChild(btn);
        });
    }

    setupControls() {
        // Stroke width slider
        const strokeSlider = document.getElementById('strokeSlider');
        strokeSlider.addEventListener('input', (e) => {
            this.strokeWidth = parseInt(e.target.value);
            document.getElementById('strokeValue').textContent = this.strokeWidth;
        });

        // Opacity slider
        const opacitySlider = document.getElementById('opacitySlider');
        opacitySlider.addEventListener('input', (e) => {
            this.opacity = parseInt(e.target.value) / 100;
            document.getElementById('opacityValue').textContent = e.target.value;
        });

        // Layer toggles
        document.getElementById('myDrawingsLayer').addEventListener('change', (e) => {
            this.toggleLayer('my', e.target.checked);
        });

        document.getElementById('othersDrawingsLayer').addEventListener('change', (e) => {
            this.toggleLayer('others', e.target.checked);
        });

        document.getElementById('satelliteLayer').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.tileLayer.setUrl('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
            } else {
                this.tileLayer.setUrl('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
            }
        });
    }

    setupDrawingHandlers() {
        this.map.on('mousedown', (e) => this.onMouseDown(e));
        this.map.on('mousemove', (e) => this.onMouseMove(e));
        this.map.on('mouseup', (e) => this.onMouseUp(e));

        // Touch support
        this.map.on('touchstart', (e) => this.onMouseDown(e));
        this.map.on('touchmove', (e) => this.onMouseMove(e));
        this.map.on('touchend', (e) => this.onMouseUp(e));
    }

    onMouseDown(e) {
        if (this.currentTool === 'move') return;

        this.isDrawing = true;
        const latlng = e.latlng;

        switch (this.currentTool) {
            case 'pen':
                this.startFreehand(latlng);
                break;
            case 'line':
                this.startLine(latlng);
                break;
            case 'polygon':
                this.startPolygon(latlng);
                break;
            case 'circle':
                this.startCircle(latlng);
                break;
            case 'rectangle':
                this.startRectangle(latlng);
                break;
            case 'marker':
                this.placeMarker(latlng);
                break;
            case 'text':
                this.placeText(latlng);
                break;
            case 'eraser':
                this.eraseAt(latlng);
                break;
        }
    }

    onMouseMove(e) {
        if (!this.isDrawing) return;

        const latlng = e.latlng;

        switch (this.currentTool) {
            case 'pen':
                this.continueFreehand(latlng);
                break;
            case 'circle':
                this.updateCircle(latlng);
                break;
            case 'rectangle':
                this.updateRectangle(latlng);
                break;
        }
    }

    onMouseUp(e) {
        if (!this.isDrawing) return;

        this.isDrawing = false;
        const latlng = e.latlng;

        switch (this.currentTool) {
            case 'pen':
                this.endFreehand();
                break;
            case 'line':
                this.endLine(latlng);
                break;
            case 'polygon':
                this.addPolygonPoint(latlng);
                break;
            case 'circle':
                this.endCircle(latlng);
                break;
            case 'rectangle':
                this.endRectangle(latlng);
                break;
        }
    }

    startFreehand(latlng) {
        this.currentPath = [[latlng.lat, latlng.lng]];
        this.currentPolyline = L.polyline(this.currentPath, {
            color: this.currentColor,
            weight: this.strokeWidth,
            opacity: this.opacity
        }).addTo(this.drawnItems);
    }

    continueFreehand(latlng) {
        if (!this.currentPolyline) return;

        this.currentPath.push([latlng.lat, latlng.lng]);
        this.currentPolyline.setLatLngs(this.currentPath);
    }

    endFreehand() {
        if (!this.currentPolyline || this.currentPath.length < 2) return;

        const drawing = {
            type: 'polyline',
            latlngs: this.currentPath,
            color: this.currentColor,
            weight: this.strokeWidth,
            opacity: this.opacity
        };

        this.saveDrawing(drawing);
        this.currentPolyline = null;
        this.currentPath = [];
    }

    placeMarker(latlng) {
        const marker = L.marker([latlng.lat, latlng.lng], {
            icon: L.divIcon({
                className: 'custom-marker',
                html: `<div style="background: ${this.currentColor}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>`,
                iconSize: [20, 20]
            })
        }).addTo(this.drawnItems);

        const drawing = {
            type: 'marker',
            latlng: [latlng.lat, latlng.lng],
            color: this.currentColor
        };

        this.saveDrawing(drawing);
    }

    placeText(latlng) {
        const text = prompt('텍스트를 입력하세요:');
        if (!text) return;

        const marker = L.marker([latlng.lat, latlng.lng], {
            icon: L.divIcon({
                className: 'text-marker',
                html: `<div style="background: white; padding: 5px 10px; border-radius: 5px; border: 2px solid ${this.currentColor}; color: ${this.currentColor}; font-weight: bold;">${text}</div>`,
                iconSize: null
            })
        }).addTo(this.drawnItems);

        const drawing = {
            type: 'text',
            latlng: [latlng.lat, latlng.lng],
            text: text,
            color: this.currentColor
        };

        this.saveDrawing(drawing);
    }

    eraseAt(latlng) {
        // Find and remove nearby drawings
        const bounds = L.latLngBounds(
            [latlng.lat - 0.001, latlng.lng - 0.001],
            [latlng.lat + 0.001, latlng.lng + 0.001]
        );

        this.socket.emit('clearArea', {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest()
        });
    }

    saveDrawing(drawing) {
        // Send to server
        this.socket.emit('draw', drawing);

        // Add to undo stack
        this.undoStack.push(drawing);
        this.redoStack = [];

        // Update my drawings count
        this.myDrawings.push(drawing);
        document.getElementById('myDrawings').textContent = this.myDrawings.length;
    }

    addDrawingToMap(drawing) {
        if (this.drawings.has(drawing.id)) return;

        let layer;

        switch (drawing.type) {
            case 'polyline':
                layer = L.polyline(drawing.latlngs, {
                    color: drawing.color || '#FF0000',
                    weight: drawing.weight || 3,
                    opacity: drawing.opacity || 1
                });
                break;

            case 'polygon':
                layer = L.polygon(drawing.latlngs, {
                    color: drawing.color || '#FF0000',
                    fillColor: drawing.fillColor || drawing.color,
                    weight: drawing.weight || 3,
                    opacity: drawing.opacity || 1,
                    fillOpacity: drawing.fillOpacity || 0.3
                });
                break;

            case 'circle':
                layer = L.circle(drawing.center, {
                    radius: drawing.radius,
                    color: drawing.color || '#FF0000',
                    fillColor: drawing.fillColor || drawing.color,
                    weight: drawing.weight || 3,
                    opacity: drawing.opacity || 1,
                    fillOpacity: drawing.fillOpacity || 0.3
                });
                break;

            case 'marker':
                layer = L.marker(drawing.latlng, {
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="background: ${drawing.color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>`,
                        iconSize: [20, 20]
                    })
                });
                break;

            case 'text':
                layer = L.marker(drawing.latlng, {
                    icon: L.divIcon({
                        className: 'text-marker',
                        html: `<div style="background: white; padding: 5px 10px; border-radius: 5px; border: 2px solid ${drawing.color}; color: ${drawing.color}; font-weight: bold;">${drawing.text}</div>`,
                        iconSize: null
                    })
                });
                break;
        }

        if (layer) {
            layer.bindPopup(`<b>${drawing.userName}</b><br>${new Date(drawing.timestamp).toLocaleString()}`);
            layer.addTo(this.drawnItems);

            this.drawings.set(drawing.id, {
                drawing: drawing,
                layer: layer
            });
        }
    }

    removeDrawingFromMap(drawingId) {
        const item = this.drawings.get(drawingId);
        if (item) {
            this.drawnItems.removeLayer(item.layer);
            this.drawings.delete(drawingId);
        }
    }

    loadVisibleDrawings() {
        const bounds = this.map.getBounds();

        this.socket.emit('requestDrawings', {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest()
        });
    }

    updateStats(stats) {
        if (stats.totalDrawings !== undefined) {
            document.getElementById('drawingCount').textContent = stats.totalDrawings;
        }
        if (stats.activeUsers !== undefined) {
            document.getElementById('userCount').textContent = stats.activeUsers;
        }
    }

    updateUserList(users) {
        const userList = document.getElementById('userList');
        userList.innerHTML = users.map(user => `
            <div class="user-item">
                <div class="user-dot"></div>
                <span>${user.name} (${user.drawingCount} 그림)</span>
            </div>
        `).join('');
    }

    toggleLayer(layer, visible) {
        this.drawings.forEach((item) => {
            const isMyDrawing = item.drawing.userId === this.userId;

            if ((layer === 'my' && isMyDrawing) || (layer === 'others' && !isMyDrawing)) {
                if (visible) {
                    this.drawnItems.addLayer(item.layer);
                } else {
                    this.drawnItems.removeLayer(item.layer);
                }
            }
        });
    }

    updateCursor() {
        const cursor = document.getElementById('drawingCursor');

        if (this.currentTool === 'pen' || this.currentTool === 'eraser') {
            cursor.style.width = this.strokeWidth * 2 + 'px';
            cursor.style.height = this.strokeWidth * 2 + 'px';
            cursor.style.borderColor = this.currentColor;
            cursor.style.display = 'block';

            document.addEventListener('mousemove', (e) => {
                cursor.style.left = e.clientX - this.strokeWidth + 'px';
                cursor.style.top = e.clientY - this.strokeWidth + 'px';
            });
        } else {
            cursor.style.display = 'none';
        }
    }

    showNotification(message) {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
        }, 2000);
    }

    generateUserName() {
        const adjectives = ['빠른', '용감한', '지혜로운', '창의적인', '열정적인'];
        const nouns = ['화가', '예술가', '탐험가', '지도사', '여행자'];

        return adjectives[Math.floor(Math.random() * adjectives.length)] + ' ' +
               nouns[Math.floor(Math.random() * nouns.length)];
    }
}

// Global functions
function undo() {
    // Implement undo
    window.mapDraw.showNotification('실행취소 기능 준비중');
}

function redo() {
    // Implement redo
    window.mapDraw.showNotification('다시실행 기능 준비중');
}

function clearAll() {
    if (confirm('정말 모든 그림을 삭제하시겠습니까?')) {
        const bounds = window.mapDraw.map.getBounds();
        window.mapDraw.socket.emit('clearArea', {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest()
        });
    }
}

function exportDrawing() {
    document.getElementById('exportModal').classList.add('active');
}

function closeExport() {
    document.getElementById('exportModal').classList.remove('active');
}

function exportAs(format) {
    fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: format })
    })
    .then(res => res.json())
    .then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `map-drawing-${Date.now()}.${format === 'geojson' ? 'geojson' : 'json'}`;
        a.click();
        URL.revokeObjectURL(url);

        closeExport();
        window.mapDraw.showNotification('내보내기 완료!');
    });
}

// Initialize
window.mapDraw = new MapDraw();
console.log('Map Draw initialized!');