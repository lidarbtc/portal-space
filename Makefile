.PHONY: dev build clean test test-server

build:
	cd frontend && bun run build

dev-server:
	PORT=3001 bun --watch run server/main.ts

dev-frontend:
	cd frontend && bun run dev

test:
	cd frontend && bun run test
	bun test server/__tests__/

test-server:
	bun test server/__tests__/

clean:
	rm -rf frontend/build
