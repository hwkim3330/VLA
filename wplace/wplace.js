// WPlace - Collaborative Pixel Art Canvas
class WPlace {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');

        // Canvas settings
        this.gridSize = 100; // 100x100 pixels
        this.pixelSize = 8;
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;

        // User settings
        this.userId = this.generateUserId();
        this.userName = this.generateUserName();
        this.selectedColor = '#000000';
        this.lastPlaceTime = 0;
        this.cooldownTime = 5000; // 5 seconds

        // Canvas data
        this.pixels = new Array(this.gridSize * this.gridSize).fill('#FFFFFF');
        this.pixelOwners = new Array(this.gridSize * this.gridSize).fill(null);

        // WebSocket or WebRTC connection (simulated for now)
        this.users = new Map();
        this.pixelCount = 0;

        // Color palette
        this.colors = [
            '#FFFFFF', '#E4E4E4', '#888888', '#222222',
            '#FFA7D1', '#E50000', '#E59500', '#A06A42',
            '#E5D900', '#94E044', '#02BE01', '#00D3DD',
            '#0083C7', '#0000EA', '#CF6EE4', '#820080',
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
            '#98D8C8', '#FDCB6E', '#6C5CE7', '#A29BFE',
            '#FD79A8', '#FDCB6E', '#00B894', '#636E72'
        ];

        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupColorPalette();
        this.setupEventListeners();
        this.loadCanvasData();
        this.startSimulation();

