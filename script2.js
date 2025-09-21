// ================== CAMERA CLASS ==================
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

        this.current.x += (this.target.x - this.current.x) * this.config.smoothness;
        this.current.y += (this.target.y - this.current.y) * this.config.smoothness;

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
        
        // THÊM: Smooth movement với RAF
        this.currentDirection = { x: 0, y: 0 };
        this.isActive = false;
        this.init();
        this.startSmoothMovement();
    }

    init() {
        this.knob.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.endDrag());

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

        this.knob.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    startDrag() { 
        this.isDragging = true; 
        this.isActive = true;
    }

    onDrag(event) {
        if (!this.isDragging) return;

        const rect = this.container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let dx = event.clientX - centerX;
        let dy = event.clientY - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < this.config.deadzone) {
            dx = dy = 0;
        } else if (distance > this.config.maxDistance) {
            dx = (dx / distance) * this.config.maxDistance;
            dy = (dy / distance) * this.config.maxDistance;
        }

        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        
        // CẬP NHẬT: Store direction thay vì gọi onMove trực tiếp
        this.currentDirection.x = dx;
        this.currentDirection.y = dy;
    }

    endDrag() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.isActive = false;
        this.currentDirection.x = 0;
        this.currentDirection.y = 0;
        this.knob.style.transform = 'translate(-50%, -50%)';
    }

    // THÊM: Smooth movement với 60fps guaranteed
    startSmoothMovement() {
        const smoothLoop = () => {
            if (this.isActive && this.onMove && (this.currentDirection.x !== 0 || this.currentDirection.y !== 0)) {
                this.onMove(this.currentDirection.x, this.currentDirection.y);
            }
            requestAnimationFrame(smoothLoop);
        };
        requestAnimationFrame(smoothLoop);
    }
}

// ================== NETWORK CLASS ==================
class NetworkManager {
    constructor(gameClient) {
        this.client = gameClient;
        this.config = GameConfig.get();
        this.socket = null;
        this.connected = false;
        this.lastPingTime = 0;
        this.currentPing = 0;
        this.startPingInterval();
    }

    connect(ip, port) {
        this.client.updateStatus('🔌 Đang kết nối...', 'connecting');

        if (this.socket) this.socket.close();

        const wsUrl = `ws://${ip}:${port}`;
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => this.onConnected(ip, port);
        this.socket.onmessage = (event) => this.onMessage(event);
        this.socket.onclose = () => this.onDisconnected();
        this.socket.onerror = (error) => this.onError(error);
    }

    onConnected(ip, port) {
    this.connected = true;
    this.client.updateStatus(`✅ Kết nối: ${ip}:${port}`, 'connected');
    this.client.elements.connectionForm.classList.add('hidden');
    
    const name = (this.client.elements.playerName.value || '').trim().slice(0, 20);
    if (name) this.sendMessage({ type: 'set_name', name });
    
    // THÊM: Authenticate sau khi kết nối
    setTimeout(() => {
        this.client.authenticateWithServer();
    }, 200);
}

    onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.client.messageHandler.process(message);
        } catch (error) {
            console.error('Failed to parse message:', error);
        }
    }

    onDisconnected() {
        this.connected = false;
        this.client.updateStatus('❌ Mất kết nối - Thử lại sau 3s...', 'error');
        
        setTimeout(() => {
            if (!this.connected) {
                this.client.elements.connectionForm.classList.remove('hidden');
            }
        }, this.config.game.reconnectDelay);
    }

    onError() {
        this.client.updateStatus('❌ Lỗi kết nối WebSocket', 'error');
        setTimeout(() => {
            this.client.elements.connectionForm.classList.remove('hidden');
        }, 1000);
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

    startPingInterval() {
        setInterval(() => {
            if (this.connected && this.socket?.readyState === WebSocket.OPEN) {
                this.lastPingTime = Date.now();
                this.sendMessage({ type: 'ping' });
            }
        }, this.config.game.pingInterval);
    }
}

