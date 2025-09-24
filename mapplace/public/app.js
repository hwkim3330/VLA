// MapChat Client - Real-time map messaging and pixel art

let map;
let socket;
let currentUser = null;
let currentMode = 'chat';
let selectedColor = '#FF0000';
let lastPixelTime = 0;
let pixelMarkers = [];
let messageMarkers = [];
let userLocation = null;

const colors = [
    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
    '#FFA500', '#800080', '#FFC0CB', '#A52A2A', '#808080', '#000000',
    '#FFFFFF', '#FFD700', '#32CD32', '#4169E1', '#FF69B4', '#8A2BE2'
];

// Initialize on load
window.addEventListener('load', () => {
    setupColorPalette();
});

function login() {
    const username = document.getElementById('usernameInput').value.trim();
    if (!username) {
        alert('닉네임을 입력하세요!');
        return;
    }

    currentUser = {
        name: username,
        id: 'user_' + Math.random().toString(36).substr(2, 9),
        color: colors[Math.floor(Math.random() * colors.length)]
    };

    document.getElementById('loginModal').style.display = 'none';
    initializeMap();
    connectSocket();
}

function initializeMap() {
    // Initialize map centered on Seoul
    map = L.map('map').setView([37.5665, 126.9780], 13);

    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add click handler for map
    map.on('click', handleMapClick);

    // Try to get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            userLocation = [position.coords.latitude, position.coords.longitude];
            map.setView(userLocation, 15);

            // Add user marker
            L.marker(userLocation, {
                icon: L.divIcon({
                    className: 'user-marker',
                    html: '<div style="background: #007AFF; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white;"></div>',
                    iconSize: [20, 20]
                })
            }).addTo(map).bindPopup('내 위치');
        });
    }
}

function connectSocket() {
    // Connect to server (in real deployment, use actual server URL)
    socket = io(window.location.origin);

    socket.on('connect', () => {
        console.log('Connected to server');

        // Register user
        socket.emit('register', {
            name: currentUser.name,
            color: currentUser.color
        });
    });

    socket.on('registered', (data) => {
        console.log('Registered:', data);

        // Request pixels in current view
        const bounds = map.getBounds();
        socket.emit('requestPixels', {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest()
        });
    });

    socket.on('pixels', (pixels) => {
        pixels.forEach(pixel => {
            addPixelToMap(pixel.lat, pixel.lng, pixel.color, pixel.userName);
        });
    });

    socket.on('pixelPlaced', (pixel) => {
        addPixelToMap(pixel.lat, pixel.lng, pixel.color, pixel.userName);
        updatePixelCount();
    });

    socket.on('placeResult', (result) => {
        if (!result.success) {
            showCooldown(result.cooldown);
        }
    });

    socket.on('chatMessage', (data) => {
        addChatMessage(data.user, data.message, data.time, data.location);
        updateMessageCount();
    });

    socket.on('userCount', (count) => {
        document.getElementById('userCount').textContent = count;
    });

    socket.on('stats', (stats) => {
        document.getElementById('pixelCount').textContent = stats.totalPixels;
        document.getElementById('userCount').textContent = stats.activeUsers;
    });
}

function handleMapClick(e) {
    if (currentMode === 'draw') {
        // Place pixel
        const now = Date.now();
        if (now - lastPixelTime < 5000) {
            showCooldown(5000 - (now - lastPixelTime));
            return;
        }

        socket.emit('placePixel', {
            lat: e.latlng.lat,
            lng: e.latlng.lng,
            color: selectedColor
        });

        lastPixelTime = now;
        showCooldown(5000);
    } else {
        // Place message marker on map
        const message = prompt('이 위치에 메시지를 남기세요:');
        if (message) {
            socket.emit('chatMessage', {
                message: message,
                location: {
                    lat: e.latlng.lat,
                    lng: e.latlng.lng
                }
            });

            addMessageMarker(e.latlng.lat, e.latlng.lng, currentUser.name, message);
        }
    }
}

function addPixelToMap(lat, lng, color, userName) {
    const pixel = L.circle([lat, lng], {
        radius: 10,
        fillColor: color,
        fillOpacity: 0.8,
        color: 'rgba(0,0,0,0.3)',
        weight: 1
    }).addTo(map);

    pixel.bindPopup(`<b>${userName}</b><br>색상: ${color}`);
    pixelMarkers.push(pixel);
}

