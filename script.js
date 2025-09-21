// ================== CONFIG CLASS ==================
class GameConfig {
    static get() {
        return {
            server: {
                defaultIP: '0.0.0.0',
                defaultPort: 8889,
                quickConnectIP: '10.144.237.166'
            },
            game: {
                moveSpeed: 0.05,
                playerHp: 0,
                playerMaxHp: 0,
                playerDamage: 1,
                playerRange: 0,
                playerAttackspeed: 0,
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

// ================== INPUT CLASS ==================
class InputHandler {
    constructor(gameClient) {
        this.client = gameClient;
        this.config = GameConfig.get();
        this.joystick = null;
        this.attackInterval = null;
        this.init();
    }

    init() {
        this.initJoystick();
        this.initKeyboard();
        this.initMouse();
    }

    initJoystick() {
        const container = document.querySelector('.joystick-container');
        const knob = document.getElementById('joystickKnob');
        if (!container || !knob) return;

        this.joystick = new Joystick(container, knob, (dx, dy) => {
            this.handleMove(dx, dy);
        });
    }

    initKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && this.client.connected) {
                e.preventDefault();
                this.client.combat.attack();
            }
        });
    }
    
    startAttacking() {
        if (this.attackInterval) return;
        
        if (this.client.connected) {
            this.client.combat.attack();
        }
        
        this.attackInterval = setInterval(() => {
            if (this.client.connected) {
                this.client.combat.attack();
            }
        }, this.client.combat.attackCooldown);
    }

    stopAttacking() {
        if (this.attackInterval) {
            clearInterval(this.attackInterval);
            this.attackInterval = null;
        }
    }

