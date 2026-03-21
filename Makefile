SHELL := /bin/bash

PORT ?= 5000
NPM ?= npm

.PHONY: help dev kill-port build start prisma-migrate prisma-seed

help:
	@echo "Available targets:"
	@echo "  make dev            Kill process on PORT and run nodemon dev server"
	@echo "  make kill-port      Kill process listening on PORT (default: 5000)"
	@echo "  make build          Build TypeScript"
	@echo "  make start          Start compiled server"
	@echo "  make prisma-migrate Run Prisma migrations"
	@echo "  make prisma-seed    Seed database"
	@echo ""
	@echo "Override port with: make dev PORT=5001"

kill-port:
	@pids=""; \
	if command -v fuser >/dev/null 2>&1; then \
	  pids="$$(fuser -n tcp $(PORT) 2>/dev/null)"; \
	elif command -v lsof >/dev/null 2>&1; then \
	  pids="$$(lsof -ti tcp:$(PORT) -sTCP:LISTEN 2>/dev/null)"; \
	fi; \
	if [[ -n "$$pids" ]]; then \
	  echo "Stopping process(es) on port $(PORT): $$pids"; \
	  kill $$pids 2>/dev/null || true; \
	  sleep 1; \
	  kill -9 $$pids 2>/dev/null || true; \
	else \
	  echo "No process found on port $(PORT)"; \
	fi

dev: kill-port
	@$(NPM) run dev

build:
	@$(NPM) run build

start:
	@$(NPM) run start

prisma-migrate:
	@$(NPM) run prisma:migrate

prisma-seed:
	@$(NPM) run prisma:seed
