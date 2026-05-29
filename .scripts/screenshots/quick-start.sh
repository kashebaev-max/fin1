#!/bin/bash

# 🚀 Быстрый старт генерации скриншотов
# Использование: ./quick-start.sh

set -e

cd "$(dirname "$0")"

echo ""
echo "═══════════════════════════════════════════"
echo "  📸 Finstat Screenshot Generator"
echo "  🚀 Quick Start Script"
echo "═══════════════════════════════════════════"
echo ""

# Проверка node
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен"
    echo "Установите: https://nodejs.org"
    exit 1
fi

echo "✅ Node.js: $(node --version)"
echo ""

# Установка зависимостей если нужно
if [ ! -d "node_modules" ]; then
    echo "📦 Устанавливаю зависимости..."
    npm install
    echo ""
fi

# Установка браузера если нужно
if [ ! -d "$HOME/.cache/ms-playwright" ] && [ ! -d "node_modules/.cache/ms-playwright" ]; then
    echo "🌐 Устанавливаю Chromium для Playwright..."
    npx playwright install chromium
    echo ""
fi

# Проверяем что есть переменные окружения
if [ -z "$TEST_EMAIL" ] || [ -z "$TEST_PASSWORD" ]; then
    echo "⚠ Не указаны TEST_EMAIL и TEST_PASSWORD"
    echo ""
    echo "Запустите с переменными:"
    echo "  TEST_EMAIL=your@email.com TEST_PASSWORD=YourPass ./quick-start.sh"
    echo ""
    echo "Или измените их прямо в файле generate-screenshots.js"
    echo ""
    read -p "Продолжить с дефолтными значениями? (y/N): " confirm
    if [ "$confirm" != "y" ]; then
        exit 0
    fi
fi

# Запуск
echo ""
echo "▶ Запускаю генератор скриншотов..."
echo ""

node generate-screenshots.js

echo ""
echo "✅ Готово!"
echo ""
echo "Следующие шаги:"
echo "  1. Проверьте скриншоты в public/help/"
echo "  2. Закоммитьте: git add public/help/ && git commit -m 'feat: скриншоты' && git push"
echo ""