    initMouse() {
        const attackBtn = document.getElementById('attackBtn');
        if (!attackBtn) return;

        // Mouse events
        attackBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.startAttacking();
        });
        
        attackBtn.addEventListener('mouseup', (e) => {
            e.preventDefault(); 
            this.stopAttacking();
        });
        
        attackBtn.addEventListener('mouseleave', () => {
            this.stopAttacking();
        });

        // Touch events - Fixed version
        attackBtn.addEventListener('touchstart', (e) => {
            if (e.cancelable) {
                e.preventDefault();
            }
            e.stopPropagation();
            this.startAttacking();
        }, { passive: false });
        
        attackBtn.addEventListener('touchend', (e) => {
            if (e.cancelable) {
                e.preventDefault();
            }
            e.stopPropagation();
            this.stopAttacking();
        }, { passive: false });

        attackBtn.addEventListener('touchcancel', () => {
            this.stopAttacking();
        });

        // Prevent context menu on long press
        attackBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Prevent scroll/zoom on button
        attackBtn.addEventListener('touchmove', (e) => {
            if (e.cancelable) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    handleMove(dx, dy) {
        const speed = this.config.game.moveSpeed;
        this.client.gameLogic.movePlayer(dx * speed, dy * speed);
    }
}

// ================== MESSAGE HANDLER ==================
class MessageHandler {
    constructor(gameClient) {
        this.client = gameClient;
    }

    // FIXED: MessageHandler.process method

process(message) {
    switch (message.type) {
        case 'init':
            this.handleInit(message);
            break;
            
        case 'player_joined':
            // FIX: Kiểm tra map cẩn thận hơn
            const joinMapId = message.player_data.current_map || 'map1';
            if (joinMapId === this.client.currentMapId) {
                this.client.playersInCurrentMap[message.player_id] = message.player_data;
            }
            // Luôn thêm vào players global
            this.client.players[message.player_id] = message.player_data;
            break;
            
        case 'player_changed_map':
            // FIX: Xử lý cẩn thận khi player đổi map
            if (message.old_map === this.client.currentMapId) {
                // Player rời khỏi map hiện tại
                delete this.client.playersInCurrentMap[message.player_id];
            }
            if (message.new_map === this.client.currentMapId) {
                // Player vào map hiện tại
                if (message.player_data) {
                    this.client.playersInCurrentMap[message.player_id] = message.player_data;
                }
            }
            // Update global players
            if (message.player_data) {
                this.client.players[message.player_id] = message.player_data;
            }
            break;
            
        case 'map_players_list':
            // FIX: Nhận danh sách players từ server
            console.log('📋 Received map players list:', message.players);
            this.client.playersInCurrentMap = message.players || {};
            
            // Đảm bảo bản thân vẫn có trong list
            if (this.client.playerId && this.client.players[this.client.playerId]) {
                this.client.playersInCurrentMap[this.client.playerId] = this.client.players[this.client.playerId];
            }
            break;
            
        case 'player_renamed':
            if (this.client.players[message.player_id]) {
                this.client.players[message.player_id].name = message.player_name || message.name;
                // Update cả playersInCurrentMap nếu có
                if (this.client.playersInCurrentMap[message.player_id]) {
                    this.client.playersInCurrentMap[message.player_id].name = message.player_name || message.name;
                }
            }
            break;
            
        case 'player_moved':
            if (message.player_id in this.client.players && message.player_id !== this.client.playerId) {
                this.client.players[message.player_id].x = message.x;
                this.client.players[message.player_id].y = message.y;
                
                // Update playersInCurrentMap nếu player ở cùng map
                if (this.client.playersInCurrentMap[message.player_id]) {
                    this.client.playersInCurrentMap[message.player_id].x = message.x;
                    this.client.playersInCurrentMap[message.player_id].y = message.y;
                }
            }
            break;
            
        case 'map_change':
            this.handleMapChange(message);
            break;
            
        case 'player_left':
            delete this.client.players[message.player_id];
            delete this.client.playersInCurrentMap[message.player_id];
            break;
            
        case 'mob_update':
            this.client.mobs = message.mobs || {};
            this.client.renderer.forceRenderMobs();
            break;
            
        case 'attack_result':
            if (this.client.mobs[message.target_id]) {
                this.client.mobs[message.target_id].current_hp -= message.damage;
                this.client.mobs[message.target_id].current_hp = Math.max(0, this.client.mobs[message.target_id].current_hp);
            }
            this.client.renderer.showDamageEffect(message.target_id, message.damage);
            this.client.renderer.forceRenderMobs();
            break;
            
        case 'mob_killed':
            if (message.killer_id === this.client.playerId) {
                this.client.renderer.showExpGainEffect(message.exp_gained);
                if (message.level_up) {
                    this.client.renderer.showLevelUpEffect(message.new_level);
                }
            }
            console.log(`Mob ${message.target_id} killed by ${message.killer_id} (+${message.exp_gained} EXP)`);
            break;
            
        case 'pong':
            this.client.network.currentPing = Date.now() - this.client.network.lastPingTime;
            this.client.elements.pingDisplay.textContent = `Ping: ${this.client.network.currentPing}ms`;
            break;
            
        case 'stats_update':
            console.log('📊 RECEIVED STATS FROM SERVER:', message.stats);
            this.client.updatePlayerStats(message.stats);
            console.log('✅ Client playerStats updated:', this.client.playerStats);
            break;
            
        case 'chat':
            if (this.client.chatSystem) {
                const displayName = message.player_name || message.player_id || "Anonymous";
                this.client.chatSystem.addMessage(displayName, message.text);
            }
            break;
            
        case 'mob_attack':
            this.client.handleMobAttack(message);
            break;
            
        case 'player_damaged':
            this.client.handlePlayerDamaged(message);
            break;
    }
}
    
    handleMapChange(message) {
    console.log('🗺️ MAP CHANGE:', message);
    
    this.client.currentMapId = message.map.map_id;
    
    // FIX: Clear players cũ NHƯNG giữ lại global players
    this.client.playersInCurrentMap = {};
    
    // Thêm bản thân vào map mới
    if (this.client.playerId) {
        const myPlayerData = {
            x: message.new_position.x,
            y: message.new_position.y,
            name: this.client.elements.playerName.value || this.client.playerId,
            current_map: message.map.map_id,
            color: this.client.players[this.client.playerId]?.color || "hsl(180, 70%, 50%)",
            stats: this.client.players[this.client.playerId]?.stats
        };
        
        // Update cả 2 objects
        this.client.players[this.client.playerId] = myPlayerData;
        this.client.playersInCurrentMap[this.client.playerId] = myPlayerData;
    }
    
    // Update map và mobs
    this.client.mapSystem.changeMap(message.map);
    if (message.mob_data) {
        this.client.mobs = message.mob_data.mobs || {};
        this.client.mobTypes = message.mob_data.mob_types || {};
    }
    
    // Update position
    this.client.gameLogic.myPos.x = message.new_position.x;
    this.client.gameLogic.myPos.y = message.new_position.y;
    
    // Request players ở map mới sau delay nhỏ
    setTimeout(() => {
        this.client.network.sendMessage({ type: 'request_map_players' });
    }, 100);
}

// FIX: handleInit method
handleInit(message) {
    console.log('🎮 INIT MESSAGE:', message);
    
    this.client.playerId = message.player_id;
    this.client.players = message.players || {};
    
    // FIX: Cập nhật playersInCurrentMap từ server dựa trên current_map
    this.client.playersInCurrentMap = {};
    for (const [pid, pdata] of Object.entries(this.client.players)) {
        const playerMapId = pdata.current_map || 'map1';
        if (playerMapId === this.client.currentMapId) {
            this.client.playersInCurrentMap[pid] = pdata;
        }
    }
    
    console.log('✅ Players in current map:', Object.keys(this.client.playersInCurrentMap));
    
    if (this.client.playerId && this.client.players[this.client.playerId]) {
        const serverPos = this.client.players[this.client.playerId];
        this.client.gameLogic.myPos.x = serverPos.x;
        this.client.gameLogic.myPos.y = serverPos.y;
    }

    if (message.mob_types) {
        this.client.mobTypes = message.mob_types || {};
        this.client.mobs = message.mobs || {};
    }

    if (message.map) {
        this.client.mapSystem.init(message.map);
    }
    
    setTimeout(() => {
        this.client.authenticateWithServer();
    }, 100);
}
}
// ================== COMBAT SYSTEM ==================
class CombatSystem {
    constructor(gameClient) {
        this.client = gameClient;
        this.config = GameConfig.get();
        this.lastAttackTime = 0;
        this.attackCooldown = 1000 / this.config.game.playerAttackspeed;
    }

    canAttack() {
        return (Date.now() - this.lastAttackTime) >= this.attackCooldown;
    }

    attack() {
        if (!this.canAttack()) return;

        const myPlayer = this.client.players[this.client.playerId];
        if (!myPlayer || !this.client.playerStats) return;

        const nearestMob = this.findNearestMob(myPlayer);
        if (!nearestMob) return;

        this.lastAttackTime = Date.now();

        this.client.network.sendMessage({
            type: 'attack',
            target_id: nearestMob.id,
            damage: this.client.playerStats.damage || 10,   // SỬ DỤNG STATS TỪ SERVER
            range: this.client.playerStats.range || 100     // SỬ DỤNG STATS TỪ SERVER
        });

        this.client.renderer.showAttackEffect(
            myPlayer.x, myPlayer.y, nearestMob.x, nearestMob.y
        );

        this.updateAttackButton();
    }

    updateAttackButton() {
        const btn = document.getElementById('attackBtn');
        if (!btn) return;

        btn.classList.add('attacking');
        setTimeout(() => {
            btn.classList.remove('attacking');
        }, 200);
    }

    findNearestMob(player) {
        let nearestMob = null;
        let minDistance = this.client.playerStats ? this.client.playerStats.range : 100;

        for (const [mobId, mob] of Object.entries(this.client.mobs)) {
            if (!mob.is_alive) continue;

            const dx = mob.x - player.x;
            const dy = mob.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                nearestMob = { id: mobId, ...mob };
                minDistance = distance;
            }
        }

        return nearestMob;
    }
}

