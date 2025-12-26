/**
 * 교사용 대시보드 앱 (리팩토링 버전)
 * - 모듈화된 구조
 * - 확장성 및 유지보수 용이
 */
import { CONFIG, STATUS, FOCUS_LEVEL, FOCUS_LABEL, FOCUS_COLOR } from './config.js';
import { PeerManager } from './peer-manager.js';
import { AttendanceManager } from './attendance-manager.js';
import { FocusReportManager } from './focus-report-manager.js';

// 매니저 모듈
import { StudentManager } from './managers/student-manager.js';
import { ClassTimerManager } from './managers/class-timer-manager.js';
import { AlertManager } from './managers/alert-manager.js';
import { MessageManager } from './managers/message-manager.js';
import { UIRenderer } from './managers/ui-renderer.js';

class TeacherApp {
  constructor() {
    // 코어 매니저
    this.peerManager = new PeerManager();
    this.attendanceManager = new AttendanceManager();
    this.focusReportManager = new FocusReportManager();
    
    // 상태
    this.currentVideoStudent = null;
    this.currentFocusStudent = null;
    this.currentAttendanceStudent = null;
    this.currentFocusReportStudent = null;
    this.currentFocusReportGrade = null;
    this.currentScreenStudent = null; // 화면 썸네일 모달용
    this.focusReportType = 'daily';
    this.chartRange = 60;
    this.focusChart = null;
    this.currentPTTTarget = null;
    this.attendanceMonthOffset = 0;
  }

  async init() {
    // DOM 요소 수집
    this.elements = this.collectElements();
    
    // 매니저 초기화
    await this.initManagers();
    
    // 이벤트 바인딩
    this.bindEvents();
    
    // 전역 함수 노출
    this.exposeGlobalFunctions();
    
    // 저장된 ID 표시
    this.showSavedIds();
    
    // 타이머 시작
    setInterval(() => this.updateTimers(), 1000);
  }

  /**
   * 저장된 서버 ID 히스토리 표시
   */
  showSavedIds() {
    const savedIdBox = document.getElementById('saved-id-box');
    const savedIdList = document.getElementById('saved-id-list');
    const clearHistoryBtn = document.getElementById('clear-id-history-btn');
    
    const history = this.getIdHistory();
    
    if (history.length === 0 || !savedIdBox || !savedIdList) return;
    
    savedIdBox.classList.remove('hidden');
    this.renderIdHistory(history, savedIdList);
    
    // 전체 삭제 버튼
    clearHistoryBtn?.addEventListener('click', () => {
      if (confirm('저장된 ID 히스토리를 모두 삭제할까요?')) {
        localStorage.removeItem('teacherIdHistory');
        savedIdBox.classList.add('hidden');
      }
    });
  }

  /**
   * ID 히스토리 가져오기
   */
  getIdHistory() {
    try {
      const history = JSON.parse(localStorage.getItem('teacherIdHistory') || '[]');
      return Array.isArray(history) ? history : [];
    } catch {
      return [];
    }
  }

  /**
   * ID 히스토리에 추가 (최대 5개)
   */
  addToIdHistory(id, isCustom = false) {
    if (!id) return;
    
    let history = this.getIdHistory();
    
    // 중복 제거
    history = history.filter(item => item.id !== id);
    
    // 맨 앞에 추가
    history.unshift({
      id,
      isCustom,
      timestamp: Date.now()
    });
    
    // 최대 5개 유지
    history = history.slice(0, 5);
    
    localStorage.setItem('teacherIdHistory', JSON.stringify(history));
  }

  /**
   * ID 히스토리 렌더링
   */
  renderIdHistory(history, container) {
    container.innerHTML = history.map((item, index) => {
      const date = new Date(item.timestamp);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
      const typeLabel = item.isCustom ? '고정' : '자동';
      const typeBg = item.isCustom ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
      
      return `
        <div class="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 cursor-pointer transition-colors group" data-id="${item.id}" data-custom="${item.isCustom}">
          <code class="flex-1 text-sm font-mono text-amber-800 dark:text-amber-300 truncate">${item.id}</code>
          <span class="text-[10px] px-1.5 py-0.5 rounded ${typeBg}">${typeLabel}</span>
          <span class="text-[10px] text-gray-400 dark:text-gray-500 hidden sm:inline">${dateStr}</span>
          <button class="copy-id-btn p-1 opacity-0 group-hover:opacity-100 hover:bg-amber-200 dark:hover:bg-amber-700 rounded transition-all" title="복사">
            <span class="material-symbols-rounded text-sm text-amber-600 dark:text-amber-400">content_copy</span>
          </button>
          <button class="delete-id-btn p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all" title="삭제">
            <span class="material-symbols-rounded text-sm text-red-500">close</span>
          </button>
        </div>
      `;
    }).join('');
    
    // 이벤트 바인딩
    container.querySelectorAll('[data-id]').forEach(item => {
      const id = item.dataset.id;
      
      // 클릭 시 고정 ID로 입력
      item.addEventListener('click', (e) => {
        if (e.target.closest('.copy-id-btn') || e.target.closest('.delete-id-btn')) return;
        
        if (this.elements.useCustomId) {
          this.elements.useCustomId.checked = true;
          this.elements.customIdInput?.classList.remove('hidden');
          this.elements.customIdHint?.classList.remove('hidden');
        }
        if (this.elements.customIdInput) {
          this.elements.customIdInput.value = id;
          this.elements.customIdInput.focus();
        }
      });
      
      // 복사 버튼
      item.querySelector('.copy-id-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(id).then(() => {
          const icon = e.currentTarget.querySelector('.material-symbols-rounded');
          if (icon) {
            icon.textContent = 'check';
            setTimeout(() => { icon.textContent = 'content_copy'; }, 1500);
          }
        });
      });
      
