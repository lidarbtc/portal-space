.PHONY: dev build clean test

# Build SvelteKit static output
build:
	cd frontend && bun run build

# Dev: Bun WS server + Vite HMR (run in separate terminals)
dev-server:
	cd frontend && PORT=3001 bun --watch run server.ts

dev-frontend:
	cd frontend && bun run dev

test:
	cd frontend && bun run test
	cd frontend && bun test src/server/storage.test.ts src/server/yjs-relay.test.ts

clean:
	rm -rf frontend/build