// ================== RENDERER ==================
class Renderer {
    constructor(gameClient) {
        this.client = gameClient;
    }

    renderAll() {
        this.renderPlayers();
        this.renderMobs();
        this.updateCamera();
        this.renderPortals();
    }

    renderPortals() {
        if (!this.client.map || !this.client.map.portals) return;
        
        const existing = this.client.elements.gameWorld.querySelectorAll('.portal');
        existing.forEach(el => el.remove());
        
        for (const [portalId, portal] of Object.entries(this.client.map.portals)) {
            const portalEl = document.createElement('div');
            portalEl.className = 'portal';
            portalEl.style.cssText = `
                position: absolute;
                left: ${portal.x}px;
                top: ${portal.y}px;
                width: 40px;
                height: 40px;
                background: radial-gradient(circle, #00ffff, #0066cc);
                border-radius: 50%;
                animation: portalPulse 2s infinite;
                z-index: 10;
            `;
            this.client.elements.gameWorld.appendChild(portalEl);
        }
    }

renderPlayers() {
    const existing = this.client.elements.gameWorld.querySelectorAll('.player');
    existing.forEach(el => el.remove());

    let count = 0;
    for (const [playerId, playerData] of Object.entries(this.client.playersInCurrentMap)) {
        const playerEl = document.createElement('div');
        playerEl.className = `player ${playerId === this.client.playerId ? 'me' : 'other'}`;
        playerEl.id = `player-${playerId}`;
        playerEl.style.position = 'absolute';
        playerEl.style.left = `${playerData.x}px`;
        playerEl.style.top = `${playerData.y}px`;
        playerEl.style.width = '28px';
        playerEl.style.height = '28px';
        playerEl.style.display = 'flex';
        playerEl.style.alignItems = 'center';
        playerEl.style.justifyContent = 'center';
        playerEl.style.color = '#000';
        playerEl.style.fontSize = '11px';

        if (playerId === this.client.playerId) {
        }

        const nameEl = document.createElement('div');
        nameEl.className = 'player-name';
        nameEl.textContent = playerData.name || playerId;
        nameEl.style.position = 'absolute';
        nameEl.style.top = '-16px';
        nameEl.style.left = '50%';
        nameEl.style.transform = 'translateX(-50%)';
        nameEl.style.fontSize = '12px';
        nameEl.style.color = '#fff';
        nameEl.style.textShadow = '0 1px 2px rgba(0,0,0,0.7)';

        playerEl.appendChild(nameEl);
        this.client.elements.gameWorld.appendChild(playerEl);
        count++;
    }

    this.client.elements.playerInfo.textContent = `👥 ${count} người chơi online`;
    this.updateDebugInfo(count);
}

