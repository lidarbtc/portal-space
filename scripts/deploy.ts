import { $ } from "bun";

// portal 바이너리 존재 여부 확인
const portalCheck = Bun.which("portal");
if (!portalCheck) {
	console.error("Error: 'portal' CLI not found. Install from https://github.com/gosuda/portal-tunnel");
	process.exit(1);
}

// 1. 빌드
console.log("[deploy] Building frontend...");
await $`cd frontend && bun run build`;

// 2. 서버 시작
console.log("[deploy] Starting server...");
const server = Bun.spawn(["bun", "run", "server/main.ts"], {
	stdout: "inherit",
	stderr: "inherit",
});

// 3. 포트 대기
console.log("[deploy] Waiting for port 3000...");
const maxRetries = 50;
for (let i = 0; i < maxRetries; i++) {
	try {
		const socket = await Bun.connect({
			hostname: "localhost",
			port: 3000,
			socket: {
				data() {},
				open(socket) {
					socket.end();
				},
				error() {},
			},
		});
		break;
	} catch {
		if (i === maxRetries - 1) {
			console.error("Error: Server did not start on port 3000");
			server.kill();
			process.exit(1);
		}
		await Bun.sleep(200);
	}
}

// 4. 터널 노출
console.log("[deploy] Exposing via portal tunnel...");
const portal = Bun.spawn(["portal", "expose", "3000", "--name", "space", "--discovery=true"], {
	stdout: "inherit",
	stderr: "inherit",
});

// SIGINT/SIGTERM 시 자식 프로세스 정리
function cleanup() {
	portal.kill();
	server.kill();
	process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

await portal.exited;
server.kill();
