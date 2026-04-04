.PHONY: dev build clean

# Build SvelteKit, then Go binary
build:
	cd frontend && bun run build
	go build -o portal-space .

# Dev: run Go backend + Vite dev server (run in separate terminals)
dev-go:
	go run . --port 3000

dev-frontend:
	cd frontend && bun run dev

clean:
	rm -rf static/_app static/index.html static/favicon.ico static/env.js
	rm -f portal-space
