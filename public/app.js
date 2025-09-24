// NEXM Super - Client-Side Application
const socket = io();

// User state
let currentUser = null;
let balance = 0;
let isNode = false;
let isMining = false;
let messages = [];
let transactions = [];
let activeTab = 'chat';
let selectedRecipient = 'all';

// Canvas state
const pixelCanvas = document.getElementById('pixelCanvas');
const ctx = pixelCanvas ? pixelCanvas.getContext('2d') : null;
const canvasSize = { width: 200, height: 200 };
const pixelSize = 3;
let selectedColor = '#FF0000';
let canDrawPixel = true;
let pixelData = new Map();

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    setupUI();
    setupCanvas();
    initializeApp();
});

function setupUI() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Color palette
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => {
            selectedColor = option.dataset.color;
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
        });
    });

    // Message input
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    if (messageInput && sendBtn) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendBtn.addEventListener('click', sendMessage);
    }

    // Token transfer
    const transferBtn = document.getElementById('transferBtn');
    if (transferBtn) {
        transferBtn.addEventListener('click', transferTokens);
    }

    // Node toggle
    const nodeToggle = document.getElementById('nodeToggle');
    if (nodeToggle) {
        nodeToggle.addEventListener('change', toggleNode);
    }

    // Leaderboard refresh
    const refreshLeaderboard = document.getElementById('refreshLeaderboard');
    if (refreshLeaderboard) {
        refreshLeaderboard.addEventListener('click', () => {
            socket.emit('getLeaderboard');
        });
    }
}

function setupCanvas() {
    if (!pixelCanvas) return;

    pixelCanvas.width = canvasSize.width * pixelSize;
    pixelCanvas.height = canvasSize.height * pixelSize;

    // Draw grid
    ctx.strokeStyle = '#e0e0e0';
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
    pixelCanvas.addEventListener('click', (e) => {
        if (!canDrawPixel || balance < 0.5) {
            showNotification('Insufficient tokens or cooldown active', 'error');
            return;
        }

        const rect = pixelCanvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / pixelSize);
        const y = Math.floor((e.clientY - rect.top) / pixelSize);

        if (x >= 0 && x < canvasSize.width && y >= 0 && y < canvasSize.height) {
            placePixel(x, y);
        }
    });
}

function initializeApp() {
    const storedUser = localStorage.getItem('nexmUser');

    if (storedUser) {
        const userData = JSON.parse(storedUser);
        registerUser(userData);
    } else {
        showRegistrationModal();
    }
}

function showRegistrationModal() {
    const modal = document.createElement('div');
    modal.className = 'registration-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Join NEXM Network</h2>
            <input type="text" id="usernameInput" placeholder="Choose username" />
            <input type="tel" id="phoneInput" placeholder="Phone (optional)" />
            <label class="node-option">
                <input type="checkbox" id="isNodeInput" />
                <span>Run as node (earn rewards)</span>
            </label>
            <button id="joinBtn">Join Network</button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('joinBtn').addEventListener('click', () => {
        const username = document.getElementById('usernameInput').value.trim();
        if (!username) {
            alert('Please enter a username');
            return;
        }

        const userData = {
            username: username,
            phone: document.getElementById('phoneInput').value || null,
            isNode: document.getElementById('isNodeInput').checked,
            publicKey: generatePublicKey()
        };

        localStorage.setItem('nexmUser', JSON.stringify(userData));
        modal.remove();
        registerUser(userData);
    });
}

function registerUser(userData) {
    currentUser = userData;
    socket.emit('register', userData);
}

function generatePublicKey() {
    // Simple key generation for demo
    return btoa(Math.random().toString(36).substring(2));
}

// Socket event handlers
socket.on('registered', (data) => {
    balance = data.balance;
    updateBalanceDisplay();

    if (data.canvasSize) {
        canvasSize.width = data.canvasSize.width;
        canvasSize.height = data.canvasSize.height;
        setupCanvas();
    }

    socket.emit('requestPixels', {});
    socket.emit('getLeaderboard');
    socket.emit('getTransactions');

    if (currentUser.isNode) {
        startMining();
    }
});

socket.on('stats', (stats) => {
    updateStats(stats);
});

socket.on('userUpdate', (data) => {
    updateUserList(data.users);
    document.getElementById('userCount').textContent = data.count;
});

socket.on('newMessage', (message) => {
    messages.push(message);
    displayMessage(message);
});

socket.on('balanceUpdate', (newBalance) => {
    balance = newBalance;
    updateBalanceDisplay();
});

socket.on('pixels', (pixels) => {
    pixels.forEach(pixel => {
        drawPixel(pixel.x, pixel.y, pixel.color);
        pixelData.set(`${pixel.x},${pixel.y}`, pixel.color);
    });
});

socket.on('pixelPlaced', (data) => {
    drawPixel(data.x, data.y, data.color);
    pixelData.set(`${data.x},${data.y}`, data.color);

    if (data.user === currentUser.username) {
        canDrawPixel = false;
        setTimeout(() => {
            canDrawPixel = true;
            showNotification('You can draw again!', 'success');
        }, 5000);
    }
});