function addMessageMarker(lat, lng, user, message) {
    const marker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'message-marker',
            html: '💬',
            iconSize: [30, 30]
        })
    }).addTo(map);

    marker.bindPopup(`<b>${user}</b><br>${message}`);
    messageMarkers.push(marker);
}

function setupColorPalette() {
    const palette = document.getElementById('colorPalette');

    colors.forEach((color, index) => {
        const btn = document.createElement('button');
        btn.className = 'color-btn';
        if (index === 0) btn.classList.add('active');
        btn.style.backgroundColor = color;
        btn.onclick = () => selectColor(color, btn);
        palette.appendChild(btn);
    });
}

function selectColor(color, btn) {
    selectedColor = color;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function setMode(mode) {
    currentMode = mode;

    // Update UI
    document.getElementById('chatMode').classList.toggle('active', mode === 'chat');
    document.getElementById('drawMode').classList.toggle('active', mode === 'draw');
    document.getElementById('colorPalette').style.display = mode === 'draw' ? 'flex' : 'none';

    // Change cursor
    document.getElementById('map').style.cursor = mode === 'draw' ? 'crosshair' : 'grab';
}

function toggleChat() {
    const panel = document.getElementById('chatPanel');
    const toggle = document.getElementById('chatToggle');

    panel.classList.toggle('minimized');
    toggle.textContent = panel.classList.contains('minimized') ? '＋' : '－';
}

function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message) return;

    // Get current map center as message location
    const center = map.getCenter();

    socket.emit('chatMessage', {
        message: message,
        location: {
            lat: center.lat,
            lng: center.lng
        }
    });

    input.value = '';
}

function handleChatKeypress(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

function addChatMessage(user, message, time, location) {
    const messagesDiv = document.getElementById('chatMessages');

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${user === currentUser?.name ? 'own' : ''}`;

    const timeStr = new Date(time).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit'
    });

    let locationStr = '';
    if (location) {
        locationStr = `<span class="message-location" onclick="flyToLocation(${location.lat}, ${location.lng})">📍 위치보기</span>`;
    }

    messageDiv.innerHTML = `
        <div class="message-header">
            <span>${user}</span>
            <span>${timeStr}</span>
        </div>
        ${locationStr}
        <div class="message-text">${message}</div>
    `;

    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    // Add marker on map if location exists
    if (location) {
        addMessageMarker(location.lat, location.lng, user, message);
    }
}

function flyToLocation(lat, lng) {
    map.flyTo([lat, lng], 17);
}

function showCooldown(ms) {
    const cooldownDiv = document.getElementById('cooldown');
    const timeSpan = document.getElementById('cooldownTime');

    cooldownDiv.classList.add('active');

    const interval = setInterval(() => {
        ms -= 100;
        timeSpan.textContent = Math.ceil(ms / 1000);

        if (ms <= 0) {
            clearInterval(interval);
            cooldownDiv.classList.remove('active');
        }
    }, 100);
}

function updatePixelCount() {
    const count = parseInt(document.getElementById('pixelCount').textContent);
    document.getElementById('pixelCount').textContent = count + 1;
}

function updateMessageCount() {
    const count = parseInt(document.getElementById('messageCount').textContent);
    document.getElementById('messageCount').textContent = count + 1;
}

// Update user list periodically
setInterval(() => {
    if (!socket) return;

    // Simulate user list (in real app, get from server)
    const userList = document.getElementById('userList');
    const fakeUsers = [
        { name: currentUser?.name || 'You', pixels: Math.floor(Math.random() * 100) },
        { name: '빠른토끼', pixels: 42 },
        { name: '용감한사자', pixels: 38 },
        { name: '지혜로운올빼미', pixels: 31 }
    ];

    userList.innerHTML = fakeUsers.map(user => `
        <div class="user-item">
            <div class="user-avatar" style="background: ${colors[Math.floor(Math.random() * colors.length)]}">
                ${user.name[0]}
            </div>
            <div class="user-name">${user.name}</div>
            <div class="user-pixels">${user.pixels}px</div>
        </div>
    `).join('');
}, 5000);

// Auto-login for testing
if (window.location.hostname === 'localhost') {
    document.getElementById('usernameInput').value = '테스트유저' + Math.floor(Math.random() * 100);
}