// ================== MAP SYSTEM WITH PORTAL COOLDOWN ==================
class MapSystem {
    constructor(gameClient) {
        this.client = gameClient;
        this.map = null;
        this.tileImages = {};
        this.mapCanvas = null;
        this.mapCtx = null;
        this.mapReady = false;
        
        // THÊM: Portal cooldown system
        this.lastPortalUse = 0;
        this.portalCooldown = 3000; // 3 seconds cooldown
        this.portalCheckInterval = 200; // Check every 200ms
        this.lastPortalCheck = 0;
    }

    init(mapData) {
        if (!mapData) return;
        this.map = mapData;
        this.client.map = mapData;

        this.setupCanvas();
        this.loadTileImages();
    }

    setupCanvas() {
        const gw = this.client.elements.gameWorld;
        gw.style.width = `${this.map.pixel_width}px`;
        gw.style.height = `${this.map.pixel_height}px`;

        if (!this.mapCanvas) {
            const canvas = document.createElement('canvas');
            canvas.id = 'mapCanvas';
            canvas.style.position = 'absolute';
            canvas.style.left = '0px';
            canvas.style.top = '0px';
            canvas.style.zIndex = '1';
            gw.insertBefore(canvas, gw.firstChild);
            this.mapCanvas = canvas;
            this.mapCtx = canvas.getContext('2d');
        }

        this.mapCanvas.width = this.map.pixel_width;
        this.mapCanvas.height = this.map.pixel_height;
    }
    
    changeMap(mapData) {
        this.init(mapData);
        // KHÔNG check portal proximity ngay khi đổi map để tránh loop
    }

    // THÊM: Check nếu portal đang trong cooldown
    isPortalOnCooldown() {
        const now = Date.now();
        return (now - this.lastPortalUse) < this.portalCooldown;
    }

    // THÊM: Get remaining cooldown time
    getPortalCooldownRemaining() {
        const now = Date.now();
        const remaining = this.portalCooldown - (now - this.lastPortalUse);
        return Math.max(0, remaining);
    }

    checkPortalProximity() {
        const now = Date.now();
        
        // THÊM: Throttle portal checking
        if (now - this.lastPortalCheck < this.portalCheckInterval) {
            return;
        }
        this.lastPortalCheck = now;
        
        // THÊM: Check cooldown
        if (this.isPortalOnCooldown()) {
            const remainingMs = this.getPortalCooldownRemaining();
            const remainingSeconds = Math.ceil(remainingMs / 1000);
            console.log(`🚪 Portal cooldown: ${remainingSeconds}s remaining`);
            return;
        }

        const myPos = this.client.gameLogic.myPos;
        if (!this.map?.portals) return;
        
        console.log('🚪 PORTAL CHECK:', {
            myPos: myPos,
            portals: Object.keys(this.map.portals)
        });
        
        for (const [portalId, portal] of Object.entries(this.map.portals)) {
            const dx = myPos.x - portal.x;
            const dy = myPos.y - portal.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            console.log(`Portal ${portalId}: distance=${distance.toFixed(1)}`);
            
            if (distance < 50) {
                console.log(`🚪 Using portal ${portalId}!`);
                
                // THÊM: Set cooldown khi sử dụng portal
                this.lastPortalUse = now;
                
                // THÊM: Show portal usage notification
                this.showPortalUsageNotification(portalId);
                
                this.client.network.sendMessage({
                    type: 'use_portal',
                    portal_id: portalId
                });
                break;
            }
        }
    }

