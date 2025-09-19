class GameConfig {
    static get() {
        return {
            server: {
                defaultIP: '0.0.0.0',
                defaultPort: 8889,
                quickConnectIP: '10.144.237.166'
            },
            game: {
                moveSpeed: 0.1,
                playerHp: 100,
                playerMaxHp: 100,
                playerDamage:10,
                playerRange: 100,
                playerAttackspeed: 2,
                frameRate: 60,
                pingInterval: 2000,
                reconnectDelay: 3000
            },
            camera: {
                smoothness: 0.15,
                enabled: true
            },
            joystick: {
                maxDistance: 45,
                deadzone: 3
            }
        };
    }
}

class Camera {
    constructor(gameArea, gameWorld) {
        this.gameArea = gameArea;
        this.gameWorld = gameWorld;
        this.target = { x: 1000, y: 1000 };
        this.current = { x: 1000, y: 1000 };
        this.config = GameConfig.get().camera;
    }

    setTarget(x, y) {
        this.target.x = x;
        this.target.y = y;
    }

    update() {
        if (!this.config.enabled) return;

        const rect = this.gameArea.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Smooth camera movement
        this.current.x += (this.target.x - this.current.x) * this.config.smoothness;
        this.current.y += (this.target.y - this.current.y) * this.config.smoothness;

        // Apply camera transform
        const translateX = centerX - this.current.x;
        const translateY = centerY - this.current.y;

        this.gameWorld.style.transform = `translate(${translateX}px, ${translateY}px)`;
    }
}

class Joystick {
    constructor(container, knob, onMove) {
        this.container = container;
        this.knob = knob;
        this.onMove = onMove;
        this.isDragging = false;
        this.config = GameConfig.get().joystick;
        
        this.init();
    }

    init() {
        // Mouse events
        this.knob.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.endDrag());

        // Touch events
        this.knob.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startDrag(e.touches[0]);
        }, { passive: false });

        document.addEventListener('touchmove', (e) => {
            if (this.isDragging) {
                e.preventDefault();
                this.onDrag(e.touches[0]);
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            if (this.isDragging) {
                e.preventDefault();
                this.endDrag();
            }
        }, { passive: false });

        // Prevent context menu
        this.knob.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    startDrag(event) {
        this.isDragging = true;
    }

    onDrag(event) {
        if (!this.isDragging) return;

        const rect = this.container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = event.clientX - centerX;
        let dy = event.clientY - centerY;

        // Apply deadzone
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < this.config.deadzone) {
            dx = dy = 0;
        } else {
            // Limit movement
            if (distance > this.config.maxDistance) {
                dx = (dx / distance) * this.config.maxDistance;
                dy = (dy / distance) * this.config.maxDistance;
            }
        }

        // Update knob position
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        // Trigger movement callback
        if (this.onMove && (dx !== 0 || dy !== 0)) {
            this.onMove(dx, dy);
        }
    }

    endDrag() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        this.knob.style.transform = 'translate(-50%, -50%)';
    }
}

class GameClient {
    constructor() {
        this.config = GameConfig.get();
        this.socket = null;
        this.connected = false;
        this.playerId = null;
        this.chatSystem = null;
        this.players = {};
        this.myPos = { x: 1000, y: 1000 };
        this.lastMoveTime = 0;
        this.lastPingTime = 0;
        this.currentPing = 0;
        // map related
        this.map = null;
        this.tileImages = {};
        this.mapCanvas = null;
        this.mapCtx = null;
        this.mapReady = false;
        this.mobs = {};
        this.mobTypes = {};

        // --- trong constructor của GameClient, elements ---
        this.elements = {
          connectionForm: document.getElementById('connectionForm'),
          statusText: document.getElementById('statusText'),
          gameArea: document.getElementById('gameArea'),
          gameWorld: document.getElementById('gameWorld'),
          pingDisplay: document.getElementById('pingDisplay'),
          playerInfo: document.getElementById('playerInfo'),
          serverIP: document.getElementById('serverIP'),
          playerName: document.getElementById('playerName'),
          debugInfo: document.getElementById('debugInfo')
        };

        this.camera = new Camera(this.elements.gameArea, this.elements.gameWorld);
        this.joystick = new Joystick(
            document.querySelector('.joystick-container'),
            document.getElementById('joystickKnob'),
            (dx, dy) => this.handleJoystickMove(dx, dy)
        );

        this.startGameLoop();
        this.startPingInterval();
    }

