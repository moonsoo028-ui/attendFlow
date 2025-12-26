/**
 * 집중도 분석기
 * MediaPipe Pose 데이터를 활용한 집중도 측정
 * (Face Mesh 없이 Pose 랜드마크만 사용)
 */
import { CONFIG, FOCUS_LEVEL } from './config.js';

class FocusAnalyzer {
  constructor() {
    this.isInitialized = false;
    this.focusScore = 100;
    this.focusHistory = [];
    this.lastAnalysis = {
      headDown: false,
      lookingAway: false,
      present: true
    };
    this.onFocusChange = null;
    this.analysisInterval = null;
    
    // 분석 데이터 누적
    this.frameData = {
      headDownFrames: 0,
      lookingAwayFrames: 0,
      notPresentFrames: 0,
      totalFrames: 0
    };
  }

  async init(videoElement) {
    this.videoElement = videoElement;
    this.isInitialized = true;
    console.log('[FocusAnalyzer] 초기화 완료 (Pose 기반 분석)');
    
    // 주기적 집중도 계산 시작
    this.startAnalysis();
  }

  startAnalysis() {
    // 1초마다 집중도 점수 계산 및 전송
    this.analysisInterval = setInterval(() => {
      this.calculateFocusScore();
    }, CONFIG.focus.updateInterval);
  }

  stopAnalysis() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  /**
   * 비디오 프레임 분석 (사용 안함 - Pose 데이터로 대체)
   */
  async analyzeFrame() {
    // Face Mesh 제거됨 - analyzePoseLandmarks에서 처리
  }

  /**
   * 자리비움 상태 설정 (PoseAnalyzer에서 호출)
   */
  setAway(isAway) {
    if (isAway) {
      // 자리비움이면 집중도 0
      this.focusScore = 0;
      this.lastAnalysis.present = false;
      
      if (this.onFocusChange) {
        this.onFocusChange(this.getFocusData());
      }
    }
  }

  /**
   * Pose 랜드마크로 집중도 분석
   */
  analyzePoseLandmarks(landmarks) {
    if (!landmarks || !this.isInitialized) return;
    
    this.frameData.totalFrames++;
    
    // 주요 랜드마크
    const nose = landmarks[0];
    const leftEye = landmarks[2];
    const rightEye = landmarks[5];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    
    // 어깨 중심 계산 (기준점)
    const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2;
    
    // 1. 고개 숙임 감지
    const noseToShoulderDist = shoulderCenterY - nose.y;
    
    // 2. 옆 보기 감지 - 코가 어깨 중심에서 벗어난 정도
    const noseOffsetX = Math.abs(nose.x - shoulderCenterX);
    
    // 3. 귀 visibility 차이
    const leftEarVis = leftEar.visibility || 0;
    const rightEarVis = rightEar.visibility || 0;
    const earDiff = Math.abs(leftEarVis - rightEarVis);
    
    // 4. 눈 위치 차이 (고개 기울임)
    const eyeYDiff = Math.abs((leftEye.y || 0) - (rightEye.y || 0));
    
    // 5. 어깨 기울기
    const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y);
    
    // 디버그: 10프레임마다 값 출력
    if (this.frameData.totalFrames % 10 === 1) {
      console.log('[Focus Debug] nose-shoulder:', noseToShoulderDist.toFixed(3), 
                  '| noseOffsetX:', noseOffsetX.toFixed(3),
                  '| earDiff:', earDiff.toFixed(3),
                  '| eyeYDiff:', eyeYDiff.toFixed(3));
    }
    
    // === 집중도 감점 판단 ===
    
    // 고개 숙임 (코-어깨 거리가 작아짐)
    if (noseToShoulderDist < 0.15) {
      this.frameData.headDownFrames++;
      this.lastAnalysis.headDown = true;
    } else {
      this.lastAnalysis.headDown = false;
    }
    
    // 옆 보기 판단 (여러 조건 OR)
    const isLookingAway = 
      noseOffsetX > 0.08 ||      // 코가 중심에서 벗어남
      earDiff > 0.2 ||           // 귀 visibility 차이
      eyeYDiff > 0.03;           // 눈 높이 차이 (고개 기울임)
    
