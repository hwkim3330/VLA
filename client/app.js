// P2P Messenger Client Application

let socket = null;
let currentUser = null;
let currentChat = null;
let currentRoom = null;
let nodeId = null;
let userKeyPair = null;
let sessionKeys = new Map();
let chats = new Map();
let messages = new Map();

// Crypto utilities for E2E encryption
const CryptoUtils = {
    async generateKeyPair() {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true,
            ["encrypt", "decrypt"]
        );
        return keyPair;
    },

    async generateAESKey() {
        return await crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true,
            ["encrypt", "decrypt"]
        );
    },

    async exportPublicKey(publicKey) {
        const exported = await crypto.subtle.exportKey("spki", publicKey);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    },

    async importPublicKey(publicKeyString) {
        const binaryString = atob(publicKeyString);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return await crypto.subtle.importKey(
            "spki",
            bytes.buffer,
            {
                name: "RSA-OAEP",
                hash: "SHA-256",
            },
            true,
            ["encrypt"]
        );
    },

    async encryptMessage(message, recipientPublicKey) {
        // Generate AES session key
        const sessionKey = await this.generateAESKey();

        // Encrypt message with AES
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encryptedMessage = await crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            sessionKey,
            encoder.encode(message)
        );

        // Encrypt AES key with recipient's RSA public key
        const exportedSessionKey = await crypto.subtle.exportKey("raw", sessionKey);
        const encryptedSessionKey = await crypto.subtle.encrypt(
            {
                name: "RSA-OAEP"
            },
            recipientPublicKey,
            exportedSessionKey
        );

        return {
            encryptedMessage: btoa(String.fromCharCode(...new Uint8Array(encryptedMessage))),
            encryptedSessionKey: btoa(String.fromCharCode(...new Uint8Array(encryptedSessionKey))),
            iv: btoa(String.fromCharCode(...iv))
        };
    },

    async decryptMessage(encryptedData, privateKey) {
        try {
            // Decrypt session key with private RSA key
            const encryptedSessionKey = Uint8Array.from(atob(encryptedData.encryptedSessionKey), c => c.charCodeAt(0));
            const sessionKeyBuffer = await crypto.subtle.decrypt(
                {
                    name: "RSA-OAEP"
                },
                privateKey,
                encryptedSessionKey
            );

            // Import session key
            const sessionKey = await crypto.subtle.importKey(
                "raw",
                sessionKeyBuffer,
                {
                    name: "AES-GCM",
                    length: 256
                },
                true,
                ["decrypt"]
            );

            // Decrypt message with session key
            const encryptedMessage = Uint8Array.from(atob(encryptedData.encryptedMessage), c => c.charCodeAt(0));
            const iv = Uint8Array.from(atob(encryptedData.iv), c => c.charCodeAt(0));

            const decryptedMessage = await crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                sessionKey,
                encryptedMessage
            );

            const decoder = new TextDecoder();
            return decoder.decode(decryptedMessage);
        } catch (error) {
            console.error('Decryption failed:', error);
            return '[암호 해독 실패]';
        }
    }
};

// Connection management
async function connect() {
    const username = document.getElementById('username').value.trim();
    const nodeUrl = document.getElementById('nodeUrl').value.trim() || 'http://localhost:8080';

    if (!username) {
        alert('사용자 이름을 입력하세요');
        return;
    }

    currentUser = username;

    // Generate key pair for E2E encryption
    userKeyPair = await CryptoUtils.generateKeyPair();
    const publicKey = await CryptoUtils.exportPublicKey(userKeyPair.publicKey);

    try {
        // Connect to node
        socket = io(nodeUrl, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });

        socket.on('connect', () => {
            console.log('Connected to node');

            // Register with node
            socket.emit('register', {
                userId: currentUser,
                publicKey: publicKey
            });
        });

        socket.on('registered', (data) => {
            nodeId = data.nodeId;
            console.log(`Registered with node: ${nodeId}`);

            // Switch to chat screen
            document.getElementById('loginScreen').classList.remove('active');
            document.getElementById('chatScreen').classList.add('active');

            // Update UI
            document.getElementById('currentUser').textContent = currentUser;
            document.getElementById('userAvatar').textContent = currentUser[0].toUpperCase();
            document.getElementById('connectionStatus').textContent = `연결됨 - 노드 ${nodeId.substring(0, 8)}...`;
        });

        socket.on('nodeStats', (stats) => {
            updateNodeStats(stats);
        });

        socket.on('newMessage', async (data) => {
            await handleIncomingMessage(data);
        });

        socket.on('roomMessage', async (data) => {
            await handleRoomMessage(data);
        });

        socket.on('messageSent', (data) => {
            if (data.success) {
                console.log(`Message sent. Reward earned: ${data.reward}`);
            }
        });

        socket.on('error', (error) => {
            console.error('Socket error:', error);
            alert(`에러: ${error.message}`);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from node');
            document.getElementById('connectionStatus').textContent = '연결 끊김';
        });

    } catch (error) {
        console.error('Connection error:', error);
        alert('노드 연결 실패. URL을 확인하세요.');
    }
}