    renderMobs() {
        const existing = this.client.elements.gameWorld.querySelectorAll('.mob');
        existing.forEach(el => el.remove());

        for (const [mobId, mobData] of Object.entries(this.client.mobs)) {
            if (!mobData.is_alive) continue;

            const mobEl = document.createElement('div');
            mobEl.className = 'mob';
            mobEl.id = `mob-${mobId}`;
            mobEl.style.cssText = `
                position: absolute;
                left: ${mobData.x}px;
                top: ${mobData.y}px;
                width: 32px;
                height: 32px;
                background-image: url(${mobData.image});
                background-size: cover;
                background-position: center;
                z-index: 15;
            `;

            const hpBar = document.createElement('div');
            hpBar.className = 'mob-hp-bar';
            hpBar.style.cssText = `
                position: absolute;
                top: -8px;
                left: 0;
                width: 32px;
                height: 4px;
                background: rgba(255,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.5);
                border-radius: 2px;
            `;
            
            const hpPercent = Math.max(0, Math.min(100, (mobData.current_hp / mobData.max_hp) * 100));
            const hpFill = document.createElement('div');
            hpFill.className = 'hp-fill';
            hpFill.style.cssText = `
                width: ${hpPercent}%;
                height: 100%;
                background: linear-gradient(90deg, #ff0000, #ff4444);
                border-radius: 1px;
                transition: width 0.3s ease;
            `;
            
            hpBar.appendChild(hpFill);
            mobEl.appendChild(hpBar);

            this.client.elements.gameWorld.appendChild(mobEl);
        }
    }
    
