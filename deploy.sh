#!/bin/bash
set -e

make build
cd frontend && bun run server.ts &
portal expose 3000 --name "space" --discovery=true