    handleJoystickMove(dx, dy) {
    const speed = this.config.game.moveSpeed;
    this.myPos.x += dx * speed;
    this.myPos.y += dy * speed;

    // Constrain to world bounds
    const maxX = (this.map && this.map.pixel_width) ? this.map.pixel_width : 2000;
    const maxY = (this.map && this.map.pixel_height) ? this.map.pixel_height : 2000;
    this.myPos.x = Math.max(0, Math.min(maxX, this.myPos.x));
    this.myPos.y = Math.max(0, Math.min(maxY, this.myPos.y));
    
    // Update local player immediately
    if (this.playerId && this.players[this.playerId]) {
        this.players[this.playerId].x = this.myPos.x;
        this.players[this.playerId].y = this.myPos.y;
    }

    // THÊM RATE LIMITING: chỉ gửi server 20 lần/giây
    const now = Date.now();
    if (now - this.lastMoveTime < 50) return; // 50ms = 20fps
    this.lastMoveTime = now;

    // Send to server
    if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
        this.sendMessage({
            type: 'move',
            x: this.myPos.x,
            y: this.myPos.y
        });
    }
}

    // connect() - dùng defaultPort tự động
connect() {
    const ip = this.elements.serverIP.value || this.config.server.defaultIP;
    const port = this.config.server.defaultPort; // port tự động từ GameConfig

    this.updateStatus('🔌 Đang kết nối...', 'connecting');

    try {
        if (this.socket) {
            this.socket.close();
        }

        const wsUrl = `ws://${ip}:${port}`;
        this.socket = new WebSocket(wsUrl);

        // onopen sẽ gọi onConnected -> ở onopen ta gửi set_name
        this.socket.onopen = () => {
            this.onConnected(ip, port);

            // nếu người chơi nhập tên thì gửi lên server
            const name = (this.elements.playerName.value || '').trim().slice(0, 20);
            if (name) {
                this.sendMessage({ type: 'set_name', name });
            }
        };

        this.socket.onmessage = (event) => this.onMessage(event);
        this.socket.onclose = () => this.onDisconnected();
        this.socket.onerror = (error) => this.onError(error);

    } catch (error) {
        this.updateStatus(`❌ Lỗi: ${error.message}`, 'error');
    }
}

// setQuickConnect() - chỉ đặt IP, port để mặc định
setQuickConnect() {
    this.elements.serverIP.value = this.config.server.quickConnectIP;
    // no port field to set
}

    onConnected(ip, port) {
        this.connected = true;
        if (!this.chatSystem) {
          this.chatSystem = new ChatSystem(this);
        }
        this.updateStatus(`✅ Kết nối: ${ip}:${port}`, 'connected');
        this.elements.connectionForm.classList.add('hidden');
    }

    onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.processMessage(message);
        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    }

    onDisconnected() {
        this.connected = false;
        this.updateStatus('❌ Mất kết nối - Thử lại sau 3s...', 'error');
        
        setTimeout(() => {
            if (!this.connected) {
                this.elements.connectionForm.classList.remove('hidden');
            }
        }, this.config.game.reconnectDelay);
    }

    onError(error) {
        this.updateStatus('❌ Lỗi kết nối WebSocket', 'error');
        setTimeout(() => {
            this.elements.connectionForm.classList.remove('hidden');
        }, 1000);
    }
    
    processMobInit(mobTypes, mobs) {
    this.mobTypes = mobTypes || {};
    this.mobs = mobs || {};
    console.log(`Loaded ${Object.keys(this.mobs).length} mobs`);
}

updateMobs(mobs) {
    this.mobs = mobs || {};
}

