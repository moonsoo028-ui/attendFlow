/**
 * 학생용 앱 로직
 * - 카메라로 자신의 포즈 분석
 * - 상태를 교사에게 전송
 */
import { CONFIG, STATUS, STATUS_LABEL, STATUS_COLOR, FOCUS_LABEL, FOCUS_COLOR } from './config.js';
import { PoseAnalyzer } from './pose-analyzer.js';
import { PeerManager } from './peer-manager.js';
import { FocusAnalyzer } from './focus-analyzer.js';
import { ScreenCaptureManager } from './screen-capture-manager.js';

class StudentApp {
  constructor() {
    this.poseAnalyzer = new PoseAnalyzer();
    this.peerManager = new PeerManager();
    this.focusAnalyzer = new FocusAnalyzer();
    this.screenCaptureManager = new ScreenCaptureManager();
    this.studentName = '';
    this.studentGrade = '';
    this.teacherId = '';
    this.currentStatus = STATUS.UNKNOWN;
    this.statusHistory = [];
    this.statusInterval = null;
    this.awayStartTime = null;
    this.messageTimeout = null; // 메시지 자동 숨김 타이머
    this.currentFocusData = null;
    this.reconnectInterval = null; // 재연결 타이머
    this.reconnectAttempts = 0; // 재연결 시도 횟수
    this.isStopping = false; // 중지 중 플래그
    this.teacherAudioElement = null; // 교사 오디오 재생용
    this.isScreenSharing = false; // 화면 공유 상태
    
    // 수업 시간 관련
    this.classMode = null;
    this.classRemainingSeconds = 0;
    this.classLessonCount = 0;
    this.classTimerInterval = null;
  }

  async init() {
    // DOM 요소
    this.elements = {
      setupForm: document.getElementById('setup-form'),
      monitorSection: document.getElementById('monitor-section'),
      studentNameInput: document.getElementById('student-name'),
      studentGradeInput: document.getElementById('student-grade'),
      teacherIdInput: document.getElementById('teacher-id'),
      startBtn: document.getElementById('start-btn'),
      stopBtn: document.getElementById('stop-btn'),
      video: document.getElementById('video'),
      canvas: document.getElementById('canvas'),
      statusDisplay: document.getElementById('status-display'),
      statusText: document.getElementById('status-text'),
      statusIcon: document.getElementById('status-icon'),
      connectionStatus: document.getElementById('connection-status'),
      myPeerId: document.getElementById('my-peer-id'),
      awayTimer: document.getElementById('away-timer'),
      // 집중도 관련
      focusScore: document.getElementById('focus-score'),
      focusLevel: document.getElementById('focus-level'),
      focusBar: document.getElementById('focus-bar'),
      // 메시지 관련
      teacherMessageContainer: document.getElementById('teacher-message-container'),
      teacherMessageBox: document.getElementById('teacher-message-box'),
      teacherMessageText: document.getElementById('teacher-message-text'),
      teacherMessageTime: document.getElementById('teacher-message-time'),
      closeTeacherMessage: document.getElementById('close-teacher-message'),
      // 학생 → 교사 메시지
      sendMessageToTeacherBtn: document.getElementById('send-message-to-teacher-btn'),
      studentMessageModal: document.getElementById('student-message-modal'),
      studentMessageInput: document.getElementById('student-message-input'),
      closeStudentMessageModal: document.getElementById('close-student-message-modal'),
      cancelStudentMessage: document.getElementById('cancel-student-message'),
      sendStudentMessage: document.getElementById('send-student-message'),
      // 화면 공유 상태
      screenShareStatus: document.getElementById('screen-share-status')
    };

    // 이벤트 바인딩
    this.elements.startBtn.addEventListener('click', () => this.start());
    this.elements.stopBtn.addEventListener('click', () => this.stop());
    this.elements.closeTeacherMessage.addEventListener('click', () => this.hideTeacherMessage());
    
    // 학생 → 교사 메시지 이벤트
    this.elements.sendMessageToTeacherBtn.addEventListener('click', () => this.openMessageModal());
    this.elements.closeStudentMessageModal.addEventListener('click', () => this.closeMessageModal());
    this.elements.cancelStudentMessage.addEventListener('click', () => this.closeMessageModal());
    this.elements.sendStudentMessage.addEventListener('click', () => this.sendMessageToTeacher());

    // 저장된 설정 불러오기
    this.loadSettings();
  }

  loadSettings() {
    const saved = localStorage.getItem('studentSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      this.elements.studentNameInput.value = settings.name || '';
      this.elements.studentGradeInput.value = settings.grade || '';
      this.elements.teacherIdInput.value = settings.teacherId || '';
    }
  }

