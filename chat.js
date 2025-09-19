class ChatSystem {
    constructor(gameClient) {
        this.gameClient = gameClient;
        this.messages = [];
        this.createUI();
    }

    createUI() {
        const chatHTML = `
            <div id="chatMessages" class="chat-messages"></div>
            <div id="chatInput" class="chat-input-box">
                <input type="text" id="msgInput" placeholder="Chat..." maxlength="100">
                <button id="sendBtn">Send</button>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', chatHTML);
        
        this.messageList = document.getElementById('chatMessages');
        this.input = document.getElementById('msgInput');
        this.sendBtn = document.getElementById('sendBtn');
        
        this.sendBtn.onclick = () => this.send();
        this.input.onkeypress = (e) => e.key === 'Enter' && this.send();
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
    
    this.messageList.appendChild(div);
    
    // Keep only last 10 messages
    while (this.messageList.children.length > 10) {
        this.messageList.removeChild(this.messageList.firstChild);
    }
    
    // Auto remove message after 8 seconds
    setTimeout(() => {
        if (div.parentNode) {
            div.parentNode.removeChild(div);
        }
    }, 8000);
}
}