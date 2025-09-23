#!/bin/bash

echo "
╔══════════════════════════════════════════╗
║       P2P Messenger - 분산형 메시징        ║
╠══════════════════════════════════════════╣
║  종단간 암호화 + 노드 보상 시스템          ║
╚══════════════════════════════════════════╝
"

# Kill any existing processes on ports
fuser -k 8080/tcp 2>/dev/null
fuser -k 3000/tcp 2>/dev/null

# Start node server
echo "🚀 노드 서버 시작 중..."
npm run start-node &
NODE_PID=$!

sleep 2

# Start client server
echo "🌐 웹 클라이언트 시작 중..."
cd client && python3 -m http.server 3000 &
CLIENT_PID=$!

sleep 1

echo "
✅ 시스템 준비 완료!

📍 노드 서버: http://localhost:8080
📍 웹 클라이언트: http://localhost:3000
📊 노드 API: http://localhost:8080/api/node/info

브라우저에서 http://localhost:3000 접속하세요.
종료하려면 Ctrl+C를 누르세요.
"

# Open browser
if command -v xdg-open > /dev/null; then
    xdg-open http://localhost:3000
elif command -v open > /dev/null; then
    open http://localhost:3000
fi

# Wait for interruption
trap "kill $NODE_PID $CLIENT_PID 2>/dev/null; exit" INT
wait