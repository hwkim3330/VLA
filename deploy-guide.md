# Cloudflare Pages 배포 가이드

## 배포 준비 완료!

public 폴더가 Cloudflare Pages에 배포할 준비가 되었습니다.

## 배포 방법:

### 1. GitHub에 푸시 (선택사항)
```bash
git remote add origin https://github.com/[your-username]/zero-messenger.git
git push -u origin main
```

### 2. Cloudflare Pages 직접 배포

1. **Cloudflare Dashboard 접속**
   - https://dash.cloudflare.com/ 로그인
   - "Pages" 탭 클릭

2. **새 프로젝트 생성**
   - "Create a project" 클릭
   - "Upload assets" 선택 (GitHub 연결 안 해도 됨)

3. **파일 업로드**
   - `/home/kim/p2p-messenger/public` 폴더 전체 드래그&드롭
   - 또는 폴더 선택으로 public 폴더 업로드

4. **프로젝트 설정**
   - Project name: `zero-messenger` (또는 원하는 이름)
   - Production branch: 자동 설정됨

5. **배포 완료!**
   - 자동으로 `https://zero-messenger.pages.dev` 형태의 URL 제공
   - 커스텀 도메인 연결 가능

## 배포된 기능:

- ✅ 전화번호/이메일 로그인
- ✅ 애플 Liquid Glass UI
- ✅ WebRTC P2P 연결 (STUN 서버 사용)
- ✅ 종단간 암호화 (WebCrypto API)
- ✅ PWA 지원 (오프라인 작동)
- ✅ 모바일 반응형

## 주의사항:

- 서버 없이 순수 클라이언트 사이드로 작동
- WebRTC로 P2P 직접 연결
- 로컬 스토리지에 세션 저장
- 완전 분산형 아키텍처

## 업데이트 방법:

파일 수정 후 Cloudflare Pages에서 다시 업로드하면 자동 배포됩니다.