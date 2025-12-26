# 학생 모니터링 시스템

MediaPipe Pose + PeerJS 기반 실시간 학생 자세 모니터링 시스템

## 특징

- ✅ **100% 무료** - 유료 서비스 없음
- ✅ **서버 불필요** - P2P 통신 (PeerJS 공식 서버 사용)
- ✅ **분산 처리** - 각 학생 PC에서 자체 분석
- ✅ **실시간 모니터링** - 서있음/앉음/자리비움 감지
- ✅ **확장 가능** - MySQL 연동 준비됨

## 아키텍처

```
[학생 브라우저 x N]
├─ 카메라 접근 (getUserMedia)
├─ MediaPipe Pose (로컬 WASM 분석)
├─ 상태 판단 (서있음/앉음/자리비움/손들기)
└─ PeerJS DataChannel로 JSON 전송
        ↓ (P2P, 영상 전송 없음)
[교사 브라우저]
├─ 상태 수신 (JSON만)
├─ 대시보드 렌더링
└─ 자리비움 알림
```

## 사용 방법

### 1. 실행

로컬 서버로 실행 (HTTPS 필요 없음, localhost는 카메라 접근 허용):

```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code Live Server 확장 사용
```

브라우저에서 `http://localhost:8080` 접속

### 2. 교사

1. `교사` 버튼 클릭
2. `서버 시작` 클릭
3. 표시된 **교사 ID**를 학생들에게 공유

### 3. 학생

1. `학생` 버튼 클릭
2. 이름 입력
3. 교사에게 받은 **교사 ID** 입력
4. `카메라 시작 & 연결` 클릭
5. 카메라 권한 허용

## 상태 판단 기준

| 상태 | 조건 |
|------|------|
| 서있음 | 상체-하체 비율 < 0.4, 코 위치 상단 |
| 앉아있음 | 상체-하체 비율 > 0.6, 코 위치 중앙 |
| 자리비움 | 10프레임 이상 사람 미감지 |

## 알림 설정

- 1분 자리비움: ⚠️ 경고 알림
- 3분 자리비움: 🚨 심각 알림

`js/config.js`에서 수정 가능

## 확장 (MySQL 연동)

`js/config.js`의 `api` 설정 활성화 후 백엔드 서버 구현:

```javascript
api: {
  enabled: true,
  baseUrl: 'http://localhost:3000/api',
  endpoints: {
    status: '/status',
    history: '/history',
    alerts: '/alerts'
  }
}
```

## 기술 스택

- **MediaPipe Pose** - Google 오픈소스 포즈 추정
- **PeerJS** - WebRTC P2P 통신 래퍼
- **Vanilla JS** - 프레임워크 없음

## 브라우저 지원

- Chrome 80+
- Firefox 75+
- Edge 80+
- Safari 14+ (일부 제한)

## 라이선스

MIT License