    forceRenderMobs() {
        this.renderMobs();
    }

    updateCamera() {
        // FIX: Ưu tiên sử dụng playersInCurrentMap cho camera
        const myPlayer = this.client.playersInCurrentMap[this.client.playerId] 
            || this.client.players[this.client.playerId];
            
        if (myPlayer) {
            this.client.camera.setTarget(myPlayer.x, myPlayer.y);
        }
        this.client.camera.update();
    }

    updateDebugInfo(playerCount) {
        const myPlayer = this.client.playersInCurrentMap[this.client.playerId] 
            || this.client.players[this.client.playerId];
            
        if (myPlayer) {
            this.client.elements.debugInfo.innerHTML = `
                Player: ${this.client.playerId}<br>
                Position: (${myPlayer.x.toFixed(1)}, ${myPlayer.y.toFixed(1)})<br>
                Map: ${this.client.currentMapId}<br>
                Players: ${playerCount}<br>
                Mobs: ${Object.keys(this.client.mobs).length}
            `;
        }
    }
    
    showExpGainEffect(expGained) {
        const myPlayer = this.client.playersInCurrentMap[this.client.playerId] 
            || this.client.players[this.client.playerId];
        if (!myPlayer) return;

        const el = document.createElement('div');
        el.textContent = `+${expGained} EXP`;
        el.style.cssText = `
            position: absolute; 
            left: ${myPlayer.x + 20}px; 
            top: ${myPlayer.y - 30}px; 
            color: #00ff00; 
            font-weight: bold; 
            font-size: 14px; 
            pointer-events: none; 
            z-index: 200; 
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            transition: all 2s ease-out;
        `;

        this.client.elements.gameWorld.appendChild(el);

        setTimeout(() => {
            el.style.transform = 'translateY(-50px)';
            el.style.opacity = '0';
        }, 50);
        setTimeout(() => {
            if (el.parentNode) {
                el.remove();
            }
        }, 2050);
    }

    showLevelUpEffect(newLevel) {
        const myPlayer = this.client.playersInCurrentMap[this.client.playerId] 
            || this.client.players[this.client.playerId];
        if (!myPlayer) return;

        const el = document.createElement('div');
        el.textContent = `LEVEL UP! (${newLevel})`;
        el.style.cssText = `
            position: absolute; 
            left: ${myPlayer.x - 50}px; 
            top: ${myPlayer.y - 50}px; 
            color: #ffd700; 
            font-weight: bold; 
            font-size: 18px; 
            pointer-events: none; 
            z-index: 300; 
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
            animation: levelUpPulse 3s ease-out forwards;
        `;

        this.client.elements.gameWorld.appendChild(el);
        setTimeout(() => {
            if (el.parentNode) {
                el.remove();
            }
        }, 3000);
    }
    
    showMobAttackEffect(x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;

    const el = document.createElement('div');
    el.className = 'cg-glow-ring';

    // size động theo khoảng cách
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const size = Math.min(48, Math.max(20, 20 + dist * 0.06));
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;

    el.style.left = `${mx}px`;
    el.style.top  = `${my}px`;

    // vòng sáng trong
    const inner = document.createElement('div');
    inner.className = 'cg-glow-ring-inner';
    el.appendChild(inner);

    this.client.elements.gameWorld.appendChild(el);

    // cleanup
    const removeEl = () => { if (el.parentNode) el.remove(); };
    el.addEventListener('animationend', removeEl, { once: true });
    setTimeout(removeEl, 700);
}

    showPlayerDamageEffect(x, y, damage) {
        const el = document.createElement('div');
        el.textContent = `-${damage}`;
        el.style.cssText = `
            position: absolute; 
            left: ${x}px; 
            top: ${y - 15}px; 
            color: #ff4444; 
            font-weight: bold; 
            font-size: 16px; 
            pointer-events: none; 
            z-index: 200; 
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            transition: all 1.2s ease-out;
        `;
        
        this.client.elements.gameWorld.appendChild(el);
        
        setTimeout(() => {
            el.style.transform = 'translateY(-40px)';
            el.style.opacity = '0';
        }, 50);
        setTimeout(() => {
            if (el.parentNode) {
                el.remove();
            }
        }, 1200);
    }