        // Hide loading after init
        setTimeout(() => {
            document.getElementById('loadingOverlay').style.display = 'none';
        }, 500);
    }

    setupCanvas() {
        const size = this.gridSize * this.pixelSize;
        this.canvas.width = size;
        this.canvas.height = size;

        // Set canvas size with zoom
        this.updateCanvasSize();

        // Draw initial grid
        this.drawGrid();

        // Enable image smoothing prevention
        this.ctx.imageSmoothingEnabled = false;
    }

    updateCanvasSize() {
        const size = this.gridSize * this.pixelSize * this.zoom;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
    }

    drawGrid() {
        // Clear canvas
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw pixels
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const index = y * this.gridSize + x;
                const color = this.pixels[index];

                this.ctx.fillStyle = color;
                this.ctx.fillRect(
                    x * this.pixelSize,
                    y * this.pixelSize,
                    this.pixelSize,
                    this.pixelSize
                );
            }
        }

        // Draw grid lines (optional, for visibility)
        if (this.zoom >= 2) {
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
            this.ctx.lineWidth = 0.5;

            for (let i = 0; i <= this.gridSize; i++) {
                // Vertical lines
                this.ctx.beginPath();
                this.ctx.moveTo(i * this.pixelSize, 0);
                this.ctx.lineTo(i * this.pixelSize, this.canvas.height);
                this.ctx.stroke();

                // Horizontal lines
                this.ctx.beginPath();
                this.ctx.moveTo(0, i * this.pixelSize);
                this.ctx.lineTo(this.canvas.width, i * this.pixelSize);
                this.ctx.stroke();
            }
        }
    }

    setupColorPalette() {
        const palette = document.getElementById('colorPalette');

        this.colors.forEach((color, index) => {
            const btn = document.createElement('button');
            btn.className = 'color-btn';
            btn.style.backgroundColor = color;
            btn.dataset.color = color;

            if (index === 0) btn.classList.add('active');

            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedColor = color;
            });

            palette.appendChild(btn);
        });
    }

    setupEventListeners() {
        // Canvas click
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

        // Canvas hover
        this.canvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
        this.canvas.addEventListener('mouseleave', () => this.hidePixelInfo());

        // Canvas drag (pan)
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.shiftKey) {
                isDragging = true;
                dragStartX = e.clientX - this.offsetX;
                dragStartY = e.clientY - this.offsetY;
                this.canvas.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                this.offsetX = e.clientX - dragStartX;
                this.offsetY = e.clientY - dragStartY;
                this.canvas.style.transform = `translate(${this.offsetX}px, ${this.offsetY}px)`;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            this.canvas.style.cursor = 'crosshair';
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === '+' || e.key === '=') this.zoomIn();
            if (e.key === '-' || e.key === '_') this.zoomOut();
            if (e.key === '0') this.resetZoom();
        });
    }

    handleCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / (this.pixelSize * this.zoom));
        const y = Math.floor((event.clientY - rect.top) / (this.pixelSize * this.zoom));

        if (x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize) {
            this.placePixel(x, y);
        }
    }

    handleCanvasHover(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / (this.pixelSize * this.zoom));
        const y = Math.floor((event.clientY - rect.top) / (this.pixelSize * this.zoom));

        if (x >= 0 && x < this.gridSize && y >= 0 && y < this.gridSize) {
            document.getElementById('coordinates').textContent = `X: ${x}, Y: ${y}`;
            this.showPixelInfo(x, y, event.clientX, event.clientY);
        }
    }

    showPixelInfo(x, y, mouseX, mouseY) {
        const index = y * this.gridSize + x;
        const owner = this.pixelOwners[index];
        const info = document.getElementById('pixelInfo');

        if (owner) {
            info.innerHTML = `
                <div>픽셀 소유자: ${owner.name}</div>
                <div>색상: ${this.pixels[index]}</div>
            `;
        } else {
            info.innerHTML = '<div>빈 픽셀</div>';
        }

        info.style.left = mouseX + 10 + 'px';
        info.style.top = mouseY - 40 + 'px';
        info.classList.add('visible');
    }

    hidePixelInfo() {
        document.getElementById('pixelInfo').classList.remove('visible');
    }

    placePixel(x, y) {
        // Check cooldown
        const now = Date.now();
        if (now - this.lastPlaceTime < this.cooldownTime) {
            const remaining = Math.ceil((this.cooldownTime - (now - this.lastPlaceTime)) / 1000);
            this.showNotification(`${remaining}초 후에 다시 시도하세요!`);
            return;
        }

        const index = y * this.gridSize + x;

        // Update pixel
        this.pixels[index] = this.selectedColor;
        this.pixelOwners[index] = {
            id: this.userId,
            name: this.userName,
            time: now
        };

        // Draw pixel
        this.ctx.fillStyle = this.selectedColor;
        this.ctx.fillRect(
            x * this.pixelSize,
            y * this.pixelSize,
            this.pixelSize,
            this.pixelSize
        );

        // Update stats
        this.pixelCount++;
        this.updateStats();

        // Set cooldown
        this.lastPlaceTime = now;
        this.startCooldown();

        // Broadcast to other users (simulated)
        this.broadcastPixel(x, y, this.selectedColor);

        // Save to localStorage
        this.saveCanvasData();
    }

    startCooldown() {
        const timer = document.getElementById('cooldownTimer');
        const bar = document.getElementById('cooldownBar');
        const timeDisplay = document.getElementById('cooldownTime');

        timer.classList.add('active');
        bar.style.width = '0%';

        const interval = setInterval(() => {
            const now = Date.now();
            const elapsed = now - this.lastPlaceTime;
            const remaining = Math.max(0, this.cooldownTime - elapsed);
            const progress = (elapsed / this.cooldownTime) * 100;

            bar.style.width = progress + '%';
            timeDisplay.textContent = Math.ceil(remaining / 1000) + '초';

            if (remaining <= 0) {
                clearInterval(interval);
                timer.classList.remove('active');
            }
        }, 100);
    }

    zoomIn() {
        if (this.zoom < 4) {
            this.zoom *= 1.5;
            this.updateCanvasSize();
            this.drawGrid();
        }
    }

    zoomOut() {
        if (this.zoom > 0.5) {
            this.zoom /= 1.5;
            this.updateCanvasSize();
            this.drawGrid();
        }
    }

    resetZoom() {
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.canvas.style.transform = 'translate(0, 0)';
        this.updateCanvasSize();
        this.drawGrid();
    }

    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    generateUserName() {
        const adjectives = ['빠른', '느린', '작은', '큰', '예쁜', '용감한', '지혜로운', '활발한'];
        const animals = ['토끼', '거북이', '고양이', '강아지', '사자', '호랑이', '독수리', '돌고래'];

        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const animal = animals[Math.floor(Math.random() * animals.length)];

        return `${adj} ${animal}`;
    }

    broadcastPixel(x, y, color) {
        // In real implementation, send via WebSocket/WebRTC
        console.log(`Broadcasting pixel: ${x}, ${y}, ${color}`);
    }

    receivePixel(x, y, color, userId) {
        const index = y * this.gridSize + x;
        this.pixels[index] = color;

        this.ctx.fillStyle = color;
        this.ctx.fillRect(
            x * this.pixelSize,
            y * this.pixelSize,
            this.pixelSize,
            this.pixelSize
        );
    }

    updateStats() {
        document.getElementById('pixelCount').textContent = this.pixelCount.toLocaleString();
        document.getElementById('userCount').textContent = this.users.size + 1;
    }

    saveCanvasData() {
        const data = {
            pixels: this.pixels,
            pixelOwners: this.pixelOwners,
            pixelCount: this.pixelCount
        };
        localStorage.setItem('wplace_canvas', JSON.stringify(data));
    }

    loadCanvasData() {
        const saved = localStorage.getItem('wplace_canvas');
        if (saved) {
            const data = JSON.parse(saved);
            this.pixels = data.pixels || this.pixels;
            this.pixelOwners = data.pixelOwners || this.pixelOwners;
            this.pixelCount = data.pixelCount || 0;

            this.drawGrid();
            this.updateStats();
        }
    }

    startSimulation() {
        // Simulate other users
        setInterval(() => {
            if (Math.random() < 0.3) {
                const x = Math.floor(Math.random() * this.gridSize);
                const y = Math.floor(Math.random() * this.gridSize);
                const color = this.colors[Math.floor(Math.random() * this.colors.length)];

                this.receivePixel(x, y, color, 'bot_' + Math.random());

                // Update user count randomly
                const userCount = 10 + Math.floor(Math.random() * 50);
                document.getElementById('userCount').textContent = userCount;
            }
        }, 2000);

        // Update user list
        this.updateUserList();
    }

    updateUserList() {
        const userItems = document.getElementById('userItems');

        // Generate fake users for demo
        const fakeUsers = [
            { name: '빠른 토끼', pixels: 42, color: '#FF6B6B' },
            { name: '용감한 사자', pixels: 38, color: '#4ECDC4' },
            { name: '지혜로운 올빼미', pixels: 31, color: '#45B7D1' },
            { name: this.userName + ' (나)', pixels: this.pixelCount, color: '#FFA07A' }
        ];

        userItems.innerHTML = fakeUsers.map(user => `
            <div class="user-item">
                <div class="user-avatar" style="background: ${user.color}">
                    ${user.name[0]}
                </div>
                <div class="user-name">${user.name}</div>
                <div class="user-pixels">${user.pixels} 픽셀</div>
            </div>
        `).join('');
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 18px;
            z-index: 3000;
            animation: shake 0.5s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => notification.remove(), 1500);
    }
}

// Global functions for zoom controls
function zoomIn() {
    window.wplace.zoomIn();
}

function zoomOut() {
    window.wplace.zoomOut();
}

function resetZoom() {
    window.wplace.resetZoom();
}

// Add shake animation
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translate(-50%, -50%) translateX(0); }
        25% { transform: translate(-50%, -50%) translateX(-10px); }
        75% { transform: translate(-50%, -50%) translateX(10px); }
    }
`;
document.head.appendChild(style);

// Initialize
window.wplace = new WPlace();
console.log('WPlace initialized!');