renderMobs() {
    // Clear existing mobs
    const existingMobs = this.elements.gameWorld.querySelectorAll('.mob');
    existingMobs.forEach(el => el.remove());
    
    // Render all mobs
    for (const [mobId, mobData] of Object.entries(this.mobs)) {
        if (!mobData.is_alive) continue;
        
        const mobEl = document.createElement('div');
        mobEl.className = 'mob';
        mobEl.id = `mob-${mobId}`;
        mobEl.style.left = `${mobData.x}px`;
        mobEl.style.top = `${mobData.y}px`;
        mobEl.style.backgroundImage = `url(${mobData.image})`;
        
        // HP bar
        const hpBar = document.createElement('div');
        hpBar.className = 'mob-hp-bar';
        const hpPercent = (mobData.current_hp / mobData.max_hp) * 100;
        hpBar.innerHTML = `<div class="hp-fill" style="width: ${hpPercent}%"></div>`;
        mobEl.appendChild(hpBar);
        
        this.elements.gameWorld.appendChild(mobEl);
    }
}

    processMessage(message) {
        switch (message.type) {
            case 'player_joined':
                this.players[message.player_id] = message.player_data;
                break;
                
            case 'player_renamed':
                if (!this.players[message.player_id]) this.players[message.player_id] = {};
                this.players[message.player_id].name = message.player_name || message.name || message.player_id;
                break;
                
            case 'init':
                // store id + players
                this.playerId = message.player_id;
                this.players = message.players || {};
                const myName = (this.elements.playerName?.value || '').trim().slice(0,20);
                  if (myName && this.players[this.playerId]) {
                    this.players[this.playerId].name = myName;
                  }
                if (this.playerId && this.players[this.playerId]) {
                    const serverPos = this.players[this.playerId];
                    this.myPos.x = serverPos.x;
                    this.myPos.y = serverPos.y;
                }
                
                if (message.mob_types) {
                this.processMobInit(message.mob_types, message.mobs);
                }
                

                // --- IMPORTANT: xử lý map ở đây, trước khi break ---
                if (message.map) {
                    // debug
                    console.log("Received map from server:", {
                        width: message.map.width,
                        height: message.map.height,
                        tile_size: message.map.tile_size,
                        tile_types: Object.keys(message.map.tile_types || {})
                    });
                    this.handleMapInit(message.map);
                } else {
                    console.log("No map included in init message");
                }

                break;
                
            case 'mob_update':
                this.updateMobs(message.mobs);
                break;

            case 'player_joined':
                this.players[message.player_id] = message.player_data;
                break;

            case 'player_moved':
                if (message.player_id in this.players && message.player_id !== this.playerId) {
                    this.players[message.player_id].x = message.x;
                    this.players[message.player_id].y = message.y;
                }
                break;

            case 'player_left':
                delete this.players[message.player_id];
                break;

            case 'pong':
                this.currentPing = Date.now() - this.lastPingTime;
                this.elements.pingDisplay.textContent = `Ping: ${this.currentPing}ms`;
                break;
               
            case 'chat':
                if (this.chatSystem) {
                  const displayName = message.player_name || message.player_id || "Anonymous";
                  this.chatSystem.addMessage(displayName, message.text);
                }
                break;

            default:
                break;
        }
    }

    sendMessage(message) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(message));
            } catch (error) {
                console.error('Failed to send message:', error);
            }
        }
    }
    
    handleMapInit(mapData) {
        if (!mapData) return;
        this.map = mapData;

        // Set gameWorld size to map pixel dimensions
        const gw = this.elements.gameWorld;
        gw.style.width = `${this.map.pixel_width}px`;
        gw.style.height = `${this.map.pixel_height}px`;

        if (!this.mapCanvas) {
            const canvas = document.createElement('canvas');
            canvas.id = 'mapCanvas';
            canvas.style.position = 'absolute';
            canvas.style.left = '0px';
            canvas.style.top = '0px';
            canvas.style.zIndex = '1'; // players have higher z-index in CSS
            gw.insertBefore(canvas, gw.firstChild);
            this.mapCanvas = canvas;
            this.mapCtx = canvas.getContext('2d');
        }

        // Resize canvas to map size
        this.mapCanvas.width = this.map.pixel_width;
        this.mapCanvas.height = this.map.pixel_height;

        // Load tile images (tile_types: id -> {name,image})
        const tileTypes = this.map.tile_types || {};
        const loadPromises = [];

        for (const tid in tileTypes) {
            const info = tileTypes[tid];
            // avoid reloading if already cached
            if (this.tileImages[tid]) continue;

            const img = new Image();
            img.src = info.image;
            this.tileImages[tid] = img;

            loadPromises.push(new Promise((resolve) => {
                img.onload = () => resolve({ tid, img });
                img.onerror = () => {
                    // fallback: resolve anyway so map draws with empty tile
                    console.warn('Failed loading tile image:', info.image);
                    resolve({ tid, img: null });
                };
            }));
        }

        Promise.all(loadPromises).then(() => {
            this.mapReady = true;
            this.drawFullMap();
        }).catch((e) => {
            console.warn('Tile loading error', e);
            this.mapReady = true;
            this.drawFullMap();
        });
    }

    drawFullMap() {
        if (!this.map || !this.mapCtx) return;
        const ctx = this.mapCtx;
        const tileSize = this.map.tile_size || 50;
        const rows = this.map.height;
        const cols = this.map.width;
        const tiles = this.map.tiles || [];

        // clear
        ctx.clearRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

        for (let y = 0; y < rows; y++) {
            const row = tiles[y] || [];
            for (let x = 0; x < cols; x++) {
                const tid = row[x] != null ? row[x] : 0;
                const img = this.tileImages[tid];
                const px = x * tileSize;
                const py = y * tileSize;

                if (img && img.complete) {
                    // draw scaled to tileSize (in case image size differs)
                    try {
                        ctx.drawImage(img, px, py, tileSize, tileSize);
                    } catch (e) {
                        // ignore draw errors
                    }
                } else {
                    // fallback: fill with a subtle color to indicate missing tile
                    ctx.fillStyle = '#2b6b2b';
                    ctx.fillRect(px, py, tileSize, tileSize);
                }
            }
        }
    }

    updateStatus(text, type) {
        this.elements.statusText.textContent = text;
        this.elements.statusText.className = `status-text ${type}`;
    }

    renderPlayers() {
    // Clear existing players
    const existingPlayers = this.elements.gameWorld.querySelectorAll('.player');
    existingPlayers.forEach(el => el.remove());

    // Render all players
    let renderedCount = 0;
    for (const [playerId, playerData] of Object.entries(this.players)) {
        const playerEl = document.createElement('div');
        playerEl.className = `player ${playerId === this.playerId ? 'me' : 'other'}`;
        playerEl.id = `player-${playerId}`;
        playerEl.style.left = `${playerData.x}px`;
        playerEl.style.top = `${playerData.y}px`;

        // === thêm name label ===
        const nameEl = document.createElement('div');
        nameEl.className = 'player-name';
        // ưu tiên name do server gửi, fallback playerId
        nameEl.textContent = playerData.name || playerId;
        playerEl.appendChild(nameEl);

        this.elements.gameWorld.appendChild(playerEl);
        renderedCount++;
    }

    // Update UI info
    const count = Object.keys(this.players).length;
    this.elements.playerInfo.textContent = `👥 ${count} người chơi online`;

    // Update debug info
    const myPlayer = this.players[this.playerId];
    if (myPlayer) {
        this.elements.debugInfo.innerHTML = `
            Player: ${this.playerId}<br>
            Position: (${myPlayer.x.toFixed(1)}, ${myPlayer.y.toFixed(1)})<br>
            Players: ${count}<br>
            Rendered: ${renderedCount}
        `;
    }
}

    updateCamera() {
        if (this.playerId && this.players[this.playerId]) {
            const myPlayer = this.players[this.playerId];
            this.camera.setTarget(myPlayer.x, myPlayer.y);
        }
        this.camera.update();
    }

    startGameLoop() {
        const gameLoop = () => {
            this.renderPlayers();
            this.renderMobs();
            this.updateCamera();
            requestAnimationFrame(gameLoop);
        };
        requestAnimationFrame(gameLoop);
    }

    startPingInterval() {
        setInterval(() => {
            if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
                this.lastPingTime = Date.now();
                this.sendMessage({ type: 'ping' });
            }
        }, this.config.game.pingInterval);
    }
}

// Initialize game client
let gameClient;
window.addEventListener('load', () => {
    gameClient = new GameClient();
});

// Expose setQuickConnect for button usage
window.setQuickConnect = () => {
    if (gameClient) {
        gameClient.setQuickConnect();
    }
};