function disconnect() {
    if (socket) {
        socket.disconnect();
        socket = null;
    }

    // Switch back to login screen
    document.getElementById('chatScreen').classList.remove('active');
    document.getElementById('loginScreen').classList.add('active');

    // Clear data
    currentUser = null;
    currentChat = null;
    currentRoom = null;
    chats.clear();
    messages.clear();
    sessionKeys.clear();
}

// Chat management
function startNewChat() {
    const recipientId = prompt('채팅할 사용자 ID를 입력하세요:');
    if (!recipientId) return;

    // Create new chat
    const chatId = `${currentUser}-${recipientId}`;
    if (!chats.has(chatId)) {
        chats.set(chatId, {
            id: chatId,
            recipientId: recipientId,
            type: 'direct',
            lastMessage: null,
            unread: 0
        });

        // Add to chat list UI
        addChatToList(chatId, recipientId);
    }

    // Select the chat
    selectChat(chatId);
}

function addChatToList(chatId, displayName) {
    const chatList = document.getElementById('chatList');
    const chatItem = document.createElement('div');
    chatItem.className = 'chat-item';
    chatItem.dataset.chatId = chatId;
    chatItem.onclick = () => selectChat(chatId);

    chatItem.innerHTML = `
        <div class="user-avatar" style="width:35px;height:35px;margin-right:12px;font-size:14px">
            ${displayName[0].toUpperCase()}
        </div>
        <div style="flex:1">
            <div style="font-weight:500">${displayName}</div>
            <div style="font-size:12px;color:var(--text-secondary)">클릭하여 채팅 시작</div>
        </div>
    `;

    chatList.appendChild(chatItem);
}

function selectChat(chatId) {
    currentChat = chatId;
    currentRoom = null;

    // Update UI
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.toggle('active', item.dataset.chatId === chatId);
    });
    document.querySelectorAll('.room-item').forEach(item => {
        item.classList.remove('active');
    });

    // Show active chat
    document.querySelector('.chat-select-prompt').style.display = 'none';
    document.getElementById('activeChat').style.display = 'flex';

    // Load messages
    loadMessages(chatId);

    // Focus input
    document.getElementById('messageInput').focus();
}

function loadMessages(chatId) {
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';

    const chatMessageList = messages.get(chatId) || [];
    chatMessageList.forEach(msg => {
        displayMessage(msg);
    });
}

async function sendMessage() {
    if (!currentChat && !currentRoom) {
        alert('먼저 채팅을 선택하세요');
        return;
    }

    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput.value.trim();

    if (!messageText) return;

    if (currentChat) {
        // Direct message - encrypt and send
        const chat = chats.get(currentChat);
        const recipientId = chat.recipientId;

        // For demo purposes, we'll use a simple encryption
        // In production, you'd exchange public keys properly
        const encryptedContent = btoa(messageText); // Simple base64 for demo
        const signature = btoa(`sig-${currentUser}-${Date.now()}`);

        socket.emit('sendMessage', {
            recipientId: recipientId,
            encryptedContent: encryptedContent,
            signature: signature
        });

        // Display sent message
        const message = {
            id: Date.now(),
            senderId: currentUser,
            content: messageText,
            timestamp: Date.now(),
            sent: true
        };

        displayMessage(message);
        saveMessage(currentChat, message);

    } else if (currentRoom) {
        // Room message - encrypt for group
        const encryptedContent = btoa(messageText);

        socket.emit('sendRoomMessage', {
            roomId: currentRoom,
            encryptedContent: encryptedContent
        });

        // Display sent message
        const message = {
            id: Date.now(),
            senderId: currentUser,
            content: messageText,
            timestamp: Date.now(),
            sent: true,
            room: currentRoom
        };

        displayMessage(message);
        saveMessage(currentRoom, message);
    }

    // Clear input
    messageInput.value = '';
}

