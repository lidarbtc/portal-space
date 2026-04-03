class LobbyScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LobbyScene' });
    }

    create() {
        // Create DOM overlay for nickname input
        let selectedAvatar = 0;

        const overlay = document.createElement('div');
        overlay.id = 'lobby-overlay';
        overlay.innerHTML = `
            <h1>Mogakko</h1>
            <p>모여서 각자 코딩 — 2D 가상 코워킹 스페이스</p>
            <div class="avatar-grid" id="avatar-grid"></div>
            <div id="nickname-form">
                <input type="text" id="nickname-input" placeholder="닉네임 입력" maxlength="20" autocomplete="off">
                <button id="join-btn">입장</button>
            </div>
            <div id="error-msg"></div>
        `;
        document.body.appendChild(overlay);

        // Create avatar previews
        const avatarGrid = document.getElementById('avatar-grid');
        const avatars = [
            { type: 'image', label: 'Gopher' },          // avatar 0: original gopher from PNG
            { type: 'canvas', body: '#4a90d9', outline: '#2c5a8a' }, // avatar 1: blue
            { type: 'canvas', body: '#5cb85c', outline: '#3a7a3a' }, // avatar 2: green
            { type: 'canvas', body: '#d94a4a', outline: '#8a2c2c' }, // avatar 3: red
        ];
        avatars.forEach((avatar, idx) => {
            const option = document.createElement('div');
            option.className = 'avatar-option' + (idx === 0 ? ' selected' : '');

            const canvas = document.createElement('canvas');
            canvas.width = 48;
            canvas.height = 48;
            const ctx = canvas.getContext('2d');

            if (avatar.type === 'image') {
                // Load gopher preview from the original sprite (first frame = front-facing)
                const img = new Image();
                img.onload = () => {
                    // Draw the first 32x32 frame scaled to 48x48
                    ctx.imageSmoothingEnabled = false;
                    ctx.drawImage(img, 0, 0, 32, 32, 8, 8, 32, 32);
                };
                img.src = 'assets/gopher.png';
            } else {
                // Draw canvas preview character
                const { body, outline } = avatar;
                ctx.fillStyle = outline;
                ctx.beginPath();
                ctx.arc(24, 16, 10, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = body;
                ctx.beginPath();
                ctx.arc(24, 16, 9, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(20, 17, 3, 3);
                ctx.fillRect(26, 17, 3, 3);
                ctx.fillStyle = outline;
                ctx.fillRect(14, 24, 20, 16);
                ctx.fillStyle = body;
                ctx.fillRect(15, 25, 18, 14);
                ctx.fillStyle = outline;
                ctx.fillRect(16, 40, 6, 6);
                ctx.fillRect(26, 40, 6, 6);
            }

            option.appendChild(canvas);
            option.addEventListener('click', () => {
                selectedAvatar = idx;
                document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
            });
            avatarGrid.appendChild(option);
        });

        const input = document.getElementById('nickname-input');
        const btn = document.getElementById('join-btn');
        const errorMsg = document.getElementById('error-msg');

        const tryJoin = async () => {
            if (btn.disabled) return;
            const nickname = input.value.trim();
            if (!nickname || nickname.length < 1) {
                errorMsg.textContent = '닉네임을 입력해주세요.';
                return;
            }
            if (nickname.length > 20) {
                errorMsg.textContent = '닉네임은 20자 이하로 입력해주세요.';
                return;
            }

            btn.disabled = true;
            btn.textContent = '접속 중...';
            errorMsg.textContent = '';

            try {
                const snapshot = await Network.connect(nickname, selectedAvatar);
                // Remove overlay
                overlay.remove();
                // Start world scene with snapshot data
                this.scene.start('WorldScene', {
                    nickname: nickname,
                    avatar: selectedAvatar,
                    players: snapshot.players || [],
                    self: snapshot.self || null
                });
            } catch (err) {
                errorMsg.textContent = err.message || '접속에 실패했습니다.';
                btn.disabled = false;
                btn.textContent = '입장';
            }
        };

        btn.addEventListener('click', tryJoin);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') tryJoin();
        });

        input.focus();
    }
}
