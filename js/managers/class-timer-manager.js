/**
 * 수업 타이머 관리 모듈
 * - 수업/쉬는시간 타이머
 * - 모드 전환
 * - 학생 알림
 */
import { CONFIG, CLASS_MODE, CLASS_MODE_LABEL } from '../config.js';

export class ClassTimerManager {
  constructor(options = {}) {
    this.classMode = CLASS_MODE.STOPPED;
    this.classTimerInterval = null;
    this.remainingSeconds = 0;
    this.lessonDuration = CONFIG.classTime.lessonDuration;
    this.breakDuration = CONFIG.classTime.breakDuration;
    this.lessonCount = 0;
    this.notifiedBeforeEnd = false;
    
    this.elements = options.elements || {};
    this.onAlert = options.onAlert || (() => {});
    this.onPlaySound = options.onPlaySound || (() => {});
    this.onBroadcast = options.onBroadcast || (() => {});
    this.onNotifyModeChange = options.onNotifyModeChange || (() => {});
    
    this.loadSettings();
  }

  /**
   * 설정 불러오기
   */
  loadSettings() {
    const saved = localStorage.getItem('classTimeSettings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        this.lessonDuration = settings.lessonDuration || CONFIG.classTime.lessonDuration;
        this.breakDuration = settings.breakDuration || CONFIG.classTime.breakDuration;
      } catch (e) {
        console.error('[ClassTimerManager] 설정 로드 실패:', e);
      }
    }
  }

  /**
   * 설정 저장
   */
  saveSettings() {
    localStorage.setItem('classTimeSettings', JSON.stringify({
      lessonDuration: this.lessonDuration,
      breakDuration: this.breakDuration
    }));
  }

  /**
   * 타이머 시작
   */
  start() {
    if (this.classTimerInterval) {
      clearInterval(this.classTimerInterval);
    }
    
    this.classMode = CLASS_MODE.LESSON;
    this.lessonCount = 1;
    this.remainingSeconds = this.lessonDuration * 60;
    this.notifiedBeforeEnd = false;
    
    this.updateUI();
    this.notifyModeChange();
    
    this.classTimerInterval = setInterval(() => {
      this.tick();
    }, 1000);
    
    this.onAlert(`📚 ${this.lessonCount}교시 수업이 시작되었습니다. (${this.lessonDuration}분)`, 'info');
  }

  /**
   * 타이머 정지
   */
  stop() {
    if (this.classTimerInterval) {
      clearInterval(this.classTimerInterval);
      this.classTimerInterval = null;
    }
    
    this.classMode = CLASS_MODE.STOPPED;
    this.remainingSeconds = 0;
    this.updateUI();
    this.notifyModeChange();
    
    this.onAlert('⏹️ 수업 타이머가 정지되었습니다.', 'info');
  }

  /**
   * 토글
   */
  toggle() {
    if (this.classMode === CLASS_MODE.STOPPED) {
      this.start();
    } else {
      this.stop();
    }
  }

  /**
   * 1초마다 호출
   */
  tick() {
    this.remainingSeconds--;
    
    // 종료 1분 전 알림
    if (!this.notifiedBeforeEnd && this.remainingSeconds === 60) {
      this.notifiedBeforeEnd = true;
      const msg = this.classMode === CLASS_MODE.LESSON ? 
        '⏰ 1분 후 쉬는 시간입니다.' : '⏰ 1분 후 수업이 시작됩니다.';
      this.onAlert(msg, 'info');
      this.onPlaySound();
      this.onBroadcast(msg);
    }
    
    // 시간 종료
    if (this.remainingSeconds <= 0) {
      this.switchMode();
    }
    
    this.updateUI();
    
    // 학생들에게 시간 업데이트 (5초마다)
    if (this.remainingSeconds % 5 === 0 || this.remainingSeconds <= 10) {
      this.notifyModeChange();
    }
  }

  /**
   * 모드 전환
   */
  switchMode() {
    this.notifiedBeforeEnd = false;
    
    if (this.classMode === CLASS_MODE.LESSON) {
      this.classMode = CLASS_MODE.BREAK;
      this.remainingSeconds = this.breakDuration * 60;
      this.onAlert(`☕ 쉬는 시간입니다! (${this.breakDuration}분)`, 'info');
      this.onPlaySound();
    } else {
      this.classMode = CLASS_MODE.LESSON;
      this.lessonCount++;
      this.remainingSeconds = this.lessonDuration * 60;
      this.onAlert(`📚 ${this.lessonCount}교시 수업이 시작되었습니다. (${this.lessonDuration}분)`, 'info');
      this.onPlaySound();
    }
    
    this.notifyModeChange();
  }

  /**
   * 강제 쉬는시간 전환
   */
  forceBreak() {
    if (this.classMode === CLASS_MODE.STOPPED) {
      this.start();
    }
    
    this.classMode = CLASS_MODE.BREAK;
    this.remainingSeconds = this.breakDuration * 60;
    this.notifiedBeforeEnd = false;
    this.updateUI();
    this.notifyModeChange();
    this.onAlert(`☕ 쉬는 시간으로 전환되었습니다. (${this.breakDuration}분)`, 'info');
  }

  /**
   * 강제 수업 전환
   */
  forceLesson() {
    if (this.classMode === CLASS_MODE.STOPPED) {
      this.start();
      return;
    }
    
    this.classMode = CLASS_MODE.LESSON;
    this.remainingSeconds = this.lessonDuration * 60;
    this.notifiedBeforeEnd = false;
    this.updateUI();
    this.notifyModeChange();
    this.onAlert(`📚 수업으로 전환되었습니다. (${this.lessonDuration}분)`, 'info');
  }

  /**
   * 모드 변경 알림
   */
  notifyModeChange() {
    this.onNotifyModeChange({
      type: 'class_mode_change',
      mode: this.classMode,
      remainingSeconds: this.remainingSeconds,
      lessonCount: this.lessonCount
    });
  }

  /**
   * 수업 시간인지 확인
   */
  isLessonTime() {
    return this.classMode === CLASS_MODE.LESSON;
  }

  /**
   * 쉬는 시간인지 확인
   */
  isBreakTime() {
    return this.classMode === CLASS_MODE.BREAK;
  }

  /**
   * UI 업데이트
   */
  updateUI() {
    const timerBar = this.elements.classTimerBar;
    const statusEl = this.elements.classTimerStatus;
    const timeEl = this.elements.classTimerTime;
    const progressEl = this.elements.classTimerProgress;
    const toggleBtn = this.elements.classTimerToggle;
    const idleMsg = document.getElementById('class-timer-idle');
    
    if (!timerBar) return;
    
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    
    if (this.classMode === CLASS_MODE.STOPPED) {
      timerBar.className = 'hidden';
      if (idleMsg) idleMsg.className = 'flex items-center gap-2 text-gray-400 flex-1';
      toggleBtn.innerHTML = '<span class="material-symbols-rounded text-sm">play_arrow</span> 수업 시작';
      toggleBtn.className = 'px-3 py-1.5 bg-primary hover:bg-primary/90 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1';
    } else if (this.classMode === CLASS_MODE.LESSON) {
      timerBar.className = 'flex items-center gap-3 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex-1';
      if (idleMsg) idleMsg.className = 'hidden';
      statusEl.innerHTML = `<span class="material-symbols-rounded text-emerald-500 text-lg">school</span><span class="font-bold text-emerald-700 dark:text-emerald-300">${this.lessonCount}교시 수업 중</span>`;
      timeEl.textContent = timeStr;
      timeEl.className = 'font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400';
      
      const totalSeconds = this.lessonDuration * 60;
      const progress = ((totalSeconds - this.remainingSeconds) / totalSeconds) * 100;
      progressEl.style.width = `${progress}%`;
      progressEl.className = 'h-full bg-emerald-500 rounded-full transition-all duration-1000';
      
      toggleBtn.innerHTML = '<span class="material-symbols-rounded text-sm">stop</span> 정지';
      toggleBtn.className = 'px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1';
    } else if (this.classMode === CLASS_MODE.BREAK) {
      timerBar.className = 'flex items-center gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex-1';
      if (idleMsg) idleMsg.className = 'hidden';
      statusEl.innerHTML = `<span class="material-symbols-rounded text-amber-500 text-lg">coffee</span><span class="font-bold text-amber-700 dark:text-amber-300">쉬는 시간</span>`;
      timeEl.textContent = timeStr;
      timeEl.className = 'font-mono font-bold text-lg text-amber-600 dark:text-amber-400';
      
      const totalSeconds = this.breakDuration * 60;
      const progress = ((totalSeconds - this.remainingSeconds) / totalSeconds) * 100;
      progressEl.style.width = `${progress}%`;
      progressEl.className = 'h-full bg-amber-500 rounded-full transition-all duration-1000';
      
      toggleBtn.innerHTML = '<span class="material-symbols-rounded text-sm">stop</span> 정지';
      toggleBtn.className = 'px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1';
    }
  }

  /**
   * 설정 모달 열기
   */
  openSettingsModal() {
    const modal = this.elements.classSettingsModal;
    if (!modal) return;
    
    if (this.elements.lessonDurationInput) {
      this.elements.lessonDurationInput.value = this.lessonDuration;
    }
    if (this.elements.breakDurationInput) {
      this.elements.breakDurationInput.value = this.breakDuration;
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  /**
   * 설정 모달 닫기
   */
  closeSettingsModal() {
    const modal = this.elements.classSettingsModal;
    if (!modal) return;
    
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  /**
   * 설정 저장 (모달에서)
   */
  saveSettingsFromModal() {
    const lessonInput = this.elements.lessonDurationInput;
    const breakInput = this.elements.breakDurationInput;
    
    if (lessonInput && breakInput) {
      const lesson = parseInt(lessonInput.value) || 50;
      const breakTime = parseInt(breakInput.value) || 10;
      
      if (lesson < 1 || lesson > 180) {
        alert('수업 시간은 1~180분 사이로 설정해주세요.');
        return false;
      }
      if (breakTime < 1 || breakTime > 60) {
        alert('쉬는 시간은 1~60분 사이로 설정해주세요.');
        return false;
      }
      
      this.lessonDuration = lesson;
      this.breakDuration = breakTime;
      this.saveSettings();
      
      this.onAlert(`⚙️ 수업 시간 설정: 수업 ${lesson}분, 쉬는시간 ${breakTime}분`, 'info');
      this.closeSettingsModal();
      return true;
    }
    return false;
  }
}
