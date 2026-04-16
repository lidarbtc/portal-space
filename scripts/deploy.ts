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

// 2. 기존 3000 포트 프로세스 정리
const existing = Bun.spawnSync(["lsof", "-ti:3000"]);
const pids = existing.stdout.toString().trim();
if (pids) {
	console.log(`[deploy] Killing existing processes on port 3000 (PIDs: ${pids.replace(/\n/g, ", ")})...`);
	for (const pid of pids.split("\n")) {
		try { process.kill(Number(pid), 9); } catch {}
	}
	await Bun.sleep(500);
}

// 3. 서버 시작
console.log("[deploy] Starting server...");
const server = Bun.spawn(["bun", "run", "server/main.ts"], {
	stdout: "inherit",
	stderr: "inherit",
});

// 4. 포트 대기 (서버 프로세스 생존 확인 포함)
console.log("[deploy] Waiting for port 3000...");
const maxRetries = 50;
for (let i = 0; i < maxRetries; i++) {
	if (server.exitCode !== null) {
		console.error(`Error: Server exited with code ${server.exitCode}`);
		process.exit(1);
	}
	try {
		await Bun.connect({
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

// 5. 터널 노출
console.log("[deploy] Exposing via portal tunnel...");
const portal = Bun.spawn([
	"portal", "expose", "3000",
	"--name", "space",
	"--discovery=true",
	"--relays", "https://portal.1ncursio.dev",
	"--description", "Portal Space — 2D pixel co-coding space",
	"--tags", "collab,portal-space",
	"--owner", "Portal Space",
	"--thumbnail", "https://space.portal.1ncursio.dev/assets/og-image.jpg",
	"--identity-path", "identity.json",
], {
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
