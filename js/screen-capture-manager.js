/**
 * 화면 캡처 매니저
 * 학생 화면을 주기적으로 캡처하여 교사에게 전송
 */
import { CONFIG } from './config.js';

class ScreenCaptureManager {
  constructor() {
    this.displayStream = null;
    this.captureInterval = null;
    this.isCapturing = false;
    this.onThumbnailReady = null;
    this.canvas = null;
    this.ctx = null;
    
    // 설정
    this.captureIntervalMs = 10000; // 10초
    this.thumbnailWidth = 320;      // 썸네일 너비
    this.thumbnailQuality = 0.6;    // JPEG 품질 (0-1)
  }

  /**
   * 화면 공유 시작
   * @returns {Promise<boolean>} 성공 여부
   */
  async startCapture() {
    try {
      // 화면 공유 권한 요청
      this.displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'never',
          displaySurface: 'monitor'
        },
        audio: false
      });

      // 사용자가 공유 중지 시 처리
      this.displayStream.getVideoTracks()[0].onended = () => {
        console.log('[ScreenCapture] 사용자가 화면 공유 중지');
        this.stopCapture();
      };

      // 캔버스 초기화
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');

      this.isCapturing = true;
      console.log('[ScreenCapture] 화면 캡처 시작');

      // 주기적 캡처 시작
      this.startPeriodicCapture();

      return true;
    } catch (err) {
      console.error('[ScreenCapture] 화면 공유 실패:', err);
      return false;
    }
  }

  /**
   * 화면 캡처 중지
   */
  stopCapture() {
    this.isCapturing = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    if (this.displayStream) {
      this.displayStream.getTracks().forEach(track => track.stop());
      this.displayStream = null;
    }

    this.canvas = null;
    this.ctx = null;

    console.log('[ScreenCapture] 화면 캡처 중지');
  }

  /**
   * 주기적 캡처 시작
   */
  startPeriodicCapture() {
    // 즉시 한 번 캡처
    this.captureAndSend();

    // 주기적 캡처
    this.captureInterval = setInterval(() => {
      this.captureAndSend();
    }, this.captureIntervalMs);
  }

  /**
   * 캡처 후 전송
   */
  async captureAndSend() {
    if (!this.isCapturing || !this.displayStream) return;

    try {
      const thumbnail = await this.captureThumbnail();
      if (thumbnail && this.onThumbnailReady) {
        this.onThumbnailReady(thumbnail);
      }
    } catch (err) {
      console.error('[ScreenCapture] 캡처 실패:', err);
    }
  }

  /**
   * 썸네일 캡처
   * @returns {Promise<string>} Base64 인코딩된 이미지
   */
  async captureThumbnail() {
    if (!this.displayStream || !this.canvas || !this.ctx) return null;

    const videoTrack = this.displayStream.getVideoTracks()[0];
    if (!videoTrack) return null;

    // ImageCapture API 사용 (지원되는 경우)
    if (typeof ImageCapture !== 'undefined') {
      try {
        const imageCapture = new ImageCapture(videoTrack);
        const bitmap = await imageCapture.grabFrame();
        
        // 비율 유지하며 리사이즈
        const ratio = bitmap.height / bitmap.width;
        this.canvas.width = this.thumbnailWidth;
        this.canvas.height = Math.round(this.thumbnailWidth * ratio);
        
        this.ctx.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
        bitmap.close();
        
        return this.canvas.toDataURL('image/jpeg', this.thumbnailQuality);
      } catch (e) {
        console.warn('[ScreenCapture] ImageCapture 실패, video 방식 사용:', e);
      }
    }

    // 대체 방법: video 요소 사용
    return this.captureViaVideo();
  }

  /**
   * Video 요소를 통한 캡처 (대체 방법)
   */
  captureViaVideo() {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.srcObject = this.displayStream;
      video.muted = true;
      
      video.onloadedmetadata = () => {
        video.play().then(() => {
          // 비율 유지하며 리사이즈
          const ratio = video.videoHeight / video.videoWidth;
          this.canvas.width = this.thumbnailWidth;
          this.canvas.height = Math.round(this.thumbnailWidth * ratio);
          
          this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
          
          video.pause();
          video.srcObject = null;
          
          resolve(this.canvas.toDataURL('image/jpeg', this.thumbnailQuality));
        });
      };
      
      video.onerror = () => {
        resolve(null);
      };
    });
  }

  /**
   * 캡처 상태 확인
   */
  isActive() {
    return this.isCapturing && this.displayStream !== null;
  }

  /**
   * 썸네일 콜백 설정
   */
  setOnThumbnailReady(callback) {
    this.onThumbnailReady = callback;
  }

  /**
   * 캡처 간격 설정
   */
  setCaptureInterval(ms) {
    this.captureIntervalMs = ms;
    
    // 이미 캡처 중이면 재시작
    if (this.isCapturing && this.captureInterval) {
      clearInterval(this.captureInterval);
      this.startPeriodicCapture();
    }
  }
}

export { ScreenCaptureManager };
