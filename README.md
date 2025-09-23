# P2P Messenger - 분산형 메시징 시스템

카카오톡을 대체하는 완전 분산형 P2P 메시징 시스템입니다.

## 특징

- 🔐 **종단간 암호화**: RSA + AES 하이브리드 암호화
- 💰 **노드 보상 시스템**: 메시지 중계시 토큰 보상
- 🌐 **완전 분산형**: 중앙 서버 없는 P2P 네트워크
- 🎨 **글래스모피즘 UI**: 애플 스타일 모던 디자인
- 💬 **실시간 메시징**: WebSocket 기반 즉시 전송
- 👥 **그룹 채팅**: 다수 사용자 동시 대화

## 빠른 시작

```bash
# 의존성 설치
npm install

# 실행
./start.sh

# 또는 개별 실행
npm run start-node      # 노드 서버
npm run start-client    # 웹 클라이언트
```

## 사용 방법

1. 브라우저에서 http://localhost:3000 접속
2. 사용자 이름 입력 후 연결
3. 새 채팅 시작 (Ctrl+N) 또는 그룹 생성 (Ctrl+G)
4. 메시지 전송 및 수신

## 노드 운영

노드를 운영하면 메시지 중계로 토큰 보상을 받습니다:

```bash
PORT=8081 npm run start-node  # 다른 포트에서 추가 노드 실행
```

## 아키텍처

- **노드 서버**: Express + Socket.IO
- **클라이언트**: Vanilla JS + WebCrypto API
- **암호화**: RSA-OAEP + AES-GCM
- **UI**: CSS Glass Morphism

## 보안

- 모든 메시지는 종단간 암호화
- 노드는 암호화된 메시지만 중계
- 개인키는 클라이언트에만 저장

## 키보드 단축키

- `Ctrl+N`: 새 채팅
- `Ctrl+G`: 새 그룹
- `Ctrl+I`: 노드 통계
- `Enter`: 메시지 전송

## API

노드 정보 확인:
```
GET http://localhost:8080/api/node/info
```

## 라이선스

MIT