    showDamageEffect(mobId, damage) {
        const mob = this.client.mobs[mobId];
        if (!mob) return;

        const el = document.createElement('div');
        el.textContent = `-${damage}`;
        el.style.cssText = `
            position: absolute; 
            left: ${mob.x}px; 
            top: ${mob.y - 20}px; 
            color: #ff0000; 
            font-weight: bold; 
            font-size: 14px; 
            pointer-events: none; 
            z-index: 200; 
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            transition: all 1s ease-out;
        `;

        this.client.elements.gameWorld.appendChild(el);

        setTimeout(() => {
            el.style.transform = 'translateY(-30px)';
            el.style.opacity = '0';
        }, 50);
        setTimeout(() => {
            if (el.parentNode) {
                el.remove();
            }
        }, 1050);
    }

    showAttackEffect(x1, y1, x2, y2, type = 'default') {
    const el = document.createElement('div');

    const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    // base + optional type
    el.className = 'attack-effect';
    if (type === 'player') {
        el.classList.add('attack-effect-player');
    } else if (type === 'mob') {
        el.classList.add('attack-effect-mob');
    }

    el.style.left = `${x1}px`;
    el.style.top = `${y1}px`;
    el.style.height = `${distance}px`;
    el.style.transform = `rotate(${angle + Math.PI/2}rad)`;

    this.client.elements.gameWorld.appendChild(el);

    // cleanup sau khi animation xong
    setTimeout(() => {
        if (el.parentNode) {
            el.remove();
        }
    }, 450);
}
}

// ================== MAIN GAME CLIENT ==================
class GameClient {
    constructor() {
        this.config = GameConfig.get();
        this.playerId = null;
        this.players = {};
        this.mobs = {};
        this.mobTypes = {};
        this.map = null;
        this.playerStats = null;
        this.userToken = null;
        this.currentMapId = 'map1';
        this.playersInCurrentMap = {};

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
        this.network = new NetworkManager(this);
        this.messageHandler = new MessageHandler(this);
        this.gameLogic = new GameLogic(this);
        this.combat = new CombatSystem(this);
        this.mapSystem = new MapSystem(this);
        this.renderer = new Renderer(this);
        this.inputHandler = new InputHandler(this);
        
        // THÊM: Khởi tạo chat system
        this.chatSystem = new ChatSystem(this);

        this.startGameLoop();
    }

    // THÊM: Method để gửi tin nhắn chat
    sendMessage(message) {
        if (this.network.connected) {
            this.network.sendMessage(message);
        }
    }

    connect() {
    // THAY ĐỔI: Lấy IP từ loginServerIP trước, nếu không có mới lấy từ serverIP
    const loginServerIP = document.getElementById('loginServerIP');
    const gameServerIP = document.getElementById('serverIP');
    
    let ip = this.config.server.defaultIP;
    
    if (loginServerIP && loginServerIP.value.trim()) {
        ip = loginServerIP.value.trim();
    } else if (gameServerIP && gameServerIP.value.trim()) {
        ip = gameServerIP.value.trim();
    }
    
    const port = this.config.server.defaultPort;
    this.network.connect(ip, port);
}

// VÀ update setQuickConnect method:
setQuickConnect() {
    const loginServerIP = document.getElementById('loginServerIP');
    const gameServerIP = document.getElementById('serverIP');
    const quickIP = this.config.server.quickConnectIP;
    
    if (loginServerIP) loginServerIP.value = quickIP;
    if (gameServerIP) gameServerIP.value = quickIP;
}

    updateStatus(text, type) {
        this.elements.statusText.textContent = text;
        this.elements.statusText.className = `status-text ${type}`;
    }

    get connected() {
        return this.network.connected;
    }