    // THÊM: Show portal usage notification
    showPortalUsageNotification(portalId) {
        const notification = document.createElement('div');
        notification.textContent = `Using Portal: ${portalId}`;
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 100, 200, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            font-weight: bold;
            z-index: 1000;
            pointer-events: none;
            transition: opacity 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
        }, 1000);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 1300);
    }

    // THÊM: Show cooldown notification
    showCooldownNotification() {
        const remainingSeconds = Math.ceil(this.getPortalCooldownRemaining() / 1000);
        
        const notification = document.createElement('div');
        notification.textContent = `Portal Cooldown: ${remainingSeconds}s`;
        notification.style.cssText = `
            position: fixed;
            top: 60%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(200, 50, 50, 0.9);
            color: white;
            padding: 8px 16px;
            border-radius: 5px;
            font-weight: bold;
            z-index: 1000;
            pointer-events: none;
            font-size: 14px;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 800);
    }

    loadTileImages() {
        const tileTypes = this.map.tile_types || {};
        const loadPromises = [];

        for (const tid in tileTypes) {
            const info = tileTypes[tid];
            if (this.tileImages[tid]) continue;

            const img = new Image();
            img.src = info.image;
            this.tileImages[tid] = img;

            loadPromises.push(new Promise((resolve) => {
                img.onload = () => resolve({ tid, img });
                img.onerror = () => resolve({ tid, img: null });
            }));
        }

        Promise.all(loadPromises).then(() => {
            this.mapReady = true;
            this.drawMap();
        });
    }

    drawMap() {
        if (!this.map || !this.mapCtx) return;

        const ctx = this.mapCtx;
        const tileSize = this.map.tile_size || 50;
        const tiles = this.map.tiles || [];

        ctx.clearRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

        for (let y = 0; y < this.map.height; y++) {
            const row = tiles[y] || [];
            for (let x = 0; x < this.map.width; x++) {
                const tid = row[x] != null ? row[x] : 0;
                const img = this.tileImages[tid];
                const px = x * tileSize;
                const py = y * tileSize;

                if (img && img.complete) {
                    try {
                        ctx.drawImage(img, px, py, tileSize, tileSize);
                    } catch (e) {}
                } else {
                    ctx.fillStyle = '#2b6b2b';
                    ctx.fillRect(px, py, tileSize, tileSize);
                }
            }
        }
    }
}

// ================== ENHANCED GAME LOGIC WITH PORTAL COOLDOWN ==================
class GameLogic {
    constructor(gameClient) {
        this.client = gameClient;
        this.myPos = { x: 1000, y: 1000 };
        this.lastMoveTime = 0;
        this.sendThrottle = 50;
        this.pendingMove = null;
        
        this.isMoving = false;
        this.moveDirection = { x: 0, y: 0 };
        this.startContinuousMovement();
        
        // THÊM: Portal checking with throttling
        this.portalCheckInterval = 300; // Check every 300ms
        this.lastPortalCheck = 0;
    }

    movePlayer(dx, dy) {
        this.myPos.x += dx;
        this.myPos.y += dy;

        const maxX = (this.client.map && this.client.map.pixel_width) ? this.client.map.pixel_width : 2000;
        const maxY = (this.client.map && this.client.map.pixel_height) ? this.client.map.pixel_height : 2000;
        this.myPos.x = Math.max(0, Math.min(maxX, this.myPos.x));
        this.myPos.y = Math.max(0, Math.min(maxY, this.myPos.y));

        if (this.client.playerId) {
            const updateData = {
                x: this.myPos.x,
                y: this.myPos.y
            };
            
            if (this.client.players[this.client.playerId]) {
                Object.assign(this.client.players[this.client.playerId], updateData);
            }
            
            if (this.client.playersInCurrentMap[this.client.playerId]) {
                Object.assign(this.client.playersInCurrentMap[this.client.playerId], updateData);
            }
        }

        this.pendingMove = { x: this.myPos.x, y: this.myPos.y };
    }

    startContinuousMovement() {
        const smoothMovement = () => {
            this.sendPendingMove();
            
            // THÊM: Throttled portal checking
            const now = Date.now();
            if (now - this.lastPortalCheck > this.portalCheckInterval) {
                this.lastPortalCheck = now;
                if (this.client.mapSystem) {
                    this.client.mapSystem.checkPortalProximity();
                }
            }
            
            requestAnimationFrame(smoothMovement);
        };
        requestAnimationFrame(smoothMovement);
    }

    sendPendingMove() {
        if (!this.pendingMove) return;
        
        const now = Date.now();
        if (now - this.lastMoveTime < this.sendThrottle) return;
        
        if (this.client.network.connected && this.client.network.socket?.readyState === WebSocket.OPEN) {
            this.client.network.sendMessage({
                type: 'move',
                x: this.pendingMove.x,
                y: this.pendingMove.y
            });
            
            this.lastMoveTime = now;
            this.pendingMove = null;
        }
    }
}