/**
 * 설정 파일 - 나중에 MySQL 연동 시 확장 가능
 */
const CONFIG = {
  // PeerJS 설정 (무료 공식 서버 사용)
  peer: {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
    debug: 1
  },

  // 상태 전송 간격 (ms)
  statusInterval: 1500,

  // 자리비움 판단 시간 (초)
  awayThreshold: 30,

  // 알림 설정
  alerts: {
    awayWarning: 60,      // 1분 자리비움 시 경고
    awayCritical: 180     // 3분 자리비움 시 심각
  },

  // 포즈 분석 설정
  pose: {
    minConfidence: 0.5,   // 최소 신뢰도
    standingRatio: 0.6,   // 서있음 판단 비율
    sittingRatio: 0.4     // 앉음 판단 비율
  },

  // 집중도 분석 설정
  focus: {
    headDownThreshold: 0.15,    // 고개 숙임 판단 (코-어깨 거리 비율)
    gazeDeviationThreshold: 0.2, // 시선 이탈 판단 (눈 위치 편차)
    updateInterval: 1000,        // 집중도 업데이트 간격 (ms)
    historyLength: 300,          // 집중도 히스토리 길이 (5분 = 300초)
    weights: {
      headPosition: 0.4,         // 고개 위치 가중치
      gazeDirection: 0.4,        // 시선 방향 가중치
      presence: 0.2              // 존재 여부 가중치
    }
  },

  // 나중에 백엔드 연동 시 사용
  api: {
    enabled: false,
    baseUrl: 'http://localhost:3000/api',
    endpoints: {
      status: '/status',
      history: '/history',
      alerts: '/alerts',
      attendance: '/attendance'
    }
  },

  // 출석 관리 설정
  attendance: {
    storageType: 'localStorage', // 'localStorage' 또는 'mysql'
    autoCheckIn: true,           // 접속 시 자동 출석 체크
    lateThreshold: 10 * 60 * 1000 // 지각 기준 (10분, ms)
  },

  // 수업 시간 설정
  classTime: {
    lessonDuration: 50,    // 수업 시간 (분)
    breakDuration: 10,     // 쉬는 시간 (분)
    autoStart: true,       // 서버 시작 시 자동으로 수업 시작
    notifyBeforeBreak: 1,  // 쉬는 시간 N분 전 알림
    notifyBeforeLesson: 1  // 수업 시작 N분 전 알림
  }
};

// 상태 타입 정의
const STATUS = {
  STANDING: 'standing',
  SITTING: 'sitting',
  AWAY: 'away',
  UNKNOWN: 'unknown',
  NO_RESPONSE: 'no_response',
  DISCONNECTED: 'disconnected',
  HAND_RAISED: 'hand_raised'
};

// 상태 한글 표시
const STATUS_LABEL = {
  standing: '서있음',
  sitting: '앉아있음',
  away: '자리비움',
  unknown: '감지중...',
  no_response: '응답없음',
  disconnected: '연결끊김',
  hand_raised: '손들기 ✋'
};

// 상태 색상
const STATUS_COLOR = {
  standing: '#4CAF50',
  sitting: '#2196F3',
  away: '#f44336',
  unknown: '#9E9E9E',
  no_response: '#ff9800',
  disconnected: '#795548',
  hand_raised: '#9C27B0'
};

// 응답없음 판단 시간 (초)
const NO_RESPONSE_THRESHOLD = 10;

// 집중도 레벨
const FOCUS_LEVEL = {
  HIGH: 'high',       // 80% 이상
  MEDIUM: 'medium',   // 50-80%
  LOW: 'low',         // 30-50%
  VERY_LOW: 'very_low' // 30% 미만
};

const FOCUS_LABEL = {
  high: '집중',
  medium: '보통',
  low: '주의',
  very_low: '경고'
};

const FOCUS_COLOR = {
  high: '#10B981',
  medium: '#F59E0B', 
  low: '#F97316',
  very_low: '#EF4444'
};

// 수업 상태
const CLASS_MODE = {
  LESSON: 'lesson',     // 수업 중
  BREAK: 'break',       // 쉬는 시간
  STOPPED: 'stopped'    // 정지
};

const CLASS_MODE_LABEL = {
  lesson: '수업 중',
  break: '쉬는 시간',
  stopped: '정지'
};

export { 
  CONFIG, 
  STATUS, 
  STATUS_LABEL, 
  STATUS_COLOR, 
  NO_RESPONSE_THRESHOLD, 
  FOCUS_LEVEL, 
  FOCUS_LABEL, 
  FOCUS_COLOR, 
  CLASS_MODE, 
  CLASS_MODE_LABEL 
};
