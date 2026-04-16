#!/bin/bash
set -e

make build
bun run server/main.ts &
portal expose 3000 --name "space" --discovery=true