    if (isLookingAway) {
      this.frameData.lookingAwayFrames++;
      this.lastAnalysis.lookingAway = true;
    } else {
      this.lastAnalysis.lookingAway = false;
    }
    
    // 어깨 기울기 (자세 불량)
    if (shoulderTilt > 0.04) {
      this.frameData.headDownFrames += 0.3;
    }
    
    // 존재 여부
    const noseVis = nose.visibility || 0;
    const leftEyeVis = leftEye.visibility || 0;
    const rightEyeVis = rightEye.visibility || 0;
    
    const faceVisible = noseVis > 0.5 && (leftEyeVis > 0.3 || rightEyeVis > 0.3);
    if (!faceVisible) {
      this.frameData.notPresentFrames++;
      this.lastAnalysis.present = false;
    } else {
      this.lastAnalysis.present = true;
    }
  }

  /**
   * 집중도 점수 계산 (0-100)
   */
  calculateFocusScore() {
    console.log('[FocusAnalyzer] 점수 계산 - totalFrames:', this.frameData.totalFrames);
    
    if (this.frameData.totalFrames === 0) {
      // 프레임이 없으면 점수 감소 (자리비움 가능성)
      this.focusScore = Math.max(0, this.focusScore - 20);
      this.lastAnalysis.present = false;
      
      if (this.onFocusChange) {
        this.onFocusChange(this.getFocusData());
      }
      return;
    }
    
    // 프레임이 있으면 존재함
    this.lastAnalysis.present = true;
    
    const weights = CONFIG.focus.weights;
    
    // 각 요소별 점수 계산 (0-100)
    const headScore = 100 - (this.frameData.headDownFrames / this.frameData.totalFrames * 100);
    const gazeScore = 100 - (this.frameData.lookingAwayFrames / this.frameData.totalFrames * 100);
    const presenceScore = 100 - (this.frameData.notPresentFrames / this.frameData.totalFrames * 100);
    
    // 가중 평균
    this.focusScore = Math.round(
      headScore * weights.headPosition +
      gazeScore * weights.gazeDirection +
      presenceScore * weights.presence
    );
    
    // 0-100 범위로 제한
    this.focusScore = Math.max(0, Math.min(100, this.focusScore));
    
    console.log('[FocusAnalyzer] 점수:', this.focusScore, '| head:', Math.round(headScore), '| gaze:', Math.round(gazeScore), '| presence:', Math.round(presenceScore));
    
    // 히스토리에 추가
    this.focusHistory.push({
      score: this.focusScore,
      timestamp: Date.now(),
      details: {
        headScore: Math.round(headScore),
        gazeScore: Math.round(gazeScore),
        presenceScore: Math.round(presenceScore)
      }
    });
    
    // 히스토리 길이 제한
    if (this.focusHistory.length > CONFIG.focus.historyLength) {
      this.focusHistory.shift();
    }
    
    // 프레임 데이터 리셋
    this.frameData = {
      headDownFrames: 0,
      lookingAwayFrames: 0,
      notPresentFrames: 0,
      totalFrames: 0
    };
    
    // 콜백 호출
    if (this.onFocusChange) {
      this.onFocusChange(this.getFocusData());
    }
  }

  /**
   * 집중도 레벨 반환
   */
  getFocusLevel() {
    if (this.focusScore >= 80) return FOCUS_LEVEL.HIGH;
    if (this.focusScore >= 50) return FOCUS_LEVEL.MEDIUM;
    if (this.focusScore >= 30) return FOCUS_LEVEL.LOW;
    return FOCUS_LEVEL.VERY_LOW;
  }

  /**
   * 전송용 집중도 데이터
   */
  getFocusData() {
    return {
      score: this.focusScore,
      level: this.getFocusLevel(),
      history: this.focusHistory.slice(-30), // 최근 30초
      current: this.lastAnalysis
    };
  }

  setOnFocusChange(callback) {
    this.onFocusChange = callback;
  }

  stop() {
    this.stopAnalysis();
    this.focusHistory = [];
    this.focusScore = 100;
    this.isInitialized = false;
  }
}

export { FocusAnalyzer };
