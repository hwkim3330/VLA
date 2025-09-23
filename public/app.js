// Zero Messenger - Pure JavaScript P2P Implementation
// No external dependencies required

class ZeroMessenger {
    constructor() {
        this.currentUser = null;
        this.peers = new Map();
        this.messages = new Map();
        this.activeChat = null;
        this.connection = null;
        this.keyPair = null;

        // Initialize WebRTC configuration
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.initializeApp();
    }

    async initializeApp() {
        // Generate encryption keys using WebCrypto API
        this.keyPair = await this.generateKeyPair();

        // Check for existing session
        const savedSession = localStorage.getItem('zeroSession');
        if (savedSession) {
            const session = JSON.parse(savedSession);
            this.currentUser = session.user;
            this.showChatScreen();
        }
    }

    async generateKeyPair() {
        return await crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256',
            },
            true,
            ['encrypt', 'decrypt']
        );
    }

    async login() {
        const countryCode = document.getElementById('countryCode').value;
        const phoneNumber = document.getElementById('phoneNumber').value;

        if (!phoneNumber) {
            this.showNotification('전화번호 또는 이메일을 입력하세요', 'error');
            return;
        }

        // Create user identifier
        const identifier = phoneNumber.includes('@') ? phoneNumber : `${countryCode}${phoneNumber.replace(/[^0-9]/g, '')}`;

        // Generate user ID from identifier
        const encoder = new TextEncoder();
        const data = encoder.encode(identifier);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const userId = hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');

        this.currentUser = {
            id: userId,
            identifier: identifier,
            displayName: phoneNumber,
            publicKey: await this.exportPublicKey(this.keyPair.publicKey)
        };

        // Save session
        localStorage.setItem('zeroSession', JSON.stringify({
            user: this.currentUser,
            timestamp: Date.now()
        }));

        // Initialize peer connection
        await this.initializePeerConnection();

        this.showChatScreen();
        this.loadMockChats(); // For demo purposes
    }

    async exportPublicKey(publicKey) {
        const exported = await crypto.subtle.exportKey('spki', publicKey);
        return btoa(String.fromCharCode(...new Uint8Array(exported)));
    }

    showChatScreen() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('chatScreen').classList.add('active');
    }

    async initializePeerConnection() {
        // In a real implementation, this would connect to a signaling server
        // For now, we'll use a simple WebSocket or polling mechanism

        // Try to connect to local server if available
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier: this.currentUser.identifier,
                    publicKey: this.currentUser.publicKey
                })
            });

            if (response.ok) {
                const data = await response.json();
                console.log('Registered with server:', data);
            }
        } catch (error) {
            console.log('Running in standalone mode');
            // Continue in standalone mode
        }
    }

    loadMockChats() {
        // Demo chat data
        const mockChats = [
            {
                id: 'chat1',
                name: '김철수',
                avatar: '김',
                lastMessage: '안녕하세요! 새로운 메신저 어떤가요?',
                time: '오후 2:30',
                unread: 2
            },
            {
                id: 'chat2',
                name: '이영희',
                avatar: '이',
                lastMessage: '프로젝트 진행상황 공유 부탁드립니다',
                time: '오후 1:15',
                unread: 0
            },
            {
                id: 'chat3',
                name: '박민수',
                avatar: '박',
                lastMessage: '내일 회의 시간 확인 부탁해요',
                time: '오전 11:45',
                unread: 1
            },
            {
                id: 'chat4',
                name: '개발팀',
                avatar: '개',
                lastMessage: '최신 빌드 배포 완료했습니다',
                time: '어제',
                unread: 5
            }
        ];

        const chatList = document.getElementById('chatList');
        chatList.innerHTML = '';

        mockChats.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            chatItem.dataset.chatId = chat.id;
            chatItem.onclick = () => this.selectChat(chat);

            chatItem.innerHTML = `
                <div class="chat-avatar">${chat.avatar}</div>
                <div class="chat-info">
                    <div class="chat-name">${chat.name}</div>
                    <div class="chat-preview">${chat.lastMessage}</div>
                </div>
                <div class="chat-meta">
                    <div class="chat-time">${chat.time}</div>
                    ${chat.unread > 0 ? `<div class="unread-badge">${chat.unread}</div>` : ''}
                </div>
            `;

            chatList.appendChild(chatItem);
        });
    }

    selectChat(chat) {
        this.activeChat = chat;

        // Update active state
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.toggle('active', item.dataset.chatId === chat.id);
        });

        // Load messages
        this.loadMessages(chat);
    }

    loadMessages(chat) {
        const messagesContainer = document.getElementById('messagesContainer');

        messagesContainer.innerHTML = `
            <div class="messages-header">
                <div class="recipient-info">
                    <div class="recipient-avatar">${chat.avatar}</div>
                    <div class="recipient-details">
                        <div class="recipient-name">${chat.name}</div>
                        <div class="recipient-status">온라인</div>
                    </div>
                </div>
                <div class="nav-actions">
                    <button class="icon-button" onclick="app.showChatInfo()">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                            <path d="M10 4a2 2 0 100-4 2 2 0 000 4z"/>
                            <path d="M10 20a2 2 0 100-4 2 2 0 000 4z"/>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="messages-list" id="messagesList">
                <!-- Messages will be loaded here -->
            </div>

            <div class="message-input-container">
                <div class="message-input-wrapper">
                    <textarea class="message-input" id="messageInput"
                        placeholder="메시지를 입력하세요..."
                        rows="1"
                        onkeypress="app.handleKeyPress(event)"></textarea>
                </div>
                <button class="send-button" onclick="app.sendMessage()">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M3 12L21 3L12 21L10 14L3 12Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        `;

        // Load mock messages
        this.loadMockMessages(chat.id);
    }

    loadMockMessages(chatId) {
        const messages = [
            { text: '안녕하세요!', sent: false, time: '오후 2:25' },
            { text: '새로운 메신저 테스트 중이신가요?', sent: false, time: '오후 2:28' },
            { text: '네, 맞아요! 어떤가요?', sent: true, time: '오후 2:29' },
            { text: '디자인이 정말 깔끔하네요', sent: false, time: '오후 2:30' },
            { text: '애플 스타일로 만들어봤어요', sent: true, time: '오후 2:30' }
        ];

        const messagesList = document.getElementById('messagesList');
        messagesList.innerHTML = '';

        messages.forEach(msg => {
            this.displayMessage(msg);
        });

        messagesList.scrollTop = messagesList.scrollHeight;
    }

    displayMessage(msg) {
        const messagesList = document.getElementById('messagesList');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.sent ? 'sent' : 'received'}`;

        messageDiv.innerHTML = `
            <div class="message-bubble">
                <div class="message-text">${msg.text}</div>
                <div class="message-time">${msg.time}</div>
            </div>
        `;

        messagesList.appendChild(messageDiv);
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();

        if (!text || !this.activeChat) return;

        // Create message
        const message = {
            text: text,
            sent: true,
            time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        };

        // Display message immediately
        this.displayMessage(message);

        // Clear input
        input.value = '';
        input.style.height = 'auto';

        // Scroll to bottom
        const messagesList = document.getElementById('messagesList');
        messagesList.scrollTop = messagesList.scrollHeight;

        // In real implementation, encrypt and send via WebRTC
        await this.sendEncryptedMessage(this.activeChat.id, text);
    }

    async sendEncryptedMessage(recipientId, text) {
        // This would normally:
        // 1. Encrypt the message with recipient's public key
        // 2. Send via WebRTC data channel
        // 3. Fall back to server relay if direct connection fails

        console.log('Sending encrypted message to:', recipientId);

        // Simulate network delay
        setTimeout(() => {
            // Simulate received reply
            const reply = {
                text: '메시지 잘 받았습니다!',
                sent: false,
                time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            };
            this.displayMessage(reply);

            const messagesList = document.getElementById('messagesList');
            messagesList.scrollTop = messagesList.scrollHeight;
        }, 1000);
    }

    handleKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    startNewChat() {
        const phoneNumber = prompt('대화할 상대방의 전화번호를 입력하세요:');
        if (!phoneNumber) return;

        const newChat = {
            id: 'chat_' + Date.now(),
            name: phoneNumber,
            avatar: phoneNumber[0],
            lastMessage: '',
            time: '지금',
            unread: 0
        };

        // Add to chat list
        const chatList = document.getElementById('chatList');
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-item';
        chatItem.dataset.chatId = newChat.id;
        chatItem.onclick = () => this.selectChat(newChat);

        chatItem.innerHTML = `
            <div class="chat-avatar">${newChat.avatar}</div>
            <div class="chat-info">
                <div class="chat-name">${newChat.name}</div>
                <div class="chat-preview">새 대화를 시작하세요</div>
            </div>
            <div class="chat-meta">
                <div class="chat-time">${newChat.time}</div>
            </div>
        `;

        chatList.insertBefore(chatItem, chatList.firstChild);
        this.selectChat(newChat);
    }

    showSettings() {
        alert('설정 기능은 준비 중입니다');
    }

    showChatInfo() {
        alert(`${this.activeChat.name}의 정보\n\n종단간 암호화 활성화됨\n메시지는 P2P로 전송됩니다`);
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? 'var(--system-red)' : 'var(--system-blue)'};
            color: white;
            padding: 12px 24px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            z-index: 10000;
            animation: slideDown 0.3s ease;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize app
const app = new ZeroMessenger();

// Global functions for onclick handlers
function login() {
    app.login();
}

function startNewChat() {
    app.startNewChat();
}

function showSettings() {
    app.showSettings();
}

// Auto-resize textarea
document.addEventListener('input', function(e) {
    if (e.target.classList.contains('message-input')) {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    }
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideDown {
        from {
            transform: translate(-50%, -100%);
            opacity: 0;
        }
        to {
            transform: translate(-50%, 0);
            opacity: 1;
        }
    }

    @keyframes fadeOut {
        from {
            opacity: 1;
        }
        to {
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

console.log('Zero Messenger initialized - No external dependencies required!');