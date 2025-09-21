class LoginSystem {
    constructor() {
        this.currentUser = null;
        this.init();
    }

    init() {
        // Kiểm tra token có sẵn
        const existingToken = localStorage.getItem('auth_token');
        const existingUser = localStorage.getItem('gameUser');
        
        if (existingToken && existingUser) {
            try {
                this.currentUser = JSON.parse(existingUser);
                console.log('🔐 FOUND EXISTING TOKEN:', existingToken);
                console.log('👤 FOUND EXISTING USER:', this.currentUser);
                this.showGameUI();
                return;
            } catch (e) {
                // Invalid stored data, clear it
                localStorage.removeItem('auth_token');
                localStorage.removeItem('gameUser');
            }
        }
        
        // No valid token found, show login
        this.showLoginUI();
        this.currentUser = null;
    }

    showLoginUI() {
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('connectionForm').classList.add('hidden');
        
        // Ẩn nút logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.style.display = 'none';
        
        // Clear current user info
        this.updateUserInfo();
    }

    showGameUI() {
        document.getElementById('loginForm').classList.add('hidden');
        // Chỉ hiện connectionForm nếu chưa connected
        if (!window.gameClient || !window.gameClient.connected) {
            document.getElementById('connectionForm').classList.remove('hidden');
        }
        
        // Hiện nút logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.style.display = 'block';
        
        if (this.currentUser) {
            const nameField = document.getElementById('playerName');
            if (nameField) {
                nameField.value = this.currentUser.username;
                nameField.readOnly = true;
            }
        }
        
        // Copy server IP từ login sang connection form
        this.copyServerIPToGameForm();
        
        // Update user info display
        this.updateUserInfo();
    }

    copyServerIPToGameForm() {
        const loginServerIP = document.getElementById('loginServerIP');
        const gameServerIP = document.getElementById('serverIP');
        
        if (loginServerIP && gameServerIP) {
            gameServerIP.value = loginServerIP.value;
        }
    }

    updateUserInfo() {
        const currentUserEl = document.getElementById('currentUser');
        if (currentUserEl) {
            if (this.currentUser) {
                currentUserEl.textContent = `Đăng nhập: ${this.currentUser.username}`;
                currentUserEl.style.display = 'block';
            } else {
                currentUserEl.textContent = '';
                currentUserEl.style.display = 'none';
            }
        }
    }

    toggleMode() {
        const form = document.getElementById('loginForm');
        const isLogin = form.dataset.mode === 'login';
        
        form.dataset.mode = isLogin ? 'register' : 'login';
        document.getElementById('loginTitle').textContent = isLogin ? 'Đăng Ký' : 'Đăng Nhập';
        document.getElementById('confirmPassGroup').classList.toggle('hidden', !isLogin);
        document.getElementById('loginBtn').textContent = isLogin ? 'Đăng Ký' : 'Đăng Nhập';
        document.getElementById('switchBtn').textContent = isLogin ? 'Đã có tài khoản?' : 'Chưa có tài khoản?';
        
        this.clearInputs();
    }

    clearInputs() {
        ['loginUsername', 'loginPassword', 'confirmPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        this.clearError();
    }

    showError(msg) {
        const err = document.getElementById('loginError');
        err.textContent = msg;
        err.classList.remove('hidden');
    }

    clearError() {
        document.getElementById('loginError').classList.add('hidden');
    }

    validateInput() {
        const serverIP = document.getElementById('loginServerIP').value.trim();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const isRegister = document.getElementById('loginForm').dataset.mode === 'register';
        
        if (!serverIP) {
            this.showError('Vui lòng nhập Server IP');
            return false;
        }
        if (!username || username.length < 3) {
            this.showError('Tên đăng nhập cần ít nhất 3 ký tự');
            return false;
        }
        if (!password || password.length < 4) {
            this.showError('Mật khẩu cần ít nhất 4 ký tự');
            return false;
        }
        if (isRegister) {
            const confirm = document.getElementById('confirmPassword').value;
            if (password !== confirm) {
                this.showError('Mật khẩu xác nhận không khớp');
                return false;
            }
        }
        
        this.clearError();
        return true;
    }

    async submitForm() {
        if (!this.validateInput()) return;
        
        const serverIP = document.getElementById('loginServerIP').value.trim();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const isRegister = document.getElementById('loginForm').dataset.mode === 'register';
        
        try {
            const authPort = window.GameConfig?.get().server.defaultPort + 1 || 8890;
            const response = await fetch(`http://${serverIP}:${authPort}/auth`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    action: isRegister ? 'register' : 'login',
                    username,
                    password
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                if (isRegister) {
                    this.toggleMode();
                    this.showError('Đăng ký thành công! Hãy đăng nhập.');
                    this.clearInputs();
                } else {
                    // Login thành công - LƯU TOKEN VÀO localStorage
                    this.currentUser = {username, token: result.token};
                    
                    // QUAN TRỌNG: Lưu token để game client sử dụng
                    localStorage.setItem('auth_token', result.token);
                    localStorage.setItem('gameUser', JSON.stringify(this.currentUser));
                    
                    console.log('✅ LOGIN SUCCESS: Token saved to localStorage:', result.token);
                    
                    this.showGameUI();
                }
            } else {
                this.showError(result.message);
            }
        } catch (error) {
            this.showError('Lỗi kết nối server auth');
            console.error('Auth error:', error);
        }
    }

    logout() {
        // Confirm logout
        if (!confirm(`Bạn có chắc muốn đăng xuất khỏi tài khoản "${this.currentUser?.username || 'hiện tại'}"?`)) {
            return;
        }
        
        this.currentUser = null;
        
        // Xóa tất cả tokens
        localStorage.removeItem('gameUser');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('gameAccounts');
        
        console.log('🚪 LOGOUT: All tokens cleared');
        
        // Disconnect game if connected
        if (window.gameClient && window.gameClient.connected) {
            window.gameClient.network.socket.close();
        }
        
        this.showLoginUI();
    }
}

// Initialize
let loginSystem;
window.addEventListener('DOMContentLoaded', () => {
    loginSystem = new LoginSystem();
});

window.toggleLoginMode = () => loginSystem.toggleMode();
window.submitLogin = () => loginSystem.submitForm();
window.logout = () => loginSystem.logout();

// THÊM FUNCTION CHO NÚT AUTO SERVER
window.setQuickLoginServer = () => {
    const loginServerIP = document.getElementById('loginServerIP');
    if (loginServerIP) {
        loginServerIP.value = '10.144.237.166'; // Hoặc IP server của bạn
    }
};