async function handleIncomingMessage(data) {
    // Decrypt message
    const decryptedContent = atob(data.encryptedContent); // Simple base64 for demo

    const message = {
        id: data.timestamp,
        senderId: data.senderId,
        content: decryptedContent,
        timestamp: data.timestamp,
        sent: false
    };

    // Find or create chat
    const chatId = `${data.senderId}-${currentUser}`;
    if (!chats.has(chatId)) {
        chats.set(chatId, {
            id: chatId,
            recipientId: data.senderId,
            type: 'direct',
            lastMessage: decryptedContent,
            unread: 0
        });
        addChatToList(chatId, data.senderId);
    }

    // Save message
    saveMessage(chatId, message);

    // Display if current chat
    if (currentChat === chatId) {
        displayMessage(message);
    } else {
        // Show notification
        showNotification(data.senderId, decryptedContent);
    }
}

async function handleRoomMessage(data) {
    if (data.senderId === currentUser) return; // Skip own messages

    const decryptedContent = atob(data.encryptedContent);

    const message = {
        id: data.timestamp,
        senderId: data.senderId,
        content: decryptedContent,
        timestamp: data.timestamp,
        sent: false,
        room: data.roomId
    };

    saveMessage(data.roomId, message);

    if (currentRoom === data.roomId) {
        displayMessage(message);
    }
}

function displayMessage(message) {
    const chatMessages = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.sent ? 'sent' : 'received'}`;

    const time = new Date(message.timestamp).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit'
    });

    messageDiv.innerHTML = `
        <div class="message-bubble">
            ${!message.sent ? `<div style="font-size:11px;margin-bottom:4px;opacity:0.7">${message.senderId}</div>` : ''}
            <div class="message-content">${message.content}</div>
            <div class="message-time">${time}</div>
        </div>
    `;

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function saveMessage(chatId, message) {
    if (!messages.has(chatId)) {
        messages.set(chatId, []);
    }
    messages.get(chatId).push(message);
}

function showNotification(sender, content) {
    // Simple notification - in production use Notification API
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
        color: white;
        padding: 15px 20px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
        max-width: 300px;
    `;

    notification.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px">${sender}</div>
        <div style="font-size:14px">${content.substring(0, 50)}${content.length > 50 ? '...' : ''}</div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Room management
function createRoom() {
    const roomName = prompt('그룹 이름을 입력하세요:');
    if (!roomName) return;

    const roomId = `room-${Date.now()}`;
    socket.emit('joinRoom', roomId);

    // Add to room list UI
    const roomList = document.getElementById('roomList');
    const roomItem = document.createElement('div');
    roomItem.className = 'room-item';
    roomItem.dataset.roomId = roomId;
    roomItem.onclick = () => selectRoom(roomId);

    roomItem.innerHTML = `
        <div style="width:35px;height:35px;margin-right:12px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px">
            #
        </div>
        <div style="flex:1">
            <div style="font-weight:500">${roomName}</div>
            <div style="font-size:12px;color:var(--text-secondary)">그룹 채팅</div>
        </div>
    `;

    roomList.appendChild(roomItem);
    selectRoom(roomId);
}

function selectRoom(roomId) {
    currentRoom = roomId;
    currentChat = null;

    // Update UI
    document.querySelectorAll('.room-item').forEach(item => {
        item.classList.toggle('active', item.dataset.roomId === roomId);
    });
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });

    // Show active chat
    document.querySelector('.chat-select-prompt').style.display = 'none';
    document.getElementById('activeChat').style.display = 'flex';

    // Load messages
    loadMessages(roomId);

    // Focus input
    document.getElementById('messageInput').focus();
}

// Node stats
function showNodeStats() {
    document.getElementById('nodeStatsModal').classList.add('active');
}

function closeNodeStats() {
    document.getElementById('nodeStatsModal').classList.remove('active');
}

function updateNodeStats(stats) {
    document.getElementById('statNodeId').textContent = stats.nodeId.substring(0, 16) + '...';
    document.getElementById('statReputation').textContent = stats.reputation;
    document.getElementById('statMessageCount').textContent = stats.messageCount;
    document.getElementById('statRewards').textContent = stats.rewards + ' TOK';
    document.getElementById('statClients').textContent = stats.connectedClients;
    document.getElementById('statPeers').textContent = stats.connectedPeers;
}

// Event listeners
document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case 'n':
                e.preventDefault();
                startNewChat();
                break;
            case 'g':
                e.preventDefault();
                createRoom();
                break;
            case 'i':
                e.preventDefault();
                showNodeStats();
                break;
        }
    }
});

// Initialize
console.log('P2P Messenger initialized');
console.log('Press Ctrl+N for new chat, Ctrl+G for new group, Ctrl+I for node stats');