  saveSettings() {
    localStorage.setItem('studentSettings', JSON.stringify({
      name: this.studentName,
      grade: this.studentGrade,
      teacherId: this.teacherId
    }));
  }


  async start() {
    this.studentName = this.elements.studentNameInput.value.trim();
    this.studentGrade = this.elements.studentGradeInput.value;
    this.teacherId = this.elements.teacherIdInput.value.trim();

    if (!this.studentName) {
      alert('이름을 입력해주세요.');
      return;
    }

    if (!this.studentGrade) {
      alert('학년을 선택해주세요.');
      return;
    }

    if (!this.teacherId) {
      alert('교사 ID를 입력해주세요.');
      return;
    }

    this.saveSettings();

    try {
      this.elements.startBtn.disabled = true;
      this.elements.startBtn.innerHTML = `
        <span class="material-symbols-rounded animate-spin">progress_activity</span>
        연결 중...
      `;

      // PeerJS 초기화
      const myId = await this.peerManager.init('student');
      this.elements.myPeerId.textContent = myId;

      // 교사에게 연결
      const conn = this.peerManager.connect(this.teacherId);
      
      this.peerManager.setOnConnectionChange((type, peerId) => {
        console.log(`[StudentApp] 연결 변경: ${type}, ${peerId}`);
        if (type === 'connected') {
          // 재연결 성공 시 타이머 중단
          this.stopReconnect();
          
          this.elements.connectionStatus.innerHTML = `
            <span class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
            </span>
            연결됨
          `;
          this.elements.connectionStatus.className = 'hidden sm:flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-sm font-medium border border-green-200 dark:border-green-800';
          
          // 교사에게 연결된 경우에만 등록 메시지 전송
          if (peerId === this.teacherId) {
            this.peerManager.send(this.teacherId, {
              type: 'register',
              name: this.studentName,
              grade: this.studentGrade
            });
          }
        } else if (type === 'disconnected') {
          this.elements.connectionStatus.innerHTML = `
            <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            연결 끊김 (재연결 중...)
          `;
          this.elements.connectionStatus.className = 'hidden sm:flex items-center gap-2 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-sm font-medium border border-red-200 dark:border-red-800';
          
          // 교사 연결이 끊어지면 재연결 시도 시작
          if (peerId === this.teacherId) {
            this.startReconnect();
          }
        }
      });

      // 교사로부터 메시지 수신 처리 (모든 연결에서)
      this.peerManager.setOnDataReceived((peerId, data) => {
        console.log(`[StudentApp] 메시지 수신 from ${peerId}:`, data);
        if (data.type === 'video_request') {
          console.log('[StudentApp] 영상 요청 수신, 스트림 전송 시작');
          const stream = this.poseAnalyzer.getStream();
          console.log('[StudentApp] 현재 스트림:', stream);
          if (stream) {
            // 교사 ID로 전송
            this.peerManager.sendStream(this.teacherId);
          } else {
            console.error('[StudentApp] 스트림이 없습니다!');
          }
        } else if (data.type === 'teacher_message') {
          // 교사 메시지 수신
          this.showTeacherMessage(data.message, data.isBroadcast);
        } else if (data.type === 'name_duplicate') {
          // 이름 중복 - 연결 해제하고 안내
          alert(data.message);
          this.stop();
        } else if (data.type === 'ptt_start') {
          // 교사 PTT 시작 알림
          this.showPTTIndicator(true);
        } else if (data.type === 'ptt_end') {
          // 교사 PTT 종료 알림
          this.showPTTIndicator(false);
        } else if (data.type === 'class_mode_change') {
          // 수업/쉬는시간 모드 변경
          this.handleClassModeChange(data);
        } else if (data.type === 'understanding_check') {
          // 이해도 체크 질문 수신
          this.showUnderstandingCheck(data);
        }
      });

      // 교사 PTT 오디오 수신 처리
      this.peerManager.setOnAudioReceived((peerId, stream, isStart) => {
        if (isStart && stream) {
          this.playTeacherAudio(stream);
        } else {
          this.stopTeacherAudio();
        }
      });

      // MediaPipe 초기화
      await this.poseAnalyzer.init(this.elements.video, this.elements.canvas);
      
      // 집중도 분석기 초기화 (실패해도 계속 진행)
      try {
        await this.focusAnalyzer.init(this.elements.video);
        this.focusAnalyzer.setOnFocusChange((focusData) => {
          this.currentFocusData = focusData;
          this.updateFocusDisplay(focusData);
        });
        
        // PoseAnalyzer에 FocusAnalyzer 연결
        this.poseAnalyzer.setFocusAnalyzer(this.focusAnalyzer);
        console.log('[StudentApp] 집중도 분석기 초기화 완료');
      } catch (e) {
        console.warn('[StudentApp] 집중도 분석기 초기화 실패, 기본 기능만 사용:', e);
      }
      
      // 카메라 스트림을 PeerManager에 즉시 전달
      const stream = this.poseAnalyzer.getStream();
      if (stream) {
        this.peerManager.setLocalStream(stream);
        console.log('[StudentApp] 로컬 스트림 설정 완료:', stream.getTracks());
      } else {
        console.error('[StudentApp] 스트림 획득 실패!');
      }
      
      this.poseAnalyzer.setOnStatusChange((status) => {
        this.updateStatus(status);
      });

      // 분석 시작
      this.poseAnalyzer.start();

      // 상태 전송 시작
      this.startStatusBroadcast();

      // UI 업데이트
      this.elements.setupForm.classList.add('hidden');
      this.elements.monitorSection.classList.remove('hidden');
      this.elements.stopBtn.classList.remove('hidden');
      this.elements.stopBtn.classList.add('flex');
      this.elements.sendMessageToTeacherBtn.classList.remove('hidden');
      this.elements.sendMessageToTeacherBtn.classList.add('flex');
      
      // 화면 공유 자동 시작
      await this.startScreenShareAuto();

    } catch (error) {
      console.error('시작 실패:', error);
      this.elements.startBtn.disabled = false;
      this.elements.startBtn.innerHTML = `
        <span class="material-symbols-rounded">videocam</span>
        카메라 시작 & 연결
      `;
      alert('시작에 실패했습니다: ' + error.message);
    }
  }