socket.on('transferSuccess', (transaction) => {
    showNotification(`Transfer successful: ${transaction.amount} NEXM sent`, 'success');
    socket.emit('getTransactions');
});

socket.on('transferError', (error) => {
    showNotification(`Transfer failed: ${error.error}`, 'error');
});

socket.on('tokenReceived', (data) => {
    showNotification(`Received ${data.amount} NEXM from ${data.from}`, 'success');
    socket.emit('getTransactions');
});

socket.on('miningReward', (data) => {
    showNotification(`Mining reward: +${data.amount} NEXM`, 'success');
    balance = data.balance;
    updateBalanceDisplay();
});

socket.on('transactions', (txList) => {
    transactions = txList;
    displayTransactions();
});

socket.on('leaderboard', (leaders) => {
    displayLeaderboard(leaders);
});

socket.on('pixelError', (error) => {
    showNotification(error.error, 'error');
});

// UI functions
function switchTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tab}Tab`);
    });
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();

    if (!content) return;

    socket.emit('sendMessage', {
        to: selectedRecipient,
        content: content,
        encrypted: false
    });

    input.value = '';
}

function displayMessage(message) {
    const messagesContainer = document.getElementById('messages');
    if (!messagesContainer) return;

    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.from === currentUser.username ? 'sent' : 'received'}`;
    messageEl.innerHTML = `
        <div class="message-header">
            <span class="sender">${message.from}</span>
            <span class="time">${new Date(message.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="message-content">${message.content}</div>
    `;

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function placePixel(x, y) {
    socket.emit('placePixel', {
        x: x,
        y: y,
        color: selectedColor
    });
}

function drawPixel(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
}

function transferTokens() {
    const recipient = document.getElementById('transferRecipient').value.trim();
    const amount = parseFloat(document.getElementById('transferAmount').value);

    if (!recipient || !amount || amount <= 0) {
        showNotification('Invalid transfer details', 'error');
        return;
    }

    socket.emit('transfer', {
        to: recipient,
        amount: amount
    });
}

function toggleNode(e) {
    isNode = e.target.checked;

    if (isNode && !isMining) {
        startMining();
    } else if (!isNode && isMining) {
        stopMining();
    }
}

function startMining() {
    if (isMining) return;

    isMining = true;
    socket.emit('startMining');
    document.getElementById('miningStatus').textContent = 'Mining...';
    showNotification('Started mining NEXM tokens', 'success');
}

function stopMining() {
    isMining = false;
    document.getElementById('miningStatus').textContent = 'Inactive';
}

function updateBalanceDisplay() {
    const balanceElements = document.querySelectorAll('.balance-display');
    balanceElements.forEach(el => {
        el.textContent = `${balance.toFixed(2)} NEXM`;
    });
}

function updateStats(stats) {
    document.getElementById('totalUsers').textContent = stats.users;
    document.getElementById('totalPixels').textContent = stats.totalPixels;
    document.getElementById('totalTransactions').textContent = stats.totalTransactions;
    document.getElementById('activeNodes').textContent = stats.activeNodes;
}

function updateUserList(users) {
    const userList = document.getElementById('userList');
    if (!userList) return;

    userList.innerHTML = users.map(user => `
        <div class="user-item ${user.isNode ? 'node' : ''}">
            <span>${user.username} ${user.isNode ? '⛏️' : ''}</span>
            <span>${user.balance.toFixed(2)} NEXM</span>
        </div>
    `).join('');
}

function displayTransactions() {
    const txContainer = document.getElementById('transactionHistory');
    if (!txContainer) return;

    txContainer.innerHTML = transactions.slice(-20).reverse().map(tx => `
        <div class="transaction">
            <div class="tx-type">${tx.type}</div>
            <div class="tx-details">
                ${tx.type === 'transfer' ? `${tx.from} → ${tx.to}` : tx.reason || ''}
            </div>
            <div class="tx-amount">${tx.type === 'deduction' ? '-' : '+'}${tx.amount} NEXM</div>
            <div class="tx-time">${new Date(tx.timestamp).toLocaleString()}</div>
        </div>
    `).join('');
}

function displayLeaderboard(leaders) {
    const leaderboard = document.getElementById('leaderboard');
    if (!leaderboard) return;

    leaderboard.innerHTML = leaders.map((user, index) => `
        <div class="leader-item">
            <span class="rank">#${index + 1}</span>
            <span class="username">${user.username} ${user.isNode ? '⛏️' : ''}</span>
            <span class="balance">${user.balance.toFixed(2)} NEXM</span>
        </div>
    `).join('');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Export canvas as image
function exportCanvas() {
    const link = document.createElement('a');
    link.download = `nexm-canvas-${Date.now()}.png`;
    link.href = pixelCanvas.toDataURL();
    link.click();
}

// Add export button handler
document.getElementById('exportCanvas')?.addEventListener('click', exportCanvas);

// Handle window resize
window.addEventListener('resize', () => {
    if (ctx) setupCanvas();
});

// Periodic updates
setInterval(() => {
    if (socket.connected) {
        socket.emit('getLeaderboard');
    }
}, 30000);

console.log('🚀 NEXM Super Client initialized');