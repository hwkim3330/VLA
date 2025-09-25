// NEXM Super - Client Application
const socket = io();

// State management
let currentUser = null;
let balance = 0;
let isAdmin = false;
let isNode = false;
let pixelCanvas = null;
let ctx = null;
const pixelSize = 3;
const canvasSize = { width: 200, height: 200 };
let canDrawPixel = true;
let selectedColor = '#FF0000';

// Login function
function login() {
    const username = document.getElementById('usernameInput').value.trim();
    const phone = document.getElementById('phoneInput').value;
    const adminPassword = document.getElementById('adminPasswordInput').value;
    const isNodeCheckbox = document.getElementById('isNode').checked;

    if (!username) {
        alert('사용자 이름을 입력해주세요');
        return;
    }

    const userData = {
        username: username,
        phone: phone || null,
        isNode: isNodeCheckbox,
        adminPassword: adminPassword || null,
        publicKey: generatePublicKey()
    };

    currentUser = userData;
    isNode = isNodeCheckbox;

    // Send registration to server
    socket.emit('register', userData);

    // Hide login screen and show app
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Initialize canvas
    initCanvas();
}

function generatePublicKey() {
    return btoa(Math.random().toString(36).substring(2));
}

// Initialize canvas
function initCanvas() {
    pixelCanvas = document.getElementById('pixelCanvas');
    if (!pixelCanvas) return;

    ctx = pixelCanvas.getContext('2d');
    pixelCanvas.width = canvasSize.width * pixelSize;
    pixelCanvas.height = canvasSize.height * pixelSize;

    // Draw grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= canvasSize.width; i++) {
        ctx.beginPath();
        ctx.moveTo(i * pixelSize, 0);
        ctx.lineTo(i * pixelSize, pixelCanvas.height);
        ctx.stroke();
    }
    for (let i = 0; i <= canvasSize.height; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * pixelSize);
        ctx.lineTo(pixelCanvas.width, i * pixelSize);
        ctx.stroke();
    }

    // Canvas click handler
    pixelCanvas.addEventListener('click', handleCanvasClick);
}

function handleCanvasClick(e) {
    if (!isAdmin && (!canDrawPixel || balance < 0.5)) {
        showNotification('토큰이 부족하거나 쿨다운 중입니다', 'error');
        return;
    }

    const rect = pixelCanvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / pixelSize);
    const y = Math.floor((e.clientY - rect.top) / pixelSize);

    if (x >= 0 && x < canvasSize.width && y >= 0 && y < canvasSize.height) {
        socket.emit('placePixel', {
            x: x,
            y: y,
            color: selectedColor
        });
    }
}

// Tab switching
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });

    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`${tab}Tab`).style.display = 'block';
}

// Socket event handlers
socket.on('registered', (data) => {
    balance = data.balance;
    isAdmin = data.isAdmin || false;

    // Update UI
    document.getElementById('username').textContent = currentUser.username;
    updateBalance();

    // Show admin badge if admin
    if (isAdmin) {
        document.getElementById('username').innerHTML = `${currentUser.username} <span style="color: gold;">👑</span>`;
        showNotification('관리자 권한 활성화 - 무제한 그리기!', 'success');
    }

    // Request initial data
    socket.emit('requestPixels', {});

    // Start mining if node
    if (isNode) {
        socket.emit('startMining');
        document.getElementById('miningStatus').textContent = '⛏️ 채굴 중...';
    }
});

socket.on('balanceUpdate', (newBalance) => {
    balance = newBalance;
    updateBalance();
});

socket.on('pixels', (pixels) => {
    pixels.forEach(pixel => {
        drawPixel(pixel.x, pixel.y, pixel.color);
    });
});

socket.on('pixelPlaced', (data) => {
    drawPixel(data.x, data.y, data.color);

    // Apply cooldown only for non-admin users
    if (data.user === currentUser.username && !isAdmin) {
        canDrawPixel = false;
        setTimeout(() => {
            canDrawPixel = true;
            showNotification('다시 그릴 수 있습니다!', 'success');
        }, 5000);
    }
});

socket.on('pixelError', (error) => {
    showNotification(error.error, 'error');
});

socket.on('stats', (stats) => {
    document.getElementById('onlineUsers').textContent = stats.users;
    document.getElementById('totalPixels').textContent = stats.totalPixels;
    document.getElementById('totalTransactions').textContent = stats.totalTransactions;
    document.getElementById('activeNodes').textContent = stats.activeNodes;
});

socket.on('userUpdate', (data) => {
    const userList = document.getElementById('userList');
    if (userList) {
        userList.innerHTML = '';
        data.users.forEach(user => {
            const userDiv = document.createElement('div');
            userDiv.className = 'user-item';
            userDiv.innerHTML = `
                <span>${user.username} ${user.isNode ? '⛏️' : ''}</span>
                <span>${user.balance.toFixed(2)} NEXM</span>
            `;
            userList.appendChild(userDiv);
        });
    }
});