  updateStatus(status) {
    this.currentStatus = status;
    
    // 자리비움 타이머
    if (status === STATUS.AWAY) {
      if (!this.awayStartTime) {
        this.awayStartTime = Date.now();
      }
      this.updateAwayTimer();
    } else {
      this.awayStartTime = null;
      this.elements.awayTimer.textContent = '';
    }

    // 상태별 스타일
    const statusBadge = this.elements.statusDisplay.querySelector('div');
    let icon = 'hourglass_empty';
    let iconColor = 'text-slate-400';
    let bgColor = 'bg-slate-100 dark:bg-slate-800';
    let textColor = 'text-slate-500';
    let borderColor = 'border-slate-200 dark:border-slate-700';
    
    if (status === STATUS.STANDING) {
      icon = 'accessibility_new';
      iconColor = 'text-green-600 dark:text-green-400';
      bgColor = 'bg-green-50 dark:bg-green-900/20';
      textColor = 'text-green-600 dark:text-green-400';
      borderColor = 'border-green-100 dark:border-green-800';
    } else if (status === STATUS.SITTING) {
      icon = 'chair';
      iconColor = 'text-blue-600 dark:text-blue-400';
      bgColor = 'bg-blue-50 dark:bg-blue-900/20';
      textColor = 'text-blue-600 dark:text-blue-400';
      borderColor = 'border-blue-100 dark:border-blue-800';
    } else if (status === STATUS.AWAY) {
      icon = 'person_off';
      iconColor = 'text-red-600 dark:text-red-400';
      bgColor = 'bg-red-50 dark:bg-red-900/20';
      textColor = 'text-red-600 dark:text-red-400';
      borderColor = 'border-red-100 dark:border-red-800';
    } else if (status === STATUS.HAND_RAISED) {
      icon = 'pan_tool';
      iconColor = 'text-purple-600 dark:text-purple-400';
      bgColor = 'bg-purple-50 dark:bg-purple-900/20';
      textColor = 'text-purple-600 dark:text-purple-400';
      borderColor = 'border-purple-100 dark:border-purple-800';
    }
    
    statusBadge.className = `w-28 h-28 rounded-xl ${bgColor} flex flex-col items-center justify-center border ${borderColor} transition-colors duration-300`;
    this.elements.statusIcon.className = `material-symbols-rounded text-5xl mb-1 ${iconColor}`;
    this.elements.statusIcon.textContent = icon;
    this.elements.statusText.className = `font-bold text-sm ${textColor}`;
    this.elements.statusText.textContent = STATUS_LABEL[status];
  }

  updateAwayTimer() {
    if (this.awayStartTime) {
      const seconds = Math.floor((Date.now() - this.awayStartTime) / 1000);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      this.elements.awayTimer.textContent = 
        `자리비움: ${mins}분 ${secs.toString().padStart(2, '0')}초`;
    }
  }

