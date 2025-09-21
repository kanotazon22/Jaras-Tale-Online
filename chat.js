class ChatSystem {
    constructor(gameClient) {
        this.gameClient = gameClient;
        this.messages = [];
        this.isOpen = false; // Chat box bắt đầu đóng
        this.unreadCount = 0; // Số tin nhắn chưa đọc
        this.createUI();
    }

    createUI() {
        const chatHTML = `
            <div id="chatContainer" class="chat-container">  
    <div id="chatBox" class="chat-box ${this.isOpen ? 'open' : 'closed'}">  
        <div class="chat-header">  
            <span class="chat-title">  
                Chat  
                <span id="unreadBadge" class="unread-badge" style="display: none;">0</span>  
            </span>  
            <button id="toggleChatBtn" class="toggle-chat-btn">${this.isOpen ? '−' : '+'}</button>  
        </div>  
        <div id="chatMessages" class="chat-messages-box"></div>  
    </div>  
    <div id="chatInput" class="chat-input-box">  
        <input type="text" id="msgInput" placeholder="Chat..." maxlength="100">  
        <button id="sendBtn">Send</button>  
    </div>  
</div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', chatHTML);
        
        this.messageBox = document.getElementById('chatMessages');
        this.chatBox = document.getElementById('chatBox');
        this.input = document.getElementById('msgInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.toggleBtn = document.getElementById('toggleChatBtn');
        this.unreadBadge = document.getElementById('unreadBadge');
        
        this.sendBtn.onclick = () => this.send();
        this.input.onkeypress = (e) => e.key === 'Enter' && this.send();
        this.toggleBtn.onclick = () => this.toggleChat();
    }

    toggleChat() {  
    this.isOpen = !this.isOpen;  
    this.chatBox.className = `chat-box ${this.isOpen ? 'open' : 'closed'}`;  
    this.toggleBtn.textContent = this.isOpen ? '−' : '+';  

    if (this.isOpen) {  
        this.unreadCount = 0;  
        this.updateUnreadBadge();  
        setTimeout(() => {  
            this.messageBox.scrollTop = this.messageBox.scrollHeight;  
        }, 200);  
    }  
}

    send() {
        const text = this.input.value.trim();
        if (!text || !this.gameClient.connected) return;
        
        this.gameClient.sendMessage({type: 'chat', text});
        this.input.value = '';
    }

    addMessage(playerId, text) {
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = `<span class="chat-name">${playerId}:</span> ${text}`;
        
        this.messageBox.appendChild(div);
        this.messages.push(div);
        
        // Auto scroll to bottom
        this.messageBox.scrollTop = this.messageBox.scrollHeight;
        
        // Nếu chat đang đóng, tăng số tin nhắn chưa đọc
        if (!this.isOpen) {
            this.unreadCount++;
            this.updateUnreadBadge();
        }
        
        // Keep only last 100 messages để tránh lag
        if (this.messages.length > 100) {
            const oldMsg = this.messages.shift();
            if (oldMsg.parentNode) {
                oldMsg.parentNode.removeChild(oldMsg);
            }
        }
    }

    updateUnreadBadge() {
        if (this.unreadCount > 0) {
            this.unreadBadge.textContent = this.unreadCount;
            this.unreadBadge.style.display = 'inline-block';
        } else {
            this.unreadBadge.style.display = 'none';
        }
    }
}