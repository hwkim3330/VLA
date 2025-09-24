# 🚀 간단 배포 방법들

## 1. GitHub Pages (가장 쉬움)
```bash
# 이미 GitHub에 푸시됨: https://github.com/hwkim3330/VLA
# Settings → Pages → Source: Deploy from a branch
# Branch: main, Folder: /public
# URL: https://hwkim3330.github.io/VLA
```

## 2. Vercel (드래그앤드롭)
1. https://vercel.com 접속
2. public 폴더 드래그앤드롭
3. 바로 배포 완료!

## 3. Netlify (드래그앤드롭)
1. https://app.netlify.com/drop 접속
2. public 폴더 드래그앤드롭
3. 즉시 URL 생성!

## 4. Surge.sh (터미널 한줄)
```bash
npm install -g surge
cd public
surge
# 이메일 입력 → 도메인 선택 → 완료!
```

## 5. 로컬에서 바로 사용
```bash
# 이미 실행 중!
http://localhost:3001
```

## 📁 필요한 파일들 (public 폴더)
- index.html
- app.js
- manifest.json
- _redirects

위 4개 파일만 있으면 어디든 배포 가능!