  startStatusBroadcast() {
    this.sendFailCount = 0; // 전송 실패 카운터
    
    this.statusInterval = setInterval(() => {
      if (this.awayStartTime) {
        this.updateAwayTimer();
      }
      
      const success = this.peerManager.send(this.teacherId, {
        type: 'status',
        name: this.studentName,
        grade: this.studentGrade,
        status: this.currentStatus,
        timestamp: Date.now(),
        focus: this.currentFocusData
      });
      
      // 전송 실패 시 카운터 증가
      if (!success) {
        this.sendFailCount++;
        console.log(`[StudentApp] 전송 실패 ${this.sendFailCount}회`);
        
        // 3회 연속 실패하면 연결 끊김으로 처리
        if (this.sendFailCount >= 3) {
          console.log('[StudentApp] 교사 연결 끊김 감지');
          this.handleTeacherDisconnect();
        }
      } else {
        this.sendFailCount = 0; // 성공하면 카운터 리셋
      }
    }, CONFIG.statusInterval);
  }

  /**
   * 교사 연결 끊김 처리
   */
  handleTeacherDisconnect() {
    this.elements.connectionStatus.innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
      교사 연결 끊김
    `;
    this.elements.connectionStatus.className = 'hidden sm:flex items-center gap-2 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-sm font-medium border border-red-200 dark:border-red-800';
    
    // 재연결 시도 시작
    this.startReconnect();
  }

  /**
   * 교사 재연결 시도 시작
   */
  startReconnect() {
    // 중지 중이면 재연결 안 함
    if (this.isStopping) return;
    
    // 이미 재연결 중이면 무시
    if (this.reconnectInterval) return;
    
    this.reconnectAttempts = 0;
    console.log('[StudentApp] 교사 재연결 시도 시작');
    
    this.reconnectInterval = setInterval(() => {
      this.reconnectAttempts++;
      console.log(`[StudentApp] 재연결 시도 #${this.reconnectAttempts}`);
      
      // UI 업데이트
      this.elements.connectionStatus.innerHTML = `
        <span class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
        재연결 중... (${this.reconnectAttempts})
      `;
      this.elements.connectionStatus.className = 'hidden sm:flex items-center gap-2 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-sm font-medium border border-amber-200 dark:border-amber-800';
      
      // 교사에게 다시 연결 시도
      const conn = this.peerManager.connect(this.teacherId);
      
      // 60회 시도 후 (약 5분) 중단
      if (this.reconnectAttempts >= 60) {
        this.stopReconnect();
        this.elements.connectionStatus.innerHTML = `
          <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
          연결 실패
        `;
        alert('교사와의 연결이 끊어졌습니다. 다시 참여해주세요.');
      }
    }, 5000); // 5초마다 재시도
  }

  /**
   * 재연결 시도 중단
   */
  stopReconnect() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
    this.reconnectAttempts = 0;
  }

  stop() {
    // 중지 플래그 설정 (재연결 방지)
    this.isStopping = true;
    
    // 재연결 중단
    this.stopReconnect();
    
    // 화면 공유 중지
    this.screenCaptureManager.stopCapture();
    this.isScreenSharing = false;
    
    // 분석 중지
    this.poseAnalyzer.stop();
    this.focusAnalyzer.stop();
    
    // 상태 전송 중지
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    
    // 수업 타이머 중지 및 인디케이터 제거
    if (this.classTimerInterval) {
      clearInterval(this.classTimerInterval);
      this.classTimerInterval = null;
    }
    this.classMode = null;
    this.classRemainingSeconds = 0;
    this.classLessonCount = 0;
    
    // 수업 모드 인디케이터 제거
    const classIndicator = document.getElementById('class-mode-indicator');
    if (classIndicator) classIndicator.remove();
    
    // 큰 알림도 제거
    const bigAlert = document.getElementById('class-mode-big-alert');
    if (bigAlert) bigAlert.remove();

    // 연결 해제
    this.peerManager.disconnect();
    
    // 상태 초기화
    this.currentStatus = STATUS.UNKNOWN;
    this.awayStartTime = null;
    
    // 새 인스턴스 생성 (재시작 시 깨끗한 상태로)
    this.poseAnalyzer = new PoseAnalyzer();
    this.peerManager = new PeerManager();
    this.focusAnalyzer = new FocusAnalyzer();
    this.screenCaptureManager = new ScreenCaptureManager();
    this.currentFocusData = null;
    
    // 중지 플래그 해제
    this.isStopping = false;

    // UI 복원
    this.elements.setupForm.classList.remove('hidden');
    this.elements.monitorSection.classList.add('hidden');
    this.elements.startBtn.disabled = false;
    this.elements.startBtn.innerHTML = `
      <span class="material-symbols-rounded">videocam</span>
      카메라 시작 & 연결
    `;
    this.elements.stopBtn.classList.add('hidden');
    this.elements.sendMessageToTeacherBtn.classList.add('hidden');
    
    // 화면 공유 상태 초기화
    if (this.elements.screenShareStatus) {
      this.elements.screenShareStatus.classList.add('hidden');
    }
    
    this.elements.connectionStatus.innerHTML = `
      <span class="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
      연결 대기
    `;
    this.elements.connectionStatus.className = 'hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full text-sm font-medium border border-slate-200 dark:border-slate-600';
  }

  /**
   * 집중도 표시 업데이트
   */
  updateFocusDisplay(focusData) {
    if (!this.elements.focusScore || !focusData) return;
    
    const score = focusData.score;
    const level = focusData.level;
    
    // 점수 표시
    this.elements.focusScore.textContent = score;
    
    // 레벨 텍스트
    this.elements.focusLevel.textContent = FOCUS_LABEL[level];
    
    // 프로그레스 바 업데이트
    this.elements.focusBar.style.width = `${score}%`;
    
    // 색상 업데이트
    const color = FOCUS_COLOR[level];
    this.elements.focusBar.style.backgroundColor = color;
    this.elements.focusScore.style.color = color;
    this.elements.focusLevel.style.color = color;
  }

  /**
   * 교사 메시지 표시
   */
  showTeacherMessage(message, isBroadcast) {
    // 기존 타이머 취소
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }

    // 메시지 표시
    this.elements.teacherMessageText.textContent = message;
    this.elements.teacherMessageTime.textContent = 
      (isBroadcast ? '📢 전체 공지 • ' : '💬 개인 메시지 • ') + 
      new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    
    this.elements.teacherMessageContainer.classList.remove('hidden');
    this.elements.teacherMessageBox.classList.add('animate-pulse');
    
    // 3초 후 애니메이션 제거
    setTimeout(() => {
      this.elements.teacherMessageBox.classList.remove('animate-pulse');
    }, 3000);

    // 30초 후 자동 숨김
    this.messageTimeout = setTimeout(() => {
      this.hideTeacherMessage();
    }, 30000);

    // 알림음 재생 (선택적)
    this.playNotificationSound();
  }

  /**
   * 교사 메시지 숨기기
   */
  hideTeacherMessage() {
    this.elements.teacherMessageContainer.classList.add('hidden');
    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
      this.messageTimeout = null;
    }
  }

  /**
   * 알림음 재생
   */
  playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.2);
    } catch (e) {
      // 오디오 재생 실패 무시
    }
  }

  /**
   * 메시지 모달 열기
   */
  openMessageModal() {
    this.elements.studentMessageInput.value = '';
    this.elements.studentMessageModal.style.display = 'flex';
    this.elements.studentMessageInput.focus();
  }

  /**
   * 메시지 모달 닫기
   */
  closeMessageModal() {
    this.elements.studentMessageModal.style.display = 'none';
    this.elements.studentMessageInput.value = '';
  }

  /**
   * 교사에게 메시지 전송
   */
  sendMessageToTeacher() {
    const message = this.elements.studentMessageInput.value.trim();
    if (!message) {
      alert('메시지를 입력해주세요.');
      return;
    }

    this.peerManager.send(this.teacherId, {
      type: 'student_message',
      name: this.studentName,
      message: message,
      timestamp: Date.now()
    });

    this.closeMessageModal();
    
    // 전송 완료 피드백
    this.showSentConfirmation();
  }

  /**
   * 전송 완료 확인 표시
   */
  showSentConfirmation() {
    const btn = this.elements.sendMessageToTeacherBtn;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `
      <span class="material-symbols-rounded">check</span>
      전송됨
    `;
    btn.classList.remove('bg-primary', 'hover:bg-primary-dark');
    btn.classList.add('bg-green-500');
    
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('bg-green-500');
      btn.classList.add('bg-primary', 'hover:bg-primary-dark');
    }, 2000);
  }

  /**
   * PTT 인디케이터 표시
   */
  showPTTIndicator(show) {
    let indicator = document.getElementById('ptt-indicator');
    
    if (show) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'ptt-indicator';
        indicator.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full shadow-lg animate-pulse';
        indicator.innerHTML = `
          <span class="material-symbols-rounded">mic</span>
          <span class="font-medium">선생님이 말하고 있습니다...</span>
        `;
        document.body.appendChild(indicator);
      }
    } else {
      if (indicator) {
        indicator.remove();
      }
    }
  }

  /**
   * 교사 오디오 재생
   */
  playTeacherAudio(stream) {
    console.log('[StudentApp] 교사 오디오 재생 시작');
    
    // 기존 오디오 요소 제거
    this.stopTeacherAudio();
    
    // 새 오디오 요소 생성
    this.teacherAudioElement = document.createElement('audio');
    this.teacherAudioElement.srcObject = stream;
    this.teacherAudioElement.autoplay = true;
    this.teacherAudioElement.volume = 1.0;
    
    // 재생 시작
    this.teacherAudioElement.play().catch(err => {
      console.error('[StudentApp] 오디오 재생 실패:', err);
    });
    
    // PTT 인디케이터 표시
    this.showPTTIndicator(true);
  }

  /**
   * 교사 오디오 중지
   */
  stopTeacherAudio() {
    console.log('[StudentApp] 교사 오디오 중지');
    
    if (this.teacherAudioElement) {
      this.teacherAudioElement.pause();
      this.teacherAudioElement.srcObject = null;
      this.teacherAudioElement = null;
    }
    
    // PTT 인디케이터 숨김
    this.showPTTIndicator(false);
  }

  /**
   * 수업/쉬는시간 모드 변경 처리
   */
  handleClassModeChange(data) {
    console.log('[StudentApp] 수업 모드 변경 수신:', data);
    const { mode, remainingSeconds, lessonCount } = data;
    
    // 모드가 실제로 변경되었는지 확인
    const modeChanged = this.classMode !== mode;
    
    // 로컬 타이머 상태 저장
    this.classMode = mode;
    this.classRemainingSeconds = remainingSeconds;
    this.classLessonCount = lessonCount;
    
    // 기존 로컬 타이머 정리
    if (this.classTimerInterval) {
      clearInterval(this.classTimerInterval);
      this.classTimerInterval = null;
    }
    
    // 기존 인디케이터 제거
    let indicator = document.getElementById('class-mode-indicator');
    
    if (mode === 'stopped') {
      if (indicator) indicator.remove();
      // 큰 알림도 제거
      const bigAlert = document.getElementById('class-mode-big-alert');
      if (bigAlert) bigAlert.remove();
      return;
    }
    
    // 인디케이터 생성
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'class-mode-indicator';
      document.body.appendChild(indicator);
    }
    
    // 초기 UI 업데이트
    this.updateClassModeIndicator();
    
    // 모드가 실제로 변경되었을 때만 큰 알림 표시
    if (modeChanged) {
      if (mode === 'break') {
        this.showClassModeBigAlert('break');
        this.playBreakStartSound();
      } else if (mode === 'lesson') {
        this.showClassModeBigAlert('lesson', lessonCount);
      }
    }
    
    // 로컬 타이머 시작 (1초마다 UI 업데이트)
    this.classTimerInterval = setInterval(() => {
      this.classRemainingSeconds--;
      if (this.classRemainingSeconds < 0) {
        this.classRemainingSeconds = 0;
      }
      this.updateClassModeIndicator();
    }, 1000);
  }

  /**
   * 수업 모드 인디케이터 UI 업데이트
   */
  updateClassModeIndicator() {
    const indicator = document.getElementById('class-mode-indicator');
    if (!indicator) return;
    
    const mins = Math.floor(this.classRemainingSeconds / 60);
    const secs = this.classRemainingSeconds % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    
    if (this.classMode === 'lesson') {
      indicator.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2.5 rounded-full shadow-lg bg-emerald-100 dark:bg-emerald-900/80 border-2 border-emerald-400 dark:border-emerald-600';
      indicator.innerHTML = `
        <span class="material-symbols-rounded text-emerald-600 dark:text-emerald-400 text-xl">school</span>
        <span class="font-bold text-emerald-700 dark:text-emerald-300">${this.classLessonCount}교시</span>
        <div class="w-px h-5 bg-emerald-300 dark:bg-emerald-600"></div>
        <span class="font-mono text-emerald-600 dark:text-emerald-400 text-lg font-bold">${timeStr}</span>
      `;
    } else if (this.classMode === 'break') {
      indicator.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-2.5 rounded-full shadow-lg bg-amber-100 dark:bg-amber-900/80 border-2 border-amber-400 dark:border-amber-600';
      indicator.innerHTML = `
        <span class="material-symbols-rounded text-amber-600 dark:text-amber-400 text-xl">coffee</span>
        <span class="font-bold text-amber-700 dark:text-amber-300">쉬는 시간</span>
        <div class="w-px h-5 bg-amber-300 dark:bg-amber-600"></div>
        <span class="font-mono text-amber-600 dark:text-amber-400 text-lg font-bold">${timeStr}</span>
      `;
    }
  }

  /**
   * 수업/쉬는시간 큰 알림 표시
   */
  showClassModeBigAlert(mode, lessonCount = 0) {
    // 기존 알림 제거
    const existing = document.getElementById('class-mode-big-alert');
    if (existing) existing.remove();
    
    const alert = document.createElement('div');
    alert.id = 'class-mode-big-alert';
    alert.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-500';
    
    if (mode === 'break') {
      alert.innerHTML = `
        <div class="bg-amber-100 dark:bg-amber-900 rounded-3xl p-8 shadow-2xl border-4 border-amber-400 dark:border-amber-600 text-center transform scale-100 animate-bounce-once">
          <span class="material-symbols-rounded text-amber-500 text-7xl mb-4 block">coffee</span>
          <h2 class="text-3xl font-bold text-amber-700 dark:text-amber-300 mb-2">쉬는 시간!</h2>
          <p class="text-amber-600 dark:text-amber-400 text-lg">잠시 휴식하세요 ☕</p>
        </div>
      `;
    } else {
      alert.innerHTML = `
        <div class="bg-emerald-100 dark:bg-emerald-900 rounded-3xl p-8 shadow-2xl border-4 border-emerald-400 dark:border-emerald-600 text-center transform scale-100 animate-bounce-once">
          <span class="material-symbols-rounded text-emerald-500 text-7xl mb-4 block">school</span>
          <h2 class="text-3xl font-bold text-emerald-700 dark:text-emerald-300 mb-2">${lessonCount}교시 시작!</h2>
          <p class="text-emerald-600 dark:text-emerald-400 text-lg">수업에 집중해주세요 📚</p>
        </div>
      `;
    }
    
    document.body.appendChild(alert);
    
    // 3초 후 자동으로 사라짐
    setTimeout(() => {
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 500);
    }, 3000);
  }

  /**
   * 쉬는 시간 시작 알림음
   */
  playBreakStartSound() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // 밝은 종소리 느낌
      oscillator.frequency.value = 1000;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      
      oscillator.start();
      
      // 두 번 울림
      setTimeout(() => {
        oscillator.frequency.value = 1200;
      }, 150);
      
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      // 오디오 재생 실패 무시
    }
  }

  /**
   * 화면 공유 토글 (수동)
   */
  async toggleScreenShare() {
    if (this.isScreenSharing) {
      this.stopScreenShare();
    } else {
      await this.startScreenShare();
    }
  }

  /**
   * 화면 공유 자동 시작 (수업 참여 시)
   */
  async startScreenShareAuto() {
    // 썸네일 전송 콜백 설정
    this.screenCaptureManager.setOnThumbnailReady((thumbnail) => {
      this.sendScreenThumbnail(thumbnail);
    });

    const success = await this.screenCaptureManager.startCapture();
    
    if (success) {
      this.isScreenSharing = true;
      this.updateScreenShareUI(true);
      
      // 교사에게 화면 공유 시작 알림
      this.peerManager.send(this.teacherId, {
        type: 'screen_share_status',
        name: this.studentName,
        sharing: true,
        timestamp: Date.now()
      });
      
      console.log('[StudentApp] 화면 공유 자동 시작 완료');
    } else {
      // 화면 공유 거부해도 수업은 계속 진행
      console.warn('[StudentApp] 화면 공유 거부됨, 수업은 계속 진행');
      this.updateScreenShareUI(false);
    }
  }

  /**
   * 화면 공유 시작 (수동)
   */
  async startScreenShare() {
    // 썸네일 전송 콜백 설정
    this.screenCaptureManager.setOnThumbnailReady((thumbnail) => {
      this.sendScreenThumbnail(thumbnail);
    });

    const success = await this.screenCaptureManager.startCapture();
    
    if (success) {
      this.isScreenSharing = true;
      this.updateScreenShareUI(true);
      
      // 교사에게 화면 공유 시작 알림
      this.peerManager.send(this.teacherId, {
        type: 'screen_share_status',
        name: this.studentName,
        sharing: true,
        timestamp: Date.now()
      });
    } else {
      alert('화면 공유를 시작할 수 없습니다. 권한을 확인해주세요.');
    }
  }

  /**
   * 화면 공유 중지
   */
  stopScreenShare() {
    this.screenCaptureManager.stopCapture();
    this.isScreenSharing = false;
    this.updateScreenShareUI(false);
    
    // 교사에게 화면 공유 중지 알림
    this.peerManager.send(this.teacherId, {
      type: 'screen_share_status',
      name: this.studentName,
      sharing: false,
      timestamp: Date.now()
    });
  }

  /**
   * 화면 썸네일 전송
   */
  sendScreenThumbnail(thumbnail) {
    if (!this.isScreenSharing) return;
    
    this.peerManager.send(this.teacherId, {
      type: 'screen_thumbnail',
      name: this.studentName,
      thumbnail: thumbnail,
      timestamp: Date.now()
    });
  }

  /**
   * 화면 공유 UI 업데이트
   */
  updateScreenShareUI(isSharing) {
    const status = this.elements.screenShareStatus;
    
    if (status) {
      if (isSharing) {
        status.classList.remove('hidden');
        status.classList.add('flex');
        status.innerHTML = `
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          <span class="text-xs text-indigo-600 dark:text-indigo-400 font-medium">화면 공유 중 (10초마다 캡처)</span>
        `;
      } else {
        status.classList.remove('hidden');
        status.classList.add('flex');
        status.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-gray-400"></span>
          <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">화면 공유 꺼짐</span>
        `;
      }
    }
  }

  // ==================== 이해도 체크 ====================

  /**
   * 이해도 체크 질문 표시
   */
  showUnderstandingCheck(data) {
    const { question, timeLimit } = data;
    
    // 모달 요소
    const modal = document.getElementById('understanding-check-modal');
    const questionText = document.getElementById('understanding-question-text');
    const timerEl = document.getElementById('understanding-timer');
    const yesBtn = document.getElementById('understanding-yes-btn');
    const noBtn = document.getElementById('understanding-no-btn');
    
    if (!modal) return;
    
    // 질문 텍스트 설정
    if (questionText) {
      questionText.textContent = question;
    }
    
    // 타이머 설정
    let remaining = timeLimit;
    if (timerEl) {
      timerEl.textContent = remaining;
    }
    
    // 모달 표시
    modal.style.display = 'flex';
    
    // 알림음 재생
    this.playNotificationSound();
    
    // 기존 타이머 정리
    if (this.understandingTimerInterval) {
      clearInterval(this.understandingTimerInterval);
    }
    
    // 타이머 시작
    this.understandingTimerInterval = setInterval(() => {
      remaining--;
      if (timerEl) {
        timerEl.textContent = remaining;
      }
      
      if (remaining <= 0) {
        clearInterval(this.understandingTimerInterval);
        this.understandingTimerInterval = null;
        this.closeUnderstandingCheck();
      }
    }, 1000);
    
    // 버튼 이벤트 (기존 이벤트 제거 후 새로 등록)
    const newYesBtn = yesBtn.cloneNode(true);
    const newNoBtn = noBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
    noBtn.parentNode.replaceChild(newNoBtn, noBtn);
    
    newYesBtn.addEventListener('click', () => this.sendUnderstandingResponse('yes'));
    newNoBtn.addEventListener('click', () => this.sendUnderstandingResponse('no'));
  }

  /**
   * 이해도 체크 응답 전송
   */
  sendUnderstandingResponse(answer) {
    // 타이머 정리
    if (this.understandingTimerInterval) {
      clearInterval(this.understandingTimerInterval);
      this.understandingTimerInterval = null;
    }
    
    // 응답 전송
    this.peerManager.send(this.teacherId, {
      type: 'understanding_response',
      answer: answer,
      name: this.studentName,
      timestamp: Date.now()
    });
    
    // 모달 닫기
    this.closeUnderstandingCheck();
    
    // 피드백 표시
    this.showUnderstandingFeedback(answer);
  }

  /**
   * 이해도 체크 모달 닫기
   */
  closeUnderstandingCheck() {
    const modal = document.getElementById('understanding-check-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * 이해도 체크 응답 피드백
   */
  showUnderstandingFeedback(answer) {
    const isYes = answer === 'yes';
    const icon = isYes ? 'check_circle' : 'cancel';
    const color = isYes ? 'emerald' : 'red';
    const text = isYes ? '응답 완료: 예' : '응답 완료: 아니요';
    
    // 피드백 토스트 생성
    const toast = document.createElement('div');
    toast.className = `fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 bg-${color}-100 dark:bg-${color}-900/80 text-${color}-700 dark:text-${color}-300 rounded-xl shadow-lg border border-${color}-200 dark:border-${color}-700 animate-bounce-once`;
    toast.innerHTML = `
      <span class="material-symbols-rounded text-xl">${icon}</span>
      <span class="font-medium">${text}</span>
    `;
    
    document.body.appendChild(toast);
    
    // 2초 후 제거
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
  const app = new StudentApp();
  app.init();
});

export { StudentApp };
