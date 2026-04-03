class LobbyScene extends Phaser.Scene {
    constructor() {
        super({ key: 'LobbyScene' });
    }

    create() {
        // Create DOM overlay for nickname input
        const overlay = document.createElement('div');
        overlay.id = 'lobby-overlay';
        overlay.innerHTML = `
            <h1>Mogakko</h1>
            <p>모여서 각자 코딩 — 2D 가상 코워킹 스페이스</p>
            <div id="nickname-form">
                <input type="text" id="nickname-input" placeholder="닉네임 입력" maxlength="20" autocomplete="off">
                <button id="join-btn">입장</button>
            </div>
            <div id="error-msg"></div>
        `;
        document.body.appendChild(overlay);

        const input = document.getElementById('nickname-input');
        const btn = document.getElementById('join-btn');
        const errorMsg = document.getElementById('error-msg');

        const tryJoin = async () => {
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
                const snapshot = await Network.connect(nickname);
                // Remove overlay
                overlay.remove();
                // Start world scene with snapshot data
                this.scene.start('WorldScene', {
                    nickname: nickname,
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