socket.on('newMessage', (message) => {
    displayMessage(message);
});

socket.on('miningReward', (data) => {
    showNotification(`채굴 보상: +${data.amount} NEXM`, 'success');
    balance = data.balance;
    updateBalance();
    document.getElementById('miningRewards').textContent = `${data.amount} NEXM`;
});

// Helper functions
function drawPixel(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
}

function updateBalance() {
    if (isAdmin) {
        document.getElementById('balance').textContent = '∞';
        document.getElementById('walletBalance').textContent = '∞ NEXM';
    } else {
        document.getElementById('balance').textContent = balance.toFixed(2);
        document.getElementById('walletBalance').textContent = `${balance.toFixed(2)} NEXM`;
    }
}

function selectColor(color) {
    selectedColor = color;
    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('selected');
    });
    event.target.classList.add('selected');
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message) return;

    socket.emit('sendMessage', {
        to: 'all',
        content: message,
        encrypted: false
    });

    input.value = '';
}

function displayMessage(message) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.from === currentUser.username ? 'sent' : 'received'}`;
    messageDiv.innerHTML = `
        <div class="message-user">${message.from}</div>
        <div class="message-text">${message.content}</div>
        <div class="message-time">${new Date(message.timestamp).toLocaleTimeString()}</div>
    `;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function toggleMining() {
    const btn = document.getElementById('miningBtn');
    const status = document.getElementById('miningStatus');

    if (btn.textContent === '채굴 시작') {
        socket.emit('startMining');
        btn.textContent = '채굴 중지';
        status.textContent = '⛏️ 채굴 중...';
    } else {
        btn.textContent = '채굴 시작';
        status.textContent = '⏸️ 대기 중';
    }
}

function showTransferModal() {
    document.getElementById('transferModal').style.display = 'flex';
}

function closeTransferModal() {
    document.getElementById('transferModal').style.display = 'none';
}

function confirmTransfer() {
    const to = document.getElementById('transferTo').value.trim();
    const amount = parseFloat(document.getElementById('transferAmount').value);

    if (!to || !amount || amount <= 0) {
        showNotification('올바른 정보를 입력하세요', 'error');
        return;
    }

    socket.emit('transfer', {
        to: to,
        amount: amount
    });

    closeTransferModal();
}

function requestTokens() {
    showNotification('무료 토큰은 준비 중입니다', 'info');
}

function showTransactions() {
    socket.emit('getTransactions');
}

function exportCanvas() {
    const link = document.createElement('a');
    link.download = `nexm-canvas-${Date.now()}.png`;
    link.href = pixelCanvas.toDataURL();
    link.click();
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.background = type === 'error' ? 'var(--danger)' :
                                   type === 'success' ? 'var(--success)' : 'var(--primary)';
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Socket event for transfer responses
socket.on('transferSuccess', (transaction) => {
    showNotification(`전송 성공: ${transaction.amount} NEXM`, 'success');
    socket.emit('getTransactions');
});

socket.on('transferError', (error) => {
    showNotification(`전송 실패: ${error.error}`, 'error');
});

socket.on('tokenReceived', (data) => {
    showNotification(`${data.from}님으로부터 ${data.amount} NEXM 받음`, 'success');
});

socket.on('transactions', (transactions) => {
    const transactionsDiv = document.getElementById('transactions');
    transactionsDiv.innerHTML = '';

    transactions.slice(-10).reverse().forEach(tx => {
        const txDiv = document.createElement('div');
        txDiv.className = 'transaction-item';
        txDiv.innerHTML = `
            <div>${tx.type === 'transfer' ? '💸' : tx.type === 'reward' ? '🎁' : '📊'}</div>
            <div>${tx.type === 'transfer' ? `${tx.from} → ${tx.to}` : tx.reason}</div>
            <div>${tx.amount} NEXM</div>
        `;
        transactionsDiv.appendChild(txDiv);
    });
});

socket.on('leaderboard', (leaders) => {
    const leaderboardDiv = document.getElementById('leaderboardList');
    leaderboardDiv.innerHTML = '';

    leaders.forEach((user, index) => {
        const item = document.createElement('div');
        item.className = 'leaderboard-item';
        item.innerHTML = `
            <span class="rank">${index + 1}</span>
            <span>${user.username} ${user.isNode ? '⛏️' : ''}</span>
            <span>${user.balance.toFixed(2)} NEXM</span>
        `;
        leaderboardDiv.appendChild(item);
    });
});

// Message input handler
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // Request leaderboard periodically
    setInterval(() => {
        if (socket.connected) {
            socket.emit('getLeaderboard');
        }
    }, 30000);
});

console.log('NEXM Super initialized');