      // 삭제 버튼
      item.querySelector('.delete-id-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeFromIdHistory(id);
        item.remove();
        
        // 히스토리가 비면 박스 숨김
        if (this.getIdHistory().length === 0) {
          document.getElementById('saved-id-box')?.classList.add('hidden');
        }
      });
    });
  }

  /**
   * ID 히스토리에서 삭제
   */
  removeFromIdHistory(id) {
    let history = this.getIdHistory();
    history = history.filter(item => item.id !== id);
    localStorage.setItem('teacherIdHistory', JSON.stringify(history));
  }

  /**
   * DOM 요소 수집
   */
  collectElements() {
    return {
      // 셋업
      setupSection: document.getElementById('setup-section'),
      dashboardSection: document.getElementById('dashboard-section'),
      teacherIdDisplay: document.getElementById('teacher-id-display'),
      copyIdBtn: document.getElementById('copy-id-btn'),
      startServerBtn: document.getElementById('start-server-btn'),
      connectionBadge: document.getElementById('connection-badge'),
      teacherIdBox: document.getElementById('teacher-id-box'),
      setupContent: document.getElementById('setup-content'),
      useCustomId: document.getElementById('use-custom-id'),
      customIdInput: document.getElementById('custom-id-input'),
      customIdHint: document.getElementById('custom-id-hint'),
      
      // 학생 그리드
      studentGrid: document.getElementById('student-grid'),
      totalStudents: document.getElementById('total-students'),
      standingCount: document.getElementById('standing-count'),
      sittingCount: document.getElementById('sitting-count'),
      awayCount: document.getElementById('away-count'),
      handRaisedCount: document.getElementById('hand-raised-count'),
      
      // 알림
      alertList: document.getElementById('alert-list'),
      alertSound: document.getElementById('alert-sound'),
      
      // 영상 모달
      videoModal: document.getElementById('video-modal'),
      modalVideo: document.getElementById('modal-video'),
      modalStudentName: document.getElementById('modal-student-name'),
      closeModalBtn: document.getElementById('close-modal-btn'),
      
      // 집중도 상세 모달
      focusDetailModal: document.getElementById('focus-detail-modal'),
      focusDetailName: document.getElementById('focus-detail-name'),
      focusDetailScore: document.getElementById('focus-detail-score'),
      focusDetailLevel: document.getElementById('focus-detail-level'),
      focusChart: document.getElementById('focus-chart'),
      closeFocusDetailBtn: document.getElementById('close-focus-detail-btn'),
      focusAvgScore: document.getElementById('focus-avg-score'),
      focusMinScore: document.getElementById('focus-min-score'),
      focusMaxScore: document.getElementById('focus-max-score'),
      focusLastUpdate: document.getElementById('focus-last-update'),
      
      // 메시지 모달
      broadcastBtn: document.getElementById('broadcast-btn'),
      messageModal: document.getElementById('message-modal'),
      messageModalTitle: document.getElementById('message-modal-title'),
      messageTargetInfo: document.getElementById('message-target-info'),
      messageInput: document.getElementById('message-input'),
      closeMessageModalBtn: document.getElementById('close-message-modal-btn'),
      cancelMessageBtn: document.getElementById('cancel-message-btn'),
      sendMessageBtn: document.getElementById('send-message-btn'),
      
      // 출석 모달
      attendanceModal: document.getElementById('attendance-modal'),
      attendanceStudentName: document.getElementById('attendance-student-name'),
      attendanceWeeklyDays: document.getElementById('attendance-weekly-days'),
      attendanceWeeklyRate: document.getElementById('attendance-weekly-rate'),
      attendanceWeeklyTime: document.getElementById('attendance-weekly-time'),
      attendanceMonthlyDays: document.getElementById('attendance-monthly-days'),
      attendanceMonthlyRate: document.getElementById('attendance-monthly-rate'),
      attendanceMonthlyTime: document.getElementById('attendance-monthly-time'),
      attendanceCalendar: document.getElementById('attendance-calendar'),
      todayAttendanceCount: document.getElementById('today-attendance-count'),
      todayAttendanceCard: document.getElementById('today-attendance-card'),
      todayAttendanceModal: document.getElementById('today-attendance-modal'),
      todayAttendanceDate: document.getElementById('today-attendance-date'),
      todayAttendanceTotal: document.getElementById('today-attendance-total'),
      todayAttendanceList: document.getElementById('today-attendance-list'),
      
      // 집중도 보고서 모달
      focusReportModal: document.getElementById('focus-report-modal'),
      focusReportStudentName: document.getElementById('focus-report-student-name'),
      focusReportStudentGrade: document.getElementById('focus-report-student-grade'),
      focusReportContent: document.getElementById('focus-report-content'),
      
      // 수업 타이머
      classTimerBar: document.getElementById('class-timer-bar'),
      classTimerStatus: document.getElementById('class-timer-status'),
      classTimerTime: document.getElementById('class-timer-time'),
      classTimerProgress: document.getElementById('class-timer-progress'),
      classTimerToggle: document.getElementById('class-timer-toggle'),
      classSettingsModal: document.getElementById('class-settings-modal'),
      lessonDurationInput: document.getElementById('lesson-duration-input'),
      breakDurationInput: document.getElementById('break-duration-input')
    };
  }

  /**
   * 매니저 초기화
   */
  async initManagers() {
    // 출석/집중도 보고서 초기화
    await this.attendanceManager.init();
    await this.focusReportManager.init();
    
    // 알림 매니저
    this.alertManager = new AlertManager({
      elements: this.elements,
      alertSound: this.elements.alertSound
    });
    
    // 수업 타이머 매니저
    this.classTimerManager = new ClassTimerManager({
      elements: this.elements,
      onAlert: (msg, type) => this.alertManager.addAlert(msg, type),
      onPlaySound: () => this.alertManager.playSound(),
      onBroadcast: (msg) => this.broadcastClassNotification(msg),
      onNotifyModeChange: (data) => this.peerManager.send(null, data)
    });
    
    // 메시지 매니저
    this.messageManager = new MessageManager({
      elements: this.elements,
      onAlert: (msg, type) => this.alertManager.addAlert(msg, type)
    });
    
    // 학생 매니저
    this.studentManager = new StudentManager({
      elements: this.elements,
      attendanceManager: this.attendanceManager,
      focusReportManager: this.focusReportManager,
      onAlert: (msg, type) => this.alertManager.addAlert(msg, type),
      onPlaySound: () => this.alertManager.playSound(),
      isLessonTime: () => this.classTimerManager.isLessonTime()
    });
    
    // UI 렌더러
    this.uiRenderer = new UIRenderer({
      elements: this.elements,
      studentManager: this.studentManager,
      onOpenVideoModal: (peerId, name) => this.openVideoModal(peerId, name),
      onOpenFocusDetailModal: (peerId) => this.openFocusDetailModal(peerId),
      onOpenMessageModal: (peerId, name) => this.messageManager.openModal(peerId, name),
      onOpenAttendanceModal: (name) => this.openAttendanceModal(name),
      onOpenFocusReportModal: (name, grade) => this.openFocusReportModal(name, grade),
      onStartPTT: (peerId, name, btn) => this.startPTT(peerId, name, btn),
      onStopPTT: (peerId, btn) => this.stopPTT(peerId, btn),
      onOpenScreenModal: (peerId) => this.openScreenModal(peerId)
    });
    
    // 오늘 출석 카운트 초기화
    this.updateTodayAttendance();
  }

  /**
   * 이벤트 바인딩
   */
  bindEvents() {
    // 서버 시작
    this.elements.startServerBtn?.addEventListener('click', () => this.startServer());
    this.elements.copyIdBtn?.addEventListener('click', () => this.copyTeacherId());
    this.elements.closeModalBtn?.addEventListener('click', () => this.closeVideoModal());
    this.elements.closeFocusDetailBtn?.addEventListener('click', () => this.closeFocusDetailModal());
    
    // 커스텀 ID 토글
    this.elements.useCustomId?.addEventListener('change', (e) => {
      const show = e.target.checked;
      this.elements.customIdInput?.classList.toggle('hidden', !show);
      this.elements.customIdHint?.classList.toggle('hidden', !show);
      if (show) {
        this.elements.customIdInput?.focus();
        const savedId = localStorage.getItem('customTeacherId');
        if (savedId && this.elements.customIdInput) {
          this.elements.customIdInput.value = savedId;
        }
      }
    });
    
    // 오늘 출석 카드 클릭
    this.elements.todayAttendanceCard?.addEventListener('click', () => {
      this.openTodayAttendanceModal();
    });
    
    // 메시지 관련 이벤트 위임
    document.addEventListener('click', (e) => {
      if (e.target.closest('#broadcast-btn')) {
        this.messageManager.openModal(null);
      }
      if (e.target.closest('#close-message-modal-btn') || e.target.closest('#cancel-message-btn')) {
        this.messageManager.closeModal();
      }
      if (e.target.closest('#send-message-btn')) {
        this.messageManager.send();
      }
    });
  }

  /**
   * 전역 함수 노출
   */
  exposeGlobalFunctions() {
    window.setChartRange = (range) => this.setChartRange(range);
    window.closeFocusModal = () => this.closeFocusDetailModal();
    window.closeAttendanceModal = () => this.closeAttendanceModal();
    window.closeTodayAttendanceModal = () => this.closeTodayAttendanceModal();
    window.setAttendanceMonth = (offset) => this.setAttendanceMonth(offset);
    window.downloadAttendanceCSV = () => this.downloadAttendanceCSV();
    window.downloadAttendancePDF = () => this.downloadAttendancePDF();
    window.closeFocusReportModal = () => this.closeFocusReportModal();
    window.setFocusReportType = (type) => this.setFocusReportType(type);
    window.downloadFocusReportCSV = () => this.downloadFocusReportCSV();
    window.downloadFocusReportPDF = () => this.downloadFocusReportPDF();
    window.toggleClassTimer = () => this.classTimerManager.toggle();
    window.openClassSettings = () => this.classTimerManager.openSettingsModal();
    window.closeClassSettings = () => this.classTimerManager.closeSettingsModal();
    window.saveClassSettings = () => this.classTimerManager.saveSettingsFromModal();
    window.forceBreak = () => this.classTimerManager.forceBreak();
    window.forceLesson = () => this.classTimerManager.forceLesson();
    
    // 이해도 체크 관련
    window.openUnderstandingQuestionModal = () => this.openUnderstandingQuestionModal();
    window.closeUnderstandingQuestionModal = () => this.closeUnderstandingQuestionModal();
    window.sendUnderstandingCheck = () => this.sendUnderstandingCheck();
    window.closeUnderstandingResultModal = () => this.closeUnderstandingResultModal();
    
    // 이해도 체크 버튼 이벤트
    document.getElementById('understanding-check-btn')?.addEventListener('click', () => {
      this.openUnderstandingQuestionModal();
    });
    
    // 시간 제한 슬라이더 이벤트
    document.getElementById('understanding-time-limit')?.addEventListener('input', (e) => {
      document.getElementById('understanding-time-display').textContent = e.target.value + '초';
    });
  }

  /**
   * 타이머 업데이트 (1초마다)
   */
  updateTimers() {
    const needsRender = this.studentManager.updateTimers();
    if (needsRender) {
      this.renderStudentGrid();
      this.updateStats();
    }
  }

  /**
   * 서버 시작
   */
  async startServer() {
    try {
      let customId = null;
      if (this.elements.useCustomId?.checked) {
        customId = this.elements.customIdInput?.value?.trim();
        if (!customId) {
          alert('고정 ID를 입력해주세요.');
          return;
        }
        if (!/^[a-zA-Z0-9-]+$/.test(customId)) {
          alert('ID는 영문, 숫자, 하이픈(-)만 사용할 수 있습니다.');
          return;
        }
        localStorage.setItem('customTeacherId', customId);
      }

      this.elements.startServerBtn.disabled = true;
      this.elements.startServerBtn.textContent = '연결 중...';

      const myId = await this.peerManager.init('teacher', customId);
      
      // 메시지 매니저에 PeerManager 설정
      this.messageManager.setPeerManager(this.peerManager);
      
      this.elements.teacherIdDisplay.value = myId;
      this.elements.dashboardSection?.classList.remove('hidden');
      this.elements.startServerBtn.textContent = '서버 실행 중';
      this.elements.startServerBtn.disabled = true;
      this.elements.connectionBadge?.classList.remove('hidden');
      this.elements.connectionBadge?.classList.add('flex');
      this.elements.teacherIdBox?.classList.remove('hidden');
      this.elements.setupContent?.classList.add('hidden');

      // 콜백 설정
      this.peerManager.setOnConnectionChange((type, peerId) => {
        if (type === 'connected') {
          console.log(`학생 연결: ${peerId}`);
        } else {
          this.handleStudentDisconnect(peerId);
        }
      });

      this.peerManager.setOnDataReceived((peerId, data) => {
        this.handleStudentData(peerId, data);
      });

      localStorage.setItem('teacherId', myId);
      
      // ID 히스토리에 추가
      this.addToIdHistory(myId, !!customId);

    } catch (error) {
      console.error('서버 시작 실패:', error);
      this.elements.startServerBtn.disabled = false;
      this.elements.startServerBtn.textContent = '서버 시작';
      
      if (error.type === 'unavailable-id') {
        alert('이전 세션이 아직 정리되지 않았습니다. 잠시 후 다시 시도해주세요.');
      } else {
        alert('서버 시작에 실패했습니다. 다시 시도해주세요.');
      }
    }
  }

  copyTeacherId() {
    const id = this.elements.teacherIdDisplay?.value;
    if (!id) return;
    
    navigator.clipboard.writeText(id).then(() => {
      const btn = this.elements.copyIdBtn;
      if (btn) {
        btn.innerHTML = '<span class="material-symbols-rounded text-lg">check</span>';
        setTimeout(() => {
          btn.innerHTML = '<span class="material-symbols-rounded text-lg">content_copy</span>';
        }, 2000);
      }
    });
  }

  /**
   * 학생 데이터 처리
   */
  handleStudentData(peerId, data) {
    if (data.type === 'status') {
      const statusChanged = this.studentManager.updateStudentStatus(peerId, data);
      if (statusChanged) {
        this.renderStudentGrid();
        this.updateStats();
      } else {
        const student = this.studentManager.getStudent(peerId);
        if (student) {
          this.studentManager.updateStudentCard(peerId, student);
        }
      }
    } else if (data.type === 'register') {
      const registered = this.studentManager.registerStudent(peerId, data, this.peerManager);
      if (registered) {
        this.updateTodayAttendance();
        this.renderStudentGrid();
        this.updateStats();
      }
    } else if (data.type === 'student_message') {
      this.messageManager.handleStudentMessage(
        peerId, data,
        (msg, type) => this.alertManager.addAlert(msg, type),
        () => this.alertManager.playSound()
      );
    } else if (data.type === 'screen_thumbnail') {
      // 화면 썸네일 수신
      this.handleScreenThumbnail(peerId, data);
    } else if (data.type === 'screen_share_status') {
      // 화면 공유 상태 변경
      this.handleScreenShareStatus(peerId, data);
    } else if (data.type === 'understanding_response') {
      // 이해도 체크 응답 수신
      this.handleUnderstandingResponse(peerId, data);
    }
  }

  handleStudentDisconnect(peerId) {
    if (this.studentManager.handleStudentDisconnect(peerId)) {
      this.updateTodayAttendance();
      this.renderStudentGrid();
      this.updateStats();
    }
  }

  renderStudentGrid() {
    this.uiRenderer.renderStudentGrid(this.studentManager.getAllStudents());
  }

  updateStats() {
    this.uiRenderer.updateStats(this.studentManager.getStats());
  }

  broadcastClassNotification(message) {
    this.peerManager.send(null, {
      type: 'teacher_message',
      message: message,
      timestamp: Date.now(),
      isBroadcast: true,
      isSystemMessage: true
    });
  }

  // ==================== 영상 모달 ====================
  
  async openVideoModal(peerId, studentName) {
    const student = this.studentManager.getStudent(peerId);
    if (!student || student.status === STATUS.DISCONNECTED) {
      alert('해당 학생과 연결되어 있지 않습니다.');
      return;
    }

    const connectedPeers = this.peerManager.getConnectedPeers();
    if (!connectedPeers.includes(peerId)) {
      alert('해당 학생과 데이터 연결이 없습니다.');
      return;
    }

    this.elements.modalStudentName.textContent = studentName;
    this.elements.videoModal.style.display = 'flex';
    this.currentVideoStudent = peerId;

    try {
      const stream = await this.peerManager.requestStream(peerId);
      this.elements.modalVideo.srcObject = stream;
      this.elements.modalVideo.play();
    } catch (error) {
      console.error('영상 연결 실패:', error);
      alert('영상 연결에 실패했습니다: ' + error.message);
      this.closeVideoModal();
    }
  }

  closeVideoModal() {
    if (this.currentVideoStudent) {
      this.peerManager.closeStream(this.currentVideoStudent);
      this.currentVideoStudent = null;
    }
    this.elements.modalVideo.srcObject = null;
    this.elements.videoModal.style.display = 'none';
  }

  // ==================== 집중도 상세 모달 ====================
  
  openFocusDetailModal(peerId) {
    const student = this.studentManager.getStudent(peerId);
    if (!student) return;
    
    this.currentFocusStudent = peerId;
    this.elements.focusDetailName.textContent = student.name;
    
    if (student.focus) {
      this.elements.focusDetailScore.textContent = student.focus.score + '%';
      this.elements.focusDetailScore.style.color = FOCUS_COLOR[student.focus.level];
      
      const levelSpan = this.elements.focusDetailLevel.querySelector('span') || this.elements.focusDetailLevel;
      levelSpan.textContent = FOCUS_LABEL[student.focus.level];
      this.elements.focusDetailLevel.style.color = FOCUS_COLOR[student.focus.level];
    } else {
      this.elements.focusDetailScore.textContent = '-';
      const levelSpan = this.elements.focusDetailLevel.querySelector('span') || this.elements.focusDetailLevel;
      levelSpan.textContent = '데이터 없음';
    }
    
    if (this.elements.focusLastUpdate) {
      this.elements.focusLastUpdate.textContent = `마지막 업데이트: ${new Date().toLocaleTimeString('ko-KR')}`;
    }
    
    this.chartRange = 60;
    this.updateChartRangeButtons();
    this.drawFocusChart(student.focusHistory);
    this.updateFocusStats(student.focusHistory);
    
    this.elements.focusDetailModal.style.display = 'flex';
  }

  closeFocusDetailModal() {
    this.currentFocusStudent = null;
    if (this.elements.focusDetailModal) {
      this.elements.focusDetailModal.style.display = 'none';
    }
  }

  setChartRange(range) {
    this.chartRange = range;
    this.updateChartRangeButtons();
    
    if (this.currentFocusStudent) {
      const student = this.studentManager.getStudent(this.currentFocusStudent);
      if (student) {
        this.drawFocusChart(student.focusHistory);
        this.updateFocusStats(student.focusHistory);
      }
    }
  }

  updateChartRangeButtons() {
    const buttons = document.querySelectorAll('.chart-range-btn');
    buttons.forEach(btn => {
      const range = parseInt(btn.dataset.range);
      if (range === this.chartRange) {
        btn.className = 'chart-range-btn px-2 py-1 text-xs rounded-md bg-primary text-white font-medium transition-all';
      } else {
        btn.className = 'chart-range-btn px-2 py-1 text-xs rounded-md bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium transition-all';
      }
    });
  }

  updateFocusStats(history) {
    if (!history || history.length === 0) {
      if (this.elements.focusAvgScore) this.elements.focusAvgScore.textContent = '-';
      if (this.elements.focusMinScore) this.elements.focusMinScore.textContent = '-';
      if (this.elements.focusMaxScore) this.elements.focusMaxScore.textContent = '-';
      return;
    }
    
    const points = history.slice(-this.chartRange);
    if (points.length === 0) return;
    
    const scores = points.map(p => p.score);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    
    if (this.elements.focusAvgScore) this.elements.focusAvgScore.textContent = avg + '%';
    if (this.elements.focusMinScore) this.elements.focusMinScore.textContent = min + '%';
    if (this.elements.focusMaxScore) this.elements.focusMaxScore.textContent = max + '%';
  }

  drawFocusChart(history) {
    const ctx = this.elements.focusChart?.getContext('2d');
    if (!ctx) return;
    
    const points = history?.slice(-this.chartRange) || [];
    const labels = points.map((_, i) => i + 1);
    const data = points.map(p => p.score);
    
    if (this.focusChart) {
      this.focusChart.destroy();
    }
    
    this.focusChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '집중도',
          data: data,
          borderColor: '#0D9488',
          backgroundColor: 'rgba(13, 148, 136, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { display: false }
        }
      }
    });
  }

  // ==================== PTT ====================
  
  async startPTT(peerId, studentName, btnElement) {
    const student = this.studentManager.getStudent(peerId);
    if (!student || student.status === STATUS.DISCONNECTED) return;

    this.currentPTTTarget = peerId;
    
    btnElement.classList.remove('bg-white/80', 'dark:bg-gray-700/80', 'text-gray-500', 'dark:text-gray-400');
    btnElement.classList.add('bg-red-500', 'text-white', 'animate-pulse');
    
    const success = await this.peerManager.startPTT(peerId);
    
    if (success) {
      this.alertManager.addAlert(`🎤 ${studentName} 학생에게 말하는 중...`, 'info');
    } else {
      this.alertManager.addAlert(`❌ 마이크 연결 실패`, 'warning');
      this.stopPTT(peerId, btnElement);
    }
  }

  stopPTT(peerId, btnElement) {
    if (this.currentPTTTarget !== peerId) return;
    
    this.currentPTTTarget = null;
    
    btnElement.classList.remove('bg-red-500', 'text-white', 'animate-pulse');
    btnElement.classList.add('bg-white/80', 'dark:bg-gray-700/80', 'text-gray-500', 'dark:text-gray-400');
    
    this.peerManager.stopPTT(peerId);
  }

  // ==================== 출석 관련 ====================
  
  updateTodayAttendance() {
    const stats = this.attendanceManager.getTodayStats();
    if (this.elements.todayAttendanceCount) {
      this.elements.todayAttendanceCount.textContent = stats.totalStudents;
    }
  }

  openTodayAttendanceModal() {
    const stats = this.attendanceManager.getTodayStats();
    
    if (this.elements.todayAttendanceDate) {
      const today = new Date();
      this.elements.todayAttendanceDate.textContent = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
    }
    
    if (this.elements.todayAttendanceTotal) {
      this.elements.todayAttendanceTotal.textContent = `${stats.totalStudents}명`;
    }
    
    this.renderTodayAttendanceList(stats.records);
    
    if (this.elements.todayAttendanceModal) {
      this.elements.todayAttendanceModal.style.display = 'flex';
    }
  }

  closeTodayAttendanceModal() {
    if (this.elements.todayAttendanceModal) {
      this.elements.todayAttendanceModal.style.display = 'none';
    }
  }

  renderTodayAttendanceList(records) {
    if (!this.elements.todayAttendanceList) return;
    
    if (!records || records.length === 0) {
      this.elements.todayAttendanceList.innerHTML = `
        <div class="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
          <span class="material-symbols-rounded text-3xl mb-2 opacity-50">person_off</span>
          <p class="text-sm">아직 출석한 학생이 없습니다</p>
        </div>
      `;
      return;
    }
    
    const sortedRecords = [...records].sort((a, b) => a.checkInTime - b.checkInTime);
    const students = this.studentManager.getAllStudents();
    
    let html = '<div class="space-y-2">';
    
    sortedRecords.forEach((record, index) => {
      const checkInTime = new Date(record.checkInTime).toLocaleTimeString('ko-KR', { 
        hour: '2-digit', minute: '2-digit' 
      });
      
      const isOnline = Array.from(students.values()).some(
        s => s.name === record.studentName && s.status !== STATUS.DISCONNECTED
      );
      
      let totalTime = record.totalTime || 0;
      if (!record.checkOutTime && record.checkInTime) {
        totalTime += Date.now() - record.checkInTime;
      }
      const duration = this.attendanceManager.formatDuration(totalTime);
      
      html += `
        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400 font-bold text-sm">
              ${index + 1}
            </div>
            <div>
              <p class="font-medium text-gray-800 dark:text-gray-200">${record.studentName}</p>
              <p class="text-xs text-gray-500">${checkInTime} 출석</p>
            </div>
          </div>
          <div class="text-right">
            <div class="flex items-center gap-1.5">
              ${isOnline ? `
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span class="text-xs font-medium text-green-600">접속중</span>
              ` : `
                <span class="w-2 h-2 rounded-full bg-gray-300"></span>
                <span class="text-xs font-medium text-gray-500">오프라인</span>
              `}
            </div>
            <p class="text-xs text-gray-400 mt-0.5">${duration}</p>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    this.elements.todayAttendanceList.innerHTML = html;
  }

  async openAttendanceModal(studentName) {
    this.currentAttendanceStudent = studentName;
    this.attendanceMonthOffset = 0;
    
    if (this.elements.attendanceStudentName) {
      this.elements.attendanceStudentName.textContent = studentName;
    }
    
    await this.updateAttendanceStats();
    
    if (this.elements.attendanceModal) {
      this.elements.attendanceModal.style.display = 'flex';
    }
  }

  closeAttendanceModal() {
    this.currentAttendanceStudent = null;
    if (this.elements.attendanceModal) {
      this.elements.attendanceModal.style.display = 'none';
    }
  }

  async updateAttendanceStats() {
    if (!this.currentAttendanceStudent) return;
    
    const summary = await this.attendanceManager.getStudentSummary(this.currentAttendanceStudent);
    
    // 주간
    if (this.elements.attendanceWeeklyDays) {
      this.elements.attendanceWeeklyDays.textContent = `${summary.weekly.presentDays}/${summary.weekly.totalDays}일`;
    }
    if (this.elements.attendanceWeeklyRate) {
      this.elements.attendanceWeeklyRate.textContent = `${summary.weekly.rate}%`;
      this.elements.attendanceWeeklyRate.className = `font-bold text-sm ${summary.weekly.rate >= 80 ? 'text-green-600' : summary.weekly.rate >= 50 ? 'text-amber-600' : 'text-red-600'}`;
    }
    if (this.elements.attendanceWeeklyTime) {
      this.elements.attendanceWeeklyTime.textContent = this.attendanceManager.formatDuration(summary.weekly.totalTime);
    }
    
    // 월간
    if (this.elements.attendanceMonthlyDays) {
      this.elements.attendanceMonthlyDays.textContent = `${summary.monthly.presentDays}/${summary.monthly.totalDays}일`;
    }
    if (this.elements.attendanceMonthlyRate) {
      this.elements.attendanceMonthlyRate.textContent = `${summary.monthly.rate}%`;
      this.elements.attendanceMonthlyRate.className = `font-bold text-sm ${summary.monthly.rate >= 80 ? 'text-green-600' : summary.monthly.rate >= 50 ? 'text-amber-600' : 'text-red-600'}`;
    }
    if (this.elements.attendanceMonthlyTime) {
      this.elements.attendanceMonthlyTime.textContent = this.attendanceManager.formatDuration(summary.monthly.totalTime);
    }
    
    // 캘린더
    await this.renderAttendanceCalendar();
  }

  async renderAttendanceCalendar() {
    if (!this.elements.attendanceCalendar || !this.currentAttendanceStudent) return;
    
    const now = new Date();
    const offset = this.attendanceMonthOffset || 0;
    const year = now.getFullYear();
    const month = now.getMonth() + offset;
    
    const targetDate = new Date(year, month, 1);
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    
    const monthlyStats = await this.attendanceManager.getMonthlyStats(
      this.currentAttendanceStudent, 
      targetYear, 
      targetMonth
    );
    
    const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    
    const firstDay = new Date(targetYear, targetMonth, 1).getDay();
    const lastDate = new Date(targetYear, targetMonth + 1, 0).getDate();
    const today = this.attendanceManager.getDateString(new Date());
    
    const presentDates = new Set(
      monthlyStats.dailyRecords
        .filter(r => r.status !== 'absent')
        .map(r => r.date)
    );
    
    let html = `
      <div class="flex items-center justify-between mb-3">
        <button onclick="window.setAttendanceMonth(-1)" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
          <span class="material-symbols-rounded text-gray-500">chevron_left</span>
        </button>
        <span class="font-bold text-gray-800 dark:text-gray-200">${targetYear}년 ${monthNames[targetMonth]}</span>
        <button onclick="window.setAttendanceMonth(1)" class="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors" ${offset >= 0 ? 'disabled style="opacity:0.3"' : ''}>
          <span class="material-symbols-rounded text-gray-500">chevron_right</span>
        </button>
      </div>
      <div class="grid grid-cols-7 gap-1 text-center text-xs">
    `;
    
    dayNames.forEach((day, i) => {
      const color = i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400';
      html += `<div class="${color} font-medium py-1">${day}</div>`;
    });
    
    for (let i = 0; i < firstDay; i++) {
      html += '<div></div>';
    }
    
    for (let d = 1; d <= lastDate; d++) {
      const dateStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isPresent = presentDates.has(dateStr);
      const isToday = dateStr === today;
      const isFuture = dateStr > today;
      
      let cellClass = 'py-1.5 rounded-lg text-sm ';
      if (isFuture) {
        cellClass += 'text-gray-300 dark:text-gray-600';
      } else if (isPresent) {
        cellClass += 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold';
      } else {
        cellClass += 'text-gray-400 dark:text-gray-500';
      }
      
      if (isToday) {
        cellClass += ' ring-2 ring-primary';
      }
      
      html += `<div class="${cellClass}">${d}</div>`;
    }
    
    html += '</div>';
    this.elements.attendanceCalendar.innerHTML = html;
  }

  setAttendanceMonth(offset) {
    this.attendanceMonthOffset += offset;
    this.renderAttendanceCalendar();
  }

  async downloadAttendanceCSV() {
    if (!this.currentAttendanceStudent) return;
    
    const now = new Date();
    const offset = this.attendanceMonthOffset || 0;
    const targetDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    
    const startDate = this.attendanceManager.getDateString(targetDate);
    const endDate = this.attendanceManager.getDateString(new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0));
    
    let csv = '\uFEFF날짜,학생이름,출석시간,퇴실시간,총접속시간,상태\n';
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = this.attendanceManager.getDateString(d);
      if (dateStr > this.attendanceManager.today) break;
      
      const records = await this.attendanceManager.getDailyRecords(dateStr);
      const record = records.find(r => r.studentName === this.currentAttendanceStudent);
      
      if (record) {
        const checkIn = new Date(record.checkInTime).toLocaleTimeString('ko-KR');
        const checkOut = record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('ko-KR') : '-';
        const duration = this.attendanceManager.formatDuration(record.totalTime);
        csv += `${record.date},${record.studentName},${checkIn},${checkOut},${duration},출석\n`;
      } else {
        csv += `${dateStr},${this.currentAttendanceStudent},-,-,-,결석\n`;
      }
    }
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `출석_${this.currentAttendanceStudent}_${targetDate.getFullYear()}년${targetDate.getMonth() + 1}월.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async downloadAttendancePDF() {
    if (!this.currentAttendanceStudent) return;
    
    const now = new Date();
    const offset = this.attendanceMonthOffset || 0;
    const targetDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    
    const summary = await this.attendanceManager.getStudentSummary(this.currentAttendanceStudent);
    const monthlyStats = await this.attendanceManager.getMonthlyStats(
      this.currentAttendanceStudent,
      targetDate.getFullYear(),
      targetDate.getMonth()
    );
    
    const dailyData = [];
    const startDate = this.attendanceManager.getDateString(targetDate);
    const endDate = this.attendanceManager.getDateString(new Date(year, month, 0));
    
    for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
      const dateStr = this.attendanceManager.getDateString(d);
      if (dateStr > this.attendanceManager.today) break;
      
      const records = await this.attendanceManager.getDailyRecords(dateStr);
      const record = records.find(r => r.studentName === this.currentAttendanceStudent);
      
      dailyData.push({
        date: dateStr,
        dayOfWeek: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()],
        checkIn: record ? new Date(record.checkInTime).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : '-',
        checkOut: record?.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('ko-KR', {hour: '2-digit', minute: '2-digit'}) : '-',
        duration: record ? this.attendanceManager.formatDuration(record.totalTime) : '-',
        status: record ? '출석' : '결석'
      });
    }
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>출석부 - ${this.currentAttendanceStudent}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Malgun Gothic', sans-serif; font-size: 11px; color: #333; line-height: 1.4; }
          .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #0D9488; }
          .header h1 { font-size: 22px; color: #0D9488; margin-bottom: 5px; }
          .header p { color: #666; font-size: 12px; }
          .info-box { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .info-card { flex: 1; margin: 0 5px; padding: 12px; background: #f8f9fa; border-radius: 8px; text-align: center; }
          .info-card:first-child { margin-left: 0; }
          .info-card:last-child { margin-right: 0; }
          .info-card .label { font-size: 10px; color: #666; margin-bottom: 3px; }
          .info-card .value { font-size: 18px; font-weight: bold; color: #0D9488; }
          .info-card .sub { font-size: 9px; color: #999; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #0D9488; color: white; padding: 8px 5px; font-size: 10px; font-weight: 600; }
          td { padding: 6px 5px; text-align: center; border-bottom: 1px solid #eee; font-size: 10px; }
          tr:nth-child(even) { background: #f9fafb; }
          .status-present { color: #10B981; font-weight: bold; }
          .status-absent { color: #EF4444; font-weight: bold; }
          .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #999; padding-top: 10px; border-top: 1px solid #eee; }
          .weekend { background: #fef2f2 !important; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📋 출석부</h1>
          <p>${this.currentAttendanceStudent} | ${year}년 ${month}월</p>
        </div>
        <div class="info-box">
          <div class="info-card">
            <div class="label">출석일수</div>
            <div class="value">${summary.monthly.presentDays}일</div>
            <div class="sub">/ ${summary.monthly.totalDays}일</div>
          </div>
          <div class="info-card">
            <div class="label">출석률</div>
            <div class="value">${summary.monthly.rate}%</div>
            <div class="sub">${summary.monthly.rate >= 80 ? '우수' : summary.monthly.rate >= 50 ? '보통' : '주의'}</div>
          </div>
          <div class="info-card">
            <div class="label">총 접속시간</div>
            <div class="value">${this.attendanceManager.formatDuration(summary.monthly.totalTime)}</div>
            <div class="sub">이번 달 누적</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:18%">날짜</th>
              <th style="width:10%">요일</th>
              <th style="width:18%">출석시간</th>
              <th style="width:18%">퇴실시간</th>
              <th style="width:18%">접속시간</th>
              <th style="width:18%">상태</th>
            </tr>
          </thead>
          <tbody>
            ${dailyData.map(d => `
              <tr class="${d.dayOfWeek === '일' || d.dayOfWeek === '토' ? 'weekend' : ''}">
                <td>${d.date}</td>
                <td>${d.dayOfWeek}</td>
                <td>${d.checkIn}</td>
                <td>${d.checkOut}</td>
                <td>${d.duration}</td>
                <td class="${d.status === '출석' ? 'status-present' : 'status-absent'}">${d.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">
          출력일: ${new Date().toLocaleDateString('ko-KR')} | 학생 모니터링 시스템
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  }

  // ==================== 집중도 보고서 ====================
  
  async openFocusReportModal(studentName, grade) {
    this.currentFocusReportStudent = studentName;
    this.currentFocusReportGrade = grade;
    this.focusReportType = 'daily';
    
    if (this.elements.focusReportStudentName) {
      this.elements.focusReportStudentName.textContent = studentName;
    }
    if (this.elements.focusReportStudentGrade) {
      this.elements.focusReportStudentGrade.textContent = grade ? `${grade}학년` : '';
    }
    
    this.updateFocusReportTypeButtons();
    await this.renderFocusReport();
    
    if (this.elements.focusReportModal) {
      this.elements.focusReportModal.style.display = 'flex';
    }
  }

  closeFocusReportModal() {
    this.currentFocusReportStudent = null;
    if (this.elements.focusReportModal) {
      this.elements.focusReportModal.style.display = 'none';
    }
  }

  async setFocusReportType(type) {
    this.focusReportType = type;
    this.updateFocusReportTypeButtons();
    await this.renderFocusReport();
  }

  updateFocusReportTypeButtons() {
    const buttons = document.querySelectorAll('.focus-report-type-btn');
    buttons.forEach(btn => {
      const btnType = btn.dataset.type;
      if (btnType === this.focusReportType) {
        btn.className = 'focus-report-type-btn px-3 py-1.5 text-xs rounded-lg bg-orange-500 text-white font-medium transition-all';
      } else {
        btn.className = 'focus-report-type-btn px-3 py-1.5 text-xs rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium transition-all hover:bg-gray-300 dark:hover:bg-gray-600';
      }
    });
  }

  async renderFocusReport() {
    if (!this.currentFocusReportStudent || !this.elements.focusReportContent) return;
    
    let report;
    let periodLabel;
    let comparison = null;
    
    if (this.focusReportType === 'daily') {
      report = await this.focusReportManager.getDailyReport(this.currentFocusReportStudent);
      periodLabel = report.date;
    } else if (this.focusReportType === 'weekly') {
      report = await this.focusReportManager.getWeeklyReport(this.currentFocusReportStudent);
      periodLabel = `${report.weekStart} ~ 이번 주`;
    } else {
      report = await this.focusReportManager.getMonthlyReport(this.currentFocusReportStudent);
      periodLabel = `${report.year}년 ${report.month}월`;
      comparison = await this.focusReportManager.getMonthlyComparison(this.currentFocusReportStudent);
    }
    
    const attendanceSummary = await this.attendanceManager.getStudentSummary(this.currentFocusReportStudent);
    const grade = this.focusReportManager.getFocusGrade(report.focusRate || 0);
    
    const formatChange = (value, isTime = false) => {
      if (value === 0) return '<span class="text-gray-400">-</span>';
      const sign = value > 0 ? '+' : '';
      const color = value > 0 ? 'text-green-500' : 'text-red-500';
      const icon = value > 0 ? 'trending_up' : 'trending_down';
      const displayValue = isTime ? this.focusReportManager.formatDuration(Math.abs(value)) : `${Math.abs(value)}%`;
      return `<span class="${color} flex items-center gap-0.5 text-[10px]"><span class="material-symbols-rounded text-xs">${icon}</span>${sign}${displayValue}</span>`;
    };
    
    const html = `
      <div class="text-center mb-4">
        <span class="text-xs text-gray-500">${periodLabel}</span>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div class="bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-xl p-3 text-center border border-orange-100 dark:border-orange-800">
          <div class="text-3xl font-bold" style="color: ${grade.color}">${grade.grade}</div>
          <div class="text-xs text-gray-500 mt-1">집중 등급</div>
          <div class="text-xs font-medium" style="color: ${grade.color}">${grade.label}</div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 text-center border border-gray-100 dark:border-gray-700">
          <div class="text-3xl font-bold text-gray-800 dark:text-gray-200">${report.focusRate || 0}%</div>
          <div class="text-xs text-gray-500 mt-1">집중률</div>
          <div class="text-xs text-gray-400">평균 ${report.avgScore || 0}점</div>
        </div>
      </div>
      <div class="space-y-2">
        <div class="flex justify-between items-center p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <div class="flex items-center gap-2">
            <span class="material-symbols-rounded text-blue-500 text-lg">schedule</span>
            <span class="text-sm text-gray-700 dark:text-gray-300">순 집중시간</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-blue-600 dark:text-blue-400">${this.focusReportManager.formatDuration(report.focusedTime || 0)}</span>
            ${this.focusReportType === 'monthly' && comparison?.hasLastMonthData ? formatChange(comparison.changes.focusedTime, true) : ''}
          </div>
        </div>
        <div class="flex justify-between items-center p-2.5 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div class="flex items-center gap-2">
            <span class="material-symbols-rounded text-green-500 text-lg">timer</span>
            <span class="text-sm text-gray-700 dark:text-gray-300">최대 연속 집중</span>
          </div>
          <span class="font-bold text-green-600 dark:text-green-400">${this.focusReportManager.formatDuration(report.maxFocusDuration || 0)}</span>
        </div>
        <div class="flex justify-between items-center p-2.5 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
          <div class="flex items-center gap-2">
            <span class="material-symbols-rounded text-cyan-500 text-lg">event_seat</span>
            <span class="text-sm text-gray-700 dark:text-gray-300">최대 착석 시간</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-bold text-cyan-600 dark:text-cyan-400">${this.focusReportManager.formatDuration(report.maxSeatedDuration || 0)}</span>
            ${this.focusReportType === 'monthly' && comparison?.hasLastMonthData ? formatChange(comparison.changes.maxSeatedDuration, true) : ''}
          </div>
        </div>
        <div class="flex justify-between items-center p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
          <div class="flex items-center gap-2">
            <span class="material-symbols-rounded text-purple-500 text-lg">hourglass_top</span>
            <span class="text-sm text-gray-700 dark:text-gray-300">총 학습시간</span>
          </div>
          <span class="font-bold text-purple-600 dark:text-purple-400">${this.focusReportManager.formatDuration(report.totalTime || 0)}</span>
        </div>
        <div class="flex justify-between items-center p-2.5 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div class="flex items-center gap-2">
            <span class="material-symbols-rounded text-red-500 text-lg">directions_walk</span>
            <span class="text-sm text-gray-700 dark:text-gray-300">자리비움 횟수</span>
          </div>
          <span class="font-bold text-red-600 dark:text-red-400">${report.awayCount || report.totalAwayCount || 0}회</span>
        </div>
        ${this.focusReportType !== 'daily' ? `
        <div class="flex justify-between items-center p-2.5 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
          <div class="flex items-center gap-2">
            <span class="material-symbols-rounded text-teal-500 text-lg">event_available</span>
            <span class="text-sm text-gray-700 dark:text-gray-300">활동일수</span>
          </div>
          <span class="font-bold text-teal-600 dark:text-teal-400">${report.activeDays || 0}일</span>
        </div>
        <div class="flex justify-between items-center p-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
          <div class="flex items-center gap-2">
            <span class="material-symbols-rounded text-indigo-500 text-lg">calendar_month</span>
            <span class="text-sm text-gray-700 dark:text-gray-300">출석일수 (${this.focusReportType === 'weekly' ? '주간' : '월간'})</span>
          </div>
          <span class="font-bold text-indigo-600 dark:text-indigo-400">${this.focusReportType === 'weekly' ? 
            `${attendanceSummary.weekly.presentDays}/${attendanceSummary.weekly.totalDays}일` : 
            `${attendanceSummary.monthly.presentDays}/${attendanceSummary.monthly.totalDays}일`}</span>
        </div>
        ` : ''}
      </div>
    `;
    
    this.elements.focusReportContent.innerHTML = html;
  }

  async downloadFocusReportCSV() {
    if (!this.currentFocusReportStudent) return;
    
    let report;
    let filename;
    let comparison = null;
    
    if (this.focusReportType === 'daily') {
      report = await this.focusReportManager.getDailyReport(this.currentFocusReportStudent);
      filename = `집중도_${this.currentFocusReportStudent}_${report.date}.csv`;
    } else if (this.focusReportType === 'weekly') {
      report = await this.focusReportManager.getWeeklyReport(this.currentFocusReportStudent);
      filename = `집중도_${this.currentFocusReportStudent}_주간_${report.weekStart}.csv`;
    } else {
      report = await this.focusReportManager.getMonthlyReport(this.currentFocusReportStudent);
      filename = `집중도_${this.currentFocusReportStudent}_${report.year}년${report.month}월.csv`;
      comparison = await this.focusReportManager.getMonthlyComparison(this.currentFocusReportStudent);
    }
    
    const attendanceSummary = await this.attendanceManager.getStudentSummary(this.currentFocusReportStudent);
    const attendanceData = this.focusReportType === 'weekly' ? attendanceSummary.weekly : attendanceSummary.monthly;
    
    let csv = '\uFEFF이름,학년,기간,집중률,평균점수,순집중시간(초),최대연속집중(초),최대착석시간(초),총학습시간(초),자리비움횟수,출석일수,출석률';
    
    if (this.focusReportType === 'monthly') {
      csv += ',순집중시간변화(초),순집중시간변화율(%),최대착석시간변화(초),최대착석시간변화율(%)';
    }
    csv += '\n';
    
    const grade = this.currentFocusReportGrade || '';
    const period = this.focusReportType === 'daily' ? report.date : 
                   this.focusReportType === 'weekly' ? `${report.weekStart}~주간` : 
                   `${report.year}년${report.month}월`;
    
    const attendanceDays = this.focusReportType === 'daily' ? '-' : `${attendanceData.presentDays}/${attendanceData.totalDays}`;
    const attendanceRate = this.focusReportType === 'daily' ? '-' : `${attendanceData.rate}%`;
    
    csv += `${this.currentFocusReportStudent},${grade}학년,${period},${report.focusRate || 0}%,${report.avgScore || 0},${report.focusedTime || 0},${report.maxFocusDuration || 0},${report.maxSeatedDuration || 0},${report.totalTime || 0},${report.awayCount || report.totalAwayCount || 0},${attendanceDays},${attendanceRate}`;
    
    if (this.focusReportType === 'monthly' && comparison) {
      csv += `,${comparison.changes.focusedTime},${comparison.changes.focusedTimePercent}%,${comparison.changes.maxSeatedDuration},${comparison.changes.maxSeatedDurationPercent}%`;
    }
    csv += '\n';
    
    if (report.days && report.days.length > 0) {
      csv += '\n날짜,집중률,평균점수,순집중시간(초),최대연속집중(초),최대착석시간(초),총학습시간(초),자리비움횟수\n';
      report.days.forEach(day => {
        if (day.hasData) {
          csv += `${day.date},${day.focusRate}%,${day.avgScore},${day.focusedTime},${day.maxFocusDuration},${day.maxSeatedDuration || 0},${day.totalTime},${day.awayCount}\n`;
        }
      });
    }
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async downloadFocusReportPDF() {
    if (!this.currentFocusReportStudent) return;
    
    let report;
    let periodLabel;
    let comparison = null;
    
    if (this.focusReportType === 'daily') {
      report = await this.focusReportManager.getDailyReport(this.currentFocusReportStudent);
      periodLabel = report.date;
    } else if (this.focusReportType === 'weekly') {
      report = await this.focusReportManager.getWeeklyReport(this.currentFocusReportStudent);
      periodLabel = `${report.weekStart} ~ 이번 주`;
    } else {
      report = await this.focusReportManager.getMonthlyReport(this.currentFocusReportStudent);
      periodLabel = `${report.year}년 ${report.month}월`;
      comparison = await this.focusReportManager.getMonthlyComparison(this.currentFocusReportStudent);
    }
    
    const attendanceSummary = await this.attendanceManager.getStudentSummary(this.currentFocusReportStudent);
    const grade = this.focusReportManager.getFocusGrade(report.focusRate || 0);
    const studentGrade = this.currentFocusReportGrade ? `${this.currentFocusReportGrade}학년` : '';
    
    const formatChangeText = (value, isTime = false) => {
      if (!comparison?.hasLastMonthData || value === 0) return '';
      const sign = value > 0 ? '+' : '';
      const arrow = value > 0 ? '↑' : '↓';
      const displayValue = isTime ? this.focusReportManager.formatDuration(Math.abs(value)) : `${Math.abs(value)}%`;
      return ` <span style="color: ${value > 0 ? '#10B981' : '#EF4444'}; font-size: 10px;">(${arrow}${sign}${displayValue})</span>`;
    };
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>집중도 보고서 - ${this.currentFocusReportStudent}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Malgun Gothic', sans-serif; font-size: 11px; color: #333; line-height: 1.5; }
          .header { text-align: center; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 3px solid #F97316; }
          .header h1 { font-size: 24px; color: #F97316; margin-bottom: 8px; }
          .header .student-info { font-size: 14px; color: #666; }
          .header .period { font-size: 12px; color: #999; margin-top: 5px; }
          .grade-box { text-align: center; margin: 20px 0; padding: 20px; background: linear-gradient(135deg, #FFF7ED, #FFFBEB); border-radius: 12px; }
          .grade-box .grade { font-size: 48px; font-weight: bold; color: ${grade.color}; }
          .grade-box .label { font-size: 14px; color: #666; margin-top: 5px; }
          .grade-box .sublabel { font-size: 12px; color: ${grade.color}; font-weight: bold; }
          .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 20px 0; }
          .stat-card { padding: 15px; border-radius: 10px; text-align: center; }
          .stat-card.blue { background: #EFF6FF; }
          .stat-card.green { background: #ECFDF5; }
          .stat-card.cyan { background: #ECFEFF; }
          .stat-card.purple { background: #F5F3FF; }
          .stat-card.red { background: #FEF2F2; }
          .stat-card.indigo { background: #EEF2FF; }
          .stat-card.teal { background: #F0FDFA; }
          .stat-card .value { font-size: 18px; font-weight: bold; color: #333; }
          .stat-card .label { font-size: 10px; color: #666; margin-top: 3px; }
          .summary { margin-top: 20px; padding: 15px; background: #F9FAFB; border-radius: 10px; }
          .summary h3 { font-size: 12px; color: #666; margin-bottom: 10px; }
          .summary p { font-size: 11px; color: #333; line-height: 1.8; }
          .footer { margin-top: 25px; text-align: center; font-size: 9px; color: #999; padding-top: 10px; border-top: 1px solid #eee; }
          ${report.days ? `
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #F97316; color: white; padding: 8px 5px; font-size: 10px; }
          td { padding: 6px 5px; text-align: center; border-bottom: 1px solid #eee; font-size: 10px; }
          tr:nth-child(even) { background: #f9fafb; }
          ` : ''}
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📊 집중도 보고서</h1>
          <div class="student-info">${this.currentFocusReportStudent} ${studentGrade}</div>
          <div class="period">${periodLabel}</div>
        </div>
        
        <div class="grade-box">
          <div class="grade">${grade.grade}</div>
          <div class="label">집중 등급</div>
          <div class="sublabel">${grade.label}</div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card blue">
            <div class="value">${report.focusRate || 0}%</div>
            <div class="label">집중률</div>
          </div>
          <div class="stat-card green">
            <div class="value">${this.focusReportManager.formatDuration(report.focusedTime || 0)}${this.focusReportType === 'monthly' ? formatChangeText(comparison?.changes?.focusedTime || 0, true) : ''}</div>
            <div class="label">순 집중시간</div>
          </div>
          <div class="stat-card purple">
            <div class="value">${this.focusReportManager.formatDuration(report.maxFocusDuration || 0)}</div>
            <div class="label">최대 연속 집중</div>
          </div>
          <div class="stat-card cyan">
            <div class="value">${this.focusReportManager.formatDuration(report.maxSeatedDuration || 0)}${this.focusReportType === 'monthly' ? formatChangeText(comparison?.changes?.maxSeatedDuration || 0, true) : ''}</div>
            <div class="label">최대 착석 시간</div>
          </div>
          <div class="stat-card red">
            <div class="value">${report.awayCount || report.totalAwayCount || 0}회</div>
            <div class="label">자리비움 횟수</div>
          </div>
          <div class="stat-card purple">
            <div class="value">${this.focusReportManager.formatDuration(report.totalTime || 0)}</div>
            <div class="label">총 학습시간</div>
          </div>
          ${this.focusReportType !== 'daily' ? `
          <div class="stat-card indigo">
            <div class="value">${this.focusReportType === 'weekly' ? 
              `${attendanceSummary.weekly.presentDays}/${attendanceSummary.weekly.totalDays}` : 
              `${attendanceSummary.monthly.presentDays}/${attendanceSummary.monthly.totalDays}`}일</div>
            <div class="label">출석일수</div>
          </div>
          <div class="stat-card teal">
            <div class="value">${report.activeDays || 0}일</div>
            <div class="label">활동일수</div>
          </div>
          ` : ''}
        </div>
        
        ${this.focusReportType === 'monthly' && comparison?.hasLastMonthData ? `
        <div class="comparison-box" style="margin: 15px 0; padding: 12px; background: #F0FDF4; border-radius: 8px; border-left: 4px solid #10B981;">
          <h4 style="font-size: 11px; color: #166534; margin-bottom: 8px; font-weight: bold;">📈 지난달(${comparison.lastMonth.month}월) 대비 변화</h4>
          <div style="display: flex; gap: 20px; font-size: 10px; color: #333;">
            <div>
              <span style="color: #666;">순 집중시간:</span>
              <strong style="color: ${comparison.changes.focusedTime >= 0 ? '#10B981' : '#EF4444'};">
                ${comparison.changes.focusedTime >= 0 ? '+' : ''}${this.focusReportManager.formatDuration(comparison.changes.focusedTime)}
                (${comparison.changes.focusedTimePercent >= 0 ? '+' : ''}${comparison.changes.focusedTimePercent}%)
              </strong>
            </div>
            <div>
              <span style="color: #666;">최대 착석시간:</span>
              <strong style="color: ${comparison.changes.maxSeatedDuration >= 0 ? '#10B981' : '#EF4444'};">
                ${comparison.changes.maxSeatedDuration >= 0 ? '+' : ''}${this.focusReportManager.formatDuration(comparison.changes.maxSeatedDuration)}
                (${comparison.changes.maxSeatedDurationPercent >= 0 ? '+' : ''}${comparison.changes.maxSeatedDurationPercent}%)
              </strong>
            </div>
          </div>
        </div>
        ` : ''}
        
        <div class="summary">
          <h3>📋 요약</h3>
          <p>
            <strong>${this.currentFocusReportStudent}</strong> 학생은 
            총 <strong>${this.focusReportManager.formatDuration(report.totalTime || 0)}</strong> 동안 학습하였으며,
            이 중 <strong>${this.focusReportManager.formatDuration(report.focusedTime || 0)}</strong>을 집중하여 
            <strong>${report.focusRate || 0}%</strong>의 집중률을 기록했습니다.
            최대 연속 집중 시간은 <strong>${this.focusReportManager.formatDuration(report.maxFocusDuration || 0)}</strong>이며,
            최대 착석 시간은 <strong>${this.focusReportManager.formatDuration(report.maxSeatedDuration || 0)}</strong>입니다.
            ${this.focusReportType !== 'daily' ? `
            출석일수는 <strong>${this.focusReportType === 'weekly' ? 
              `${attendanceSummary.weekly.presentDays}/${attendanceSummary.weekly.totalDays}일 (${attendanceSummary.weekly.rate}%)` : 
              `${attendanceSummary.monthly.presentDays}/${attendanceSummary.monthly.totalDays}일 (${attendanceSummary.monthly.rate}%)`}</strong>입니다.
            ` : ''}
            ${this.focusReportType === 'monthly' && comparison?.hasLastMonthData ? `
            지난달 대비 순 집중시간은 <strong style="color: ${comparison.changes.focusedTime >= 0 ? '#10B981' : '#EF4444'};">${comparison.changes.focusedTime >= 0 ? '+' : ''}${this.focusReportManager.formatDuration(comparison.changes.focusedTime)}</strong>,
            최대 착석시간은 <strong style="color: ${comparison.changes.maxSeatedDuration >= 0 ? '#10B981' : '#EF4444'};">${comparison.changes.maxSeatedDuration >= 0 ? '+' : ''}${this.focusReportManager.formatDuration(comparison.changes.maxSeatedDuration)}</strong> 변화했습니다.
            ` : ''}
          </p>
        </div>
        
        ${report.days && report.days.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>날짜</th>
              <th>집중률</th>
              <th>평균점수</th>
              <th>순집중시간</th>
              <th>최대연속</th>
              <th>자리비움</th>
            </tr>
          </thead>
          <tbody>
            ${report.days.filter(d => d.hasData).map(d => `
              <tr>
                <td>${d.date}</td>
                <td>${d.focusRate}%</td>
                <td>${d.avgScore}점</td>
                <td>${this.focusReportManager.formatDuration(d.focusedTime)}</td>
                <td>${this.focusReportManager.formatDuration(d.maxFocusDuration)}</td>
                <td>${d.awayCount}회</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ` : ''}
        
        <div class="footer">
          출력일: ${new Date().toLocaleDateString('ko-KR')} | 학생 모니터링 시스템
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
  }

  // ==================== 화면 공유 썸네일 ====================

  /**
   * 화면 썸네일 수신 처리
   */
  handleScreenThumbnail(peerId, data) {
    const student = this.studentManager.getStudent(peerId);
    if (!student) return;

    // 학생 데이터에 썸네일 저장
    student.screenThumbnail = data.thumbnail;
    student.screenThumbnailTime = data.timestamp;

    // 카드 업데이트
    this.updateScreenThumbnailInCard(peerId, data.thumbnail);
    
    // 썸네일 모달이 열려있으면 업데이트
    if (this.currentScreenStudent === peerId) {
      this.updateScreenModal(data.thumbnail);
    }
  }

  /**
   * 화면 공유 상태 변경 처리
   */
  handleScreenShareStatus(peerId, data) {
    const student = this.studentManager.getStudent(peerId);
    if (!student) return;

    student.isScreenSharing = data.sharing;
    
    if (data.sharing) {
      this.alertManager.addAlert(`🖥️ ${data.name} 학생이 화면 공유를 시작했습니다.`, 'info');
    } else {
      this.alertManager.addAlert(`🖥️ ${data.name} 학생이 화면 공유를 중지했습니다.`, 'info');
      student.screenThumbnail = null;
    }

    // 카드 업데이트
    this.renderStudentGrid();
  }

  /**
   * 카드 내 썸네일 업데이트
   */
  updateScreenThumbnailInCard(peerId, thumbnail) {
    const card = document.querySelector(`[data-peer-id="${peerId}"]`);
    if (!card) return;

    let thumbnailContainer = card.querySelector('.screen-thumbnail-container');
    
    if (!thumbnailContainer) {
      // 썸네일 컨테이너 생성
      thumbnailContainer = document.createElement('div');
      thumbnailContainer.className = 'screen-thumbnail-container mt-2 pt-2 border-t border-gray-100 dark:border-gray-700';
      thumbnailContainer.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] text-gray-400 flex items-center gap-1">
            <span class="material-symbols-rounded text-xs">screen_share</span>
            화면
          </span>
          <button class="btn-view-screen text-[10px] text-indigo-500 hover:text-indigo-600 font-medium">확대</button>
        </div>
        <img class="screen-thumbnail w-full rounded-md border border-gray-200 dark:border-gray-600 cursor-pointer hover:opacity-90 transition-opacity" />
      `;
      
      const centerDiv = card.querySelector('.text-center');
      if (centerDiv) {
        centerDiv.appendChild(thumbnailContainer);
      }

      // 클릭 이벤트 바인딩
      const img = thumbnailContainer.querySelector('.screen-thumbnail');
      const viewBtn = thumbnailContainer.querySelector('.btn-view-screen');
      
      const openModal = () => this.openScreenModal(peerId);
      img?.addEventListener('click', openModal);
      viewBtn?.addEventListener('click', openModal);
    }

    // 이미지 업데이트
    const img = thumbnailContainer.querySelector('.screen-thumbnail');
    if (img && thumbnail) {
      img.src = thumbnail;
    }
  }

  /**
   * 화면 썸네일 모달 열기
   */
  openScreenModal(peerId) {
    const student = this.studentManager.getStudent(peerId);
    if (!student || !student.screenThumbnail) return;

    this.currentScreenStudent = peerId;

    // 모달이 없으면 생성
    let modal = document.getElementById('screen-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'screen-modal';
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
      modal.innerHTML = `
        <div class="absolute inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm" onclick="window.closeScreenModal()"></div>
        <div class="relative z-10 w-full max-w-4xl bg-card-light dark:bg-card-dark rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <div class="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-3 text-white">
              <span class="material-symbols-rounded text-2xl">screen_share</span>
              <div>
                <h2 id="screen-modal-name" class="text-lg font-bold"></h2>
                <p id="screen-modal-time" class="text-white/70 text-xs"></p>
              </div>
            </div>
            <button onclick="window.closeScreenModal()" class="text-white/80 hover:text-white hover:bg-white/10 p-2 rounded-full transition-colors">
              <span class="material-symbols-rounded text-xl">close</span>
            </button>
          </div>
          <div class="p-4 bg-slate-900">
            <img id="screen-modal-image" class="w-full rounded-lg" />
          </div>
          <div class="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span class="text-xs text-slate-500 dark:text-slate-400">10초마다 자동 업데이트</span>
            <div class="flex items-center gap-1.5 text-xs text-green-500">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              실시간
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    // 모달 내용 업데이트
    document.getElementById('screen-modal-name').textContent = `${student.name} 학생의 화면`;
    this.updateScreenModal(student.screenThumbnail);

    modal.style.display = 'flex';

    // 전역 함수 등록
    window.closeScreenModal = () => this.closeScreenModal();
  }

  /**
   * 화면 모달 업데이트
   */
  updateScreenModal(thumbnail) {
    const img = document.getElementById('screen-modal-image');
    const time = document.getElementById('screen-modal-time');
    
    if (img && thumbnail) {
      img.src = thumbnail;
    }
    if (time) {
      time.textContent = `마지막 업데이트: ${new Date().toLocaleTimeString('ko-KR')}`;
    }
  }

  /**
   * 화면 모달 닫기
   */
  closeScreenModal() {
    this.currentScreenStudent = null;
    const modal = document.getElementById('screen-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // ==================== 이해도 체크 ====================

  /**
   * 이해도 체크 질문 모달 열기
   */
  openUnderstandingQuestionModal() {
    const modal = document.getElementById('understanding-question-modal');
    const input = document.getElementById('understanding-question-input');
    
    if (modal) {
      modal.style.display = 'flex';
      if (input) {
        input.value = '지금 설명한 내용이 이해가 되나요?';
        input.focus();
        input.select();
      }
    }
  }

  /**
   * 이해도 체크 질문 모달 닫기
   */
  closeUnderstandingQuestionModal() {
    const modal = document.getElementById('understanding-question-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * 이해도 체크 전송
   */
  sendUnderstandingCheck() {
    const questionInput = document.getElementById('understanding-question-input');
    const timeLimitInput = document.getElementById('understanding-time-limit');
    
    const question = questionInput?.value?.trim() || '지금 설명한 내용이 이해가 되나요?';
    const timeLimit = parseInt(timeLimitInput?.value) || 10;
    
    // 접속 중인 학생 목록 가져오기
    const students = this.studentManager.getAllStudents();
    const connectedStudents = Array.from(students.entries()).filter(([_, s]) => s.status !== 'disconnected');
    
    if (connectedStudents.length === 0) {
      alert('접속 중인 학생이 없습니다.');
      return;
    }
    
    // 이해도 체크 세션 초기화
    this.understandingCheckSession = {
      question,
      timeLimit,
      startTime: Date.now(),
      responses: new Map(), // peerId -> { answer: 'yes'|'no', name, timestamp }
      totalStudents: connectedStudents.length,
      studentList: connectedStudents.map(([peerId, s]) => ({ peerId, name: s.name }))
    };
    
    // 모든 학생에게 질문 전송
    this.peerManager.send(null, {
      type: 'understanding_check',
      question,
      timeLimit,
      timestamp: Date.now()
    });
    
    // 질문 모달 닫기
    this.closeUnderstandingQuestionModal();
    
    // 결과 모달 열기
    this.openUnderstandingResultModal();
    
    // 타이머 시작
    this.startUnderstandingTimer(timeLimit);
    
    // 알림
    this.alertManager.addAlert(`📊 이해도 체크 전송됨 (${connectedStudents.length}명)`, 'info');
  }

  /**
   * 이해도 체크 결과 모달 열기
   */
  openUnderstandingResultModal() {
    const modal = document.getElementById('understanding-result-modal');
    const questionEl = document.getElementById('understanding-result-question');
    
    if (modal && this.understandingCheckSession) {
      questionEl.textContent = this.understandingCheckSession.question;
      modal.style.display = 'flex';
      this.updateUnderstandingResultUI();
    }
  }

  /**
   * 이해도 체크 결과 모달 닫기
   */
  closeUnderstandingResultModal() {
    const modal = document.getElementById('understanding-result-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    
    // 타이머 정리
    if (this.understandingTimerInterval) {
      clearInterval(this.understandingTimerInterval);
      this.understandingTimerInterval = null;
    }
  }

  /**
   * 이해도 체크 타이머 시작
   */
  startUnderstandingTimer(seconds) {
    let remaining = seconds;
    const timerEl = document.getElementById('understanding-result-timer');
    const statusEl = document.getElementById('understanding-result-status');
    
    // 기존 타이머 정리
    if (this.understandingTimerInterval) {
      clearInterval(this.understandingTimerInterval);
    }
    
    this.understandingTimerInterval = setInterval(() => {
      remaining--;
      
      if (timerEl) {
        timerEl.textContent = remaining;
      }
      
      if (remaining <= 0) {
        clearInterval(this.understandingTimerInterval);
        this.understandingTimerInterval = null;
        
        // 타이머 종료 UI
        if (statusEl) {
          statusEl.innerHTML = `
            <span class="material-symbols-rounded text-green-600">check_circle</span>
            <span class="font-medium text-green-700 dark:text-green-400">응답 완료</span>
          `;
          statusEl.className = 'flex items-center justify-center gap-2 py-2 px-4 bg-green-100 dark:bg-green-900/30 rounded-lg';
        }
        
        // 최종 결과 알림
        this.showUnderstandingFinalResult();
      }
    }, 1000);
  }

  /**
   * 이해도 체크 응답 처리
   */
  handleUnderstandingResponse(peerId, data) {
    if (!this.understandingCheckSession) return;
    
    const student = this.studentManager.getStudent(peerId);
    const studentName = student?.name || data.name || '알 수 없음';
    
    // 응답 저장
    this.understandingCheckSession.responses.set(peerId, {
      answer: data.answer,
      name: studentName,
      timestamp: Date.now()
    });
    
    // UI 업데이트
    this.updateUnderstandingResultUI();
  }

  /**
   * 이해도 체크 결과 UI 업데이트
   */
  updateUnderstandingResultUI() {
    if (!this.understandingCheckSession) return;
    
    const { responses, totalStudents, studentList } = this.understandingCheckSession;
    
    // 집계
    let yesCount = 0;
    let noCount = 0;
    
    responses.forEach(r => {
      if (r.answer === 'yes') yesCount++;
      else if (r.answer === 'no') noCount++;
    });
    
    const pendingCount = totalStudents - responses.size;
    const responseRate = totalStudents > 0 ? Math.round((responses.size / totalStudents) * 100) : 0;
    
    // 숫자 업데이트
    document.getElementById('understanding-yes-count').textContent = yesCount;
    document.getElementById('understanding-no-count').textContent = noCount;
    document.getElementById('understanding-pending-count').textContent = pendingCount;
    document.getElementById('understanding-response-rate').textContent = responseRate + '%';
    
    // 프로그레스 바
    const yesPercent = totalStudents > 0 ? (yesCount / totalStudents) * 100 : 0;
    const noPercent = totalStudents > 0 ? (noCount / totalStudents) * 100 : 0;
    
    document.getElementById('understanding-yes-bar').style.width = yesPercent + '%';
    document.getElementById('understanding-no-bar').style.width = noPercent + '%';
    
    // 응답 목록
    const listEl = document.getElementById('understanding-response-list');
    if (listEl) {
      let html = '';
      
      studentList.forEach(({ peerId, name }) => {
        const response = responses.get(peerId);
        
        if (response) {
          const isYes = response.answer === 'yes';
          const icon = isYes ? 'check_circle' : 'cancel';
          const color = isYes ? 'emerald' : 'red';
          const text = isYes ? '예' : '아니요';
          
          html += `
            <div class="flex items-center justify-between p-2 bg-${color}-50 dark:bg-${color}-900/20 rounded-lg border border-${color}-100 dark:border-${color}-800">
              <span class="font-medium text-sm text-gray-800 dark:text-gray-200">${name}</span>
              <div class="flex items-center gap-1 text-${color}-600 dark:text-${color}-400">
                <span class="material-symbols-rounded text-sm">${icon}</span>
                <span class="text-xs font-medium">${text}</span>
              </div>
            </div>
          `;
        } else {
          html += `
            <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <span class="font-medium text-sm text-gray-600 dark:text-gray-400">${name}</span>
              <div class="flex items-center gap-1 text-gray-400">
                <span class="material-symbols-rounded text-sm animate-pulse">hourglass_empty</span>
                <span class="text-xs">대기중</span>
              </div>
            </div>
          `;
        }
      });
      
      listEl.innerHTML = html;
    }
  }

  /**
   * 이해도 체크 최종 결과 알림
   */
  showUnderstandingFinalResult() {
    if (!this.understandingCheckSession) return;
    
    const { responses, totalStudents } = this.understandingCheckSession;
    
    let yesCount = 0;
    let noCount = 0;
    
    responses.forEach(r => {
      if (r.answer === 'yes') yesCount++;
      else if (r.answer === 'no') noCount++;
    });
    
    const yesPercent = totalStudents > 0 ? Math.round((yesCount / totalStudents) * 100) : 0;
    
    if (yesPercent >= 80) {
      this.alertManager.addAlert(`✅ 이해도 체크 완료: ${yesPercent}%가 이해함 (${yesCount}/${totalStudents}명)`, 'success');
    } else if (yesPercent >= 50) {
      this.alertManager.addAlert(`⚠️ 이해도 체크 완료: ${yesPercent}%가 이해함 - 추가 설명 권장`, 'warning');
    } else {
      this.alertManager.addAlert(`❌ 이해도 체크 완료: ${yesPercent}%만 이해함 - 다시 설명 필요`, 'warning');
      this.alertManager.playSound();
    }
  }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
  const app = new TeacherApp();
  app.init();
});

export { TeacherApp };
