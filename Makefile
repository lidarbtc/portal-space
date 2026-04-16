.PHONY: dev build clean test

# Build SvelteKit, then Go binary
build:
	cd frontend && bun run build
	go build -o portal-space .

# Dev: run Go backend + Vite dev server (run in separate terminals)
dev-go:
	go run . --port 3001

dev-frontend:
	cd frontend && bun run dev

test:
	go test ./...
	cd frontend && bun run test

clean:
	rm -rf static/_app static/index.html static/favicon.ico static/env.js
	rm -f portal-space