    startGameLoop() {
        const gameLoop = () => {
            this.renderer.renderAll();
            requestAnimationFrame(gameLoop);
        };
        requestAnimationFrame(gameLoop);
    }

    authenticateWithServer() {
        const token = localStorage.getItem('auth_token');
        console.log('🔐 AUTH DEBUG: Token from localStorage:', token);

        if (token && this.network.connected) {
            console.log('📡 Sending auth_login to server with token:', token);
            this.userToken = token;
            this.network.sendMessage({
                type: 'auth_login',
                token: token
            });
        } else {
            console.log(
                '❌ AUTH FAILED: No token or not connected. Token:',
                token,
                'Connected:',
                this.network.connected
            );
        }
    }
    
    handleMobAttack(message) {
    // Visual effect cho mob attack
    if (this.mobs[message.mob_id]) {
        const mob = this.mobs[message.mob_id];
        const target = this.players[message.target_player_id];
        if (target) {
            this.renderer.showMobAttackEffect(mob.x, mob.y, target.x, target.y);
        }
    }
    
    // Nếu player bị tấn công là mình thì gửi take_damage
    if (message.target_player_id === this.playerId) {
        this.network.sendMessage({
            type: 'take_damage',
            damage: message.damage
        });
    }
}

handlePlayerDamaged(message) {
    // Update HP display nếu có
    if (message.player_id === this.playerId && this.playerStats) {
        this.playerStats.hp = message.current_hp;
        this.updateHPDisplay();
    }
    
    // Show damage effect
    const player = this.players[message.player_id];
    if (player) {
        this.renderer.showPlayerDamageEffect(player.x, player.y, message.damage);
    }
}

updateHPDisplay() {
    if (!this.playerStats) return;
    
    // Update HP
    const hpFill = document.getElementById('playerHPFill');
    const hpText = document.getElementById('playerHPText');
    
    if (hpFill && hpText) {
        const hpPercent = (this.playerStats.hp / this.playerStats.max_hp) * 100;
        hpFill.style.width = `${hpPercent}%`;
        hpText.textContent = `${this.playerStats.hp}/${this.playerStats.max_hp}`;
    }
    
    // Update EXP - SỬA LẠI ĐỂ TÌM THEO CLASS THAY VÌ ID
    const expFill = document.querySelector('.player-exp-fill');  // ← THAY ĐỔI
    const expText = document.querySelector('.exp-text');         // ← THAY ĐỔI
    
    if (expFill && expText && this.playerStats.expnext) {
        const expPercent = (this.playerStats.exp / this.playerStats.expnext) * 100;
        expFill.style.width = `${expPercent}%`;
        expText.textContent = `${this.playerStats.exp}/${this.playerStats.expnext}`;
        
        console.log(`EXP Updated: ${this.playerStats.exp}/${this.playerStats.expnext} (${expPercent.toFixed(1)}%)`);
        console.log('EXP Fill element:', expFill);
        console.log('EXP Text element:', expText);
    } else {
        console.log('EXP elements not found or no expnext data');
        console.log('expFill:', expFill);
        console.log('expText:', expText);
        console.log('playerStats.expnext:', this.playerStats?.expnext);
    }
}



    updatePlayerStats(stats) {
        this.playerStats = stats;
        // Cập nhật config dựa trên stats
        if (stats) {
            this.config.game.playerHp = stats.hp || 0;
            this.config.game.playerMaxHp = stats.max_hp || 0;
            this.config.game.playerDamage = stats.damage || 0;
            this.config.game.playerRange = stats.range || 0;
            this.config.game.playerAttackspeed = stats.attack_speed || 0;
        }

        // Cập nhật combat system
        if (this.combat) {
            this.combat.attackCooldown =
                this.config.game.playerAttackspeed > 0
                    ? 1000 / this.config.game.playerAttackspeed
                    : 1000;
        }
        this.updateHPDisplay();
    }
}

// ================== INITIALIZATION ==================
let gameClient;
window.addEventListener('load', () => {
    gameClient = new GameClient();
});

window.setQuickConnect = () => {
    if (gameClient) gameClient.setQuickConnect();
};
