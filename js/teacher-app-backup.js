/**
 * 교사용 대시보드 앱
 * - 학생들의 상태 수신 및 표시
 * - 자리비움 알림
 */
import { CONFIG, STATUS, STATUS_LABEL, STATUS_COLOR, NO_RESPONSE_THRESHOLD, FOCUS_LEVEL, FOCUS_LABEL, FOCUS_COLOR, CLASS_MODE, CLASS_MODE_LABEL } from './config.js';
import { PeerManager } from './peer-manager.js';
import { AttendanceManager } from './attendance-manager.js';
import { FocusReportManager } from './focus-report-manager.js';

class TeacherApp {
  constructor() {
    this.peerManager = new PeerManager();
    this.attendanceManager = new AttendanceManager();
    this.focusReportManager = new FocusReportManager();
    this.students = new Map(); // peerId -> studentData
    this.alertSound = null;
    this.currentVideoStudent = null; // 현재 영상 보는 학생
    this.currentMessageTarget = null; // 메시지 대상 (null이면 전체)
    this.currentFocusStudent = null; // 현재 집중도 보는 학생
    this.currentAttendanceStudent = null; // 현재 출석 보는 학생
    this.currentFocusReportStudent = null; // 현재 집중도 보고서 학생
    this.focusReportType = 'daily'; // daily, weekly, monthly
    this.chartRange = 60; // 차트 표시 범위 (초)
    this.focusChart = null; // Chart.js 인스턴스
    this.currentPTTTarget = null; // 현재 PTT 대상 학생
    
    // 수업 시간 관리
    this.classMode = CLASS_MODE.STOPPED; // 현재 모드
    this.classTimerInterval = null; // 타이머 인터벌
    this.remainingSeconds = 0; // 남은 시간 (초)
    this.lessonDuration = CONFIG.classTime.lessonDuration; // 수업 시간 (분)
    this.breakDuration = CONFIG.classTime.breakDuration; // 쉬는 시간 (분)
    this.lessonCount = 0; // 수업 교시
    this.notifiedBeforeEnd = false; // 종료 전 알림 여부
  }

  async init() {
    // DOM 요소
    this.elements = {
      setupSection: document.getElementById('setup-section'),
      dashboardSection: document.getElementById('dashboard-section'),
      teacherIdDisplay: document.getElementById('teacher-id-display'),
      copyIdBtn: document.getElementById('copy-id-btn'),
      startServerBtn: document.getElementById('start-server-btn'),
      studentGrid: document.getElementById('student-grid'),
      totalStudents: document.getElementById('total-students'),
      standingCount: document.getElementById('standing-count'),
      sittingCount: document.getElementById('sitting-count'),
      awayCount: document.getElementById('away-count'),
      alertList: document.getElementById('alert-list'),
      alertSound: document.getElementById('alert-sound'),
      videoModal: document.getElementById('video-modal'),
      modalVideo: document.getElementById('modal-video'),
      modalStudentName: document.getElementById('modal-student-name'),
      closeModalBtn: document.getElementById('close-modal-btn'),
      handRaisedCount: document.getElementById('hand-raised-count'),
      connectionBadge: document.getElementById('connection-badge'),
      teacherIdBox: document.getElementById('teacher-id-box'),
      setupContent: document.getElementById('setup-content'),
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
      // 메시지 관련
      broadcastBtn: document.getElementById('broadcast-btn'),
      messageModal: document.getElementById('message-modal'),
      messageModalTitle: document.getElementById('message-modal-title'),
      messageTargetInfo: document.getElementById('message-target-info'),
      messageInput: document.getElementById('message-input'),
      closeMessageModalBtn: document.getElementById('close-message-modal-btn'),
      cancelMessageBtn: document.getElementById('cancel-message-btn'),
      sendMessageBtn: document.getElementById('send-message-btn'),
      // 커스텀 ID 관련
      useCustomId: document.getElementById('use-custom-id'),
      customIdInput: document.getElementById('custom-id-input'),
      customIdHint: document.getElementById('custom-id-hint'),
      // 출석 관련
      attendanceBtn: document.getElementById('attendance-btn'),
      attendanceModal: document.getElementById('attendance-modal'),
      closeAttendanceModalBtn: document.getElementById('close-attendance-modal-btn'),
      attendanceStudentName: document.getElementById('attendance-student-name'),
      attendanceWeeklyDays: document.getElementById('attendance-weekly-days'),
      attendanceWeeklyRate: document.getElementById('attendance-weekly-rate'),
      attendanceWeeklyTime: document.getElementById('attendance-weekly-time'),
      attendanceMonthlyDays: document.getElementById('attendance-monthly-days'),
      attendanceMonthlyRate: document.getElementById('attendance-monthly-rate'),
      attendanceMonthlyTime: document.getElementById('attendance-monthly-time'),
      attendanceCalendar: document.getElementById('attendance-calendar'),
      todayAttendanceCount: document.getElementById('today-attendance-count'),
      // 오늘 출석자 명단 모달 관련
      todayAttendanceCard: document.getElementById('today-attendance-card'),
      todayAttendanceModal: document.getElementById('today-attendance-modal'),
      todayAttendanceDate: document.getElementById('today-attendance-date'),
      todayAttendanceTotal: document.getElementById('today-attendance-total'),
      todayAttendanceList: document.getElementById('today-attendance-list'),
      // 집중도 보고서 관련
      focusReportModal: document.getElementById('focus-report-modal'),
      closeFocusReportModalBtn: document.getElementById('close-focus-report-modal-btn'),
      focusReportStudentName: document.getElementById('focus-report-student-name'),
      focusReportStudentGrade: document.getElementById('focus-report-student-grade'),
      focusReportType: document.getElementById('focus-report-type'),
      focusReportContent: document.getElementById('focus-report-content'),
      // 수업 시간 관련
      classTimerBar: document.getElementById('class-timer-bar'),
      classTimerStatus: document.getElementById('class-timer-status'),
      classTimerTime: document.getElementById('class-timer-time'),
      classTimerProgress: document.getElementById('class-timer-progress'),
      classTimerToggle: document.getElementById('class-timer-toggle'),
      classTimerSettings: document.getElementById('class-timer-settings'),
      classSettingsModal: document.getElementById('class-settings-modal'),
      lessonDurationInput: document.getElementById('lesson-duration-input'),
      breakDurationInput: document.getElementById('break-duration-input'),
      saveClassSettingsBtn: document.getElementById('save-class-settings-btn')
    };

    this.alertSound = this.elements.alertSound;
    
    // 출석 관리자 초기화
    await this.attendanceManager.init();
    
    // 집중도 보고서 관리자 초기화
    await this.focusReportManager.init();
    
    // 저장된 수업 시간 설정 불러오기
    this.loadClassTimeSettings();
    
    // 오늘 출석 카운트 초기화
    this.updateTodayAttendance();

    // 이벤트 바인딩
    this.elements.startServerBtn.addEventListener('click', () => this.startServer());
    this.elements.copyIdBtn.addEventListener('click', () => this.copyTeacherId());
    this.elements.closeModalBtn.addEventListener('click', () => this.closeVideoModal());
    this.elements.closeFocusDetailBtn?.addEventListener('click', () => this.closeFocusDetailModal());
    
    // 커스텀 ID 체크박스 토글
    this.elements.useCustomId.addEventListener('change', (e) => {
      const show = e.target.checked;
      this.elements.customIdInput.classList.toggle('hidden', !show);
      this.elements.customIdHint.classList.toggle('hidden', !show);
      if (show) {
        this.elements.customIdInput.focus();
        // 저장된 ID 불러오기
        const savedId = localStorage.getItem('customTeacherId');
        if (savedId) {
          this.elements.customIdInput.value = savedId;
        }
      }
    });

    // 이벤트 바인딩
    this.elements.startServerBtn.addEventListener('click', () => this.startServer());
    this.elements.copyIdBtn.addEventListener('click', () => this.copyTeacherId());
    this.elements.closeModalBtn.addEventListener('click', () => this.closeVideoModal());
    this.elements.closeFocusDetailBtn?.addEventListener('click', () => this.closeFocusDetailModal());
    
    // 차트 범위 변경 함수를 전역으로 노출
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
    
    // 수업 시간 관련 전역 함수
    window.toggleClassTimer = () => this.toggleClassTimer();
    window.openClassSettings = () => this.openClassSettingsModal();
    window.closeClassSettings = () => this.closeClassSettingsModal();
    window.saveClassSettings = () => this.saveClassSettings();
    window.forceBreak = () => this.forceBreak();
    window.forceLesson = () => this.forceLesson();
    
    // 메시지 관련 이벤트 - 이벤트 위임 사용
    document.addEventListener('click', (e) => {
      // 전체 공지 버튼
      if (e.target.closest('#broadcast-btn')) {
        console.log('[TeacherApp] 전체 공지 버튼 클릭');
        this.openMessageModal(null);
      }
      // 메시지 모달 닫기
      if (e.target.closest('#close-message-modal-btn') || e.target.closest('#cancel-message-btn')) {
        this.closeMessageModal();
      }
      // 메시지 전송
      if (e.target.closest('#send-message-btn')) {
        this.sendMessage();
      }
    });

    // 오늘 출석 카드 클릭 이벤트
    if (this.elements.todayAttendanceCard) {
      this.elements.todayAttendanceCard.addEventListener('click', () => {
        this.openTodayAttendanceModal();
      });
    }

    // 1초마다 자리비움 시간 업데이트
    setInterval(() => this.updateAwayTimers(), 1000);
  }

  async startServer() {
    try {
      // 커스텀 ID 확인
      let customId = null;
      if (this.elements.useCustomId.checked) {
        customId = this.elements.customIdInput.value.trim();
        if (!customId) {
          alert('고정 ID를 입력해주세요.');
          return;
        }
        // ID 형식 검증 (영문, 숫자, 하이픈만 허용)
        if (!/^[a-zA-Z0-9-]+$/.test(customId)) {
          alert('ID는 영문, 숫자, 하이픈(-)만 사용할 수 있습니다.');
          return;
        }
        // 커스텀 ID 저장
        localStorage.setItem('customTeacherId', customId);
      }

      this.elements.startServerBtn.disabled = true;
      this.elements.startServerBtn.textContent = '연결 중...';

      // PeerJS 초기화 (교사용 ID 생성 또는 커스텀 ID 사용)
      const myId = await this.peerManager.init('teacher', customId);
      
      this.elements.teacherIdDisplay.value = myId;
      this.elements.dashboardSection.classList.remove('hidden');
      this.elements.startServerBtn.textContent = '서버 실행 중';
      this.elements.startServerBtn.disabled = true;
      this.elements.connectionBadge.classList.remove('hidden');
      this.elements.connectionBadge.classList.add('flex');
      this.elements.teacherIdBox.classList.remove('hidden');
      this.elements.setupContent.classList.add('hidden');

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

      // 저장
      localStorage.setItem('teacherId', myId);

    } catch (error) {
      console.error('서버 시작 실패:', error);
      this.elements.startServerBtn.disabled = false;
      this.elements.startServerBtn.textContent = '서버 시작';
      
      // ID 중복 에러 처리
      if (error.type === 'unavailable-id') {
        alert('이전 세션이 아직 정리되지 않았습니다. 잠시 후(10~30초) 다시 시도해주세요.\n\n계속 문제가 발생하면 다른 ID를 사용해주세요.');
      } else {
        alert('서버 시작에 실패했습니다. 다시 시도해주세요.');
      }
    }
  }


  copyTeacherId() {
    const id = this.elements.teacherIdDisplay.value;
    navigator.clipboard.writeText(id).then(() => {
      const btn = this.elements.copyIdBtn;
      btn.innerHTML = '<span class="material-symbols-rounded text-lg">check</span>';
      setTimeout(() => {
        btn.innerHTML = '<span class="material-symbols-rounded text-lg">content_copy</span>';
      }, 2000);
    });
  }

  handleStudentData(peerId, data) {
    if (data.type === 'status') {
      this.updateStudentStatus(peerId, data);
    } else if (data.type === 'register') {
      this.registerStudent(peerId, data);
    } else if (data.type === 'student_message') {
      this.handleStudentMessage(peerId, data);
    }
  }

  /**
   * 학생 메시지 처리
   */
  handleStudentMessage(peerId, data) {
    const studentName = data.name || '학생';
    const message = data.message;
    
    // 알림 추가
    this.addAlert(`💬 ${studentName}: "${message}"`, 'info');
    this.playAlertSound();
  }

  registerStudent(peerId, data) {
    const studentName = data.name || '이름없음';
    const studentGrade = data.grade || '';
    
    // 같은 이름의 기존 학생이 있는지 확인
    let existingPeerId = null;
    let isDuplicateActive = false;
    
    this.students.forEach((student, oldPeerId) => {
      if (student.name === studentName && oldPeerId !== peerId) {
        // 기존 연결이 끊어졌거나 응답없는 상태면 제거 대상
        if (student.status === STATUS.DISCONNECTED || student.status === STATUS.NO_RESPONSE) {
          existingPeerId = oldPeerId;
        } else {
          // 활성 상태의 같은 이름이 있으면 중복
          isDuplicateActive = true;
        }
      }
    });
    
    // 활성 상태의 중복 이름이 있으면 등록 거부
    if (isDuplicateActive) {
      console.log(`[TeacherApp] 중복 이름 거부: ${studentName}`);
      this.peerManager.send(peerId, {
        type: 'name_duplicate',
        message: `"${studentName}" 이름이 이미 사용 중입니다. 다른 이름으로 변경 후 다시 참여해주세요.`
      });
      return;
    }
    
    // 기존 중복 학생 제거 (연결끊김/응답없음 상태)
    if (existingPeerId) {
      this.students.delete(existingPeerId);
      console.log(`[TeacherApp] 기존 연결끊김 학생 제거: ${existingPeerId}`);
    }
    
    if (!this.students.has(peerId)) {
      this.students.set(peerId, {
        peerId: peerId,
        name: studentName,
        grade: studentGrade,
        status: STATUS.UNKNOWN,
        lastUpdate: Date.now(),
        awayStartTime: null,
        totalAwayTime: 0,
        focus: null,
        focusHistory: []
      });
      this.addAlert(`${studentName} 학생이 접속했습니다.`, 'info');
      
      // 출석 체크
      this.attendanceManager.checkIn(studentName);
      this.updateTodayAttendance();
    }
    this.renderStudentGrid();
    this.updateStats();
  }

  updateStudentStatus(peerId, data) {
    let student = this.students.get(peerId);
    
    if (!student) {
      // 등록 안된 학생이면 등록
      student = {
        peerId: peerId,
        name: data.name || '이름없음',
        grade: data.grade || '',
        status: STATUS.UNKNOWN,
        lastUpdate: Date.now(),
        awayStartTime: null,
        totalAwayTime: 0,
        focus: null,
        focusHistory: []
      };
      this.students.set(peerId, student);
    }

    const prevStatus = student.status;
    student.status = data.status;
    student.lastUpdate = Date.now();
    
    // 학년 정보 업데이트 (있으면)
    if (data.grade) {
      student.grade = data.grade;
    }
    
    // 집중도 데이터 업데이트
    if (data.focus) {
      student.focus = data.focus;
      // 히스토리 누적 (최대 300개 = 5분)
      if (data.focus.score !== undefined) {
        student.focusHistory.push({
          score: data.focus.score,
          timestamp: Date.now()
        });
        if (student.focusHistory.length > 300) {
          student.focusHistory.shift();
        }
        
        // 집중도 보고서 매니저에 기록 (수업 시간에만)
        if (this.isLessonTime()) {
          this.focusReportManager.recordFocusData(student.name, data.focus, data.status);
        }
      }
      
      // 집중도 낮음 알림 (수업 시간에만)
      if (this.isLessonTime()) {
        if (data.focus.level === FOCUS_LEVEL.VERY_LOW && student.lastFocusAlert !== 'very_low') {
          this.addAlert(`⚠️ ${student.name} 학생의 집중도가 매우 낮습니다! (${data.focus.score}%)`, 'warning');
          student.lastFocusAlert = 'very_low';
        } else if (data.focus.level !== FOCUS_LEVEL.VERY_LOW) {
          student.lastFocusAlert = null;
        }
      }
    }

    // 자리비움 시간 추적 (수업 시간에만)
    if (this.isLessonTime()) {
      if (data.status === STATUS.AWAY && prevStatus !== STATUS.AWAY) {
        student.awayStartTime = Date.now();
      } else if (data.status !== STATUS.AWAY && prevStatus === STATUS.AWAY) {
        if (student.awayStartTime) {
          student.totalAwayTime += Date.now() - student.awayStartTime;
          student.awayStartTime = null;
        }
      }
    } else {
      // 쉬는 시간에는 자리비움 시간 초기화
      student.awayStartTime = null;
    }

    // 자리비움 알림 (수업 시간에만)
    if (this.isLessonTime() && data.status === STATUS.AWAY) {
      const awayDuration = student.awayStartTime ? 
        Math.floor((Date.now() - student.awayStartTime) / 1000) : 0;
      
      if (awayDuration === CONFIG.alerts.awayWarning) {
        this.addAlert(`⚠️ ${student.name} 학생이 1분간 자리를 비웠습니다.`, 'warning');
        this.playAlertSound();
      } else if (awayDuration === CONFIG.alerts.awayCritical) {
        this.addAlert(`🚨 ${student.name} 학생이 3분간 자리를 비웠습니다!`, 'critical');
        this.playAlertSound();
      }
    }

    // 상태가 변경됐을 때만 전체 다시 그리기
    if (prevStatus !== data.status) {
      this.renderStudentGrid();
      this.updateStats();
    } else {
      // 상태 변경 없으면 해당 카드만 부분 업데이트
      this.updateStudentCard(peerId, student);
    }
  }

  handleStudentDisconnect(peerId) {
    const student = this.students.get(peerId);
    if (student) {
      // 바로 삭제하지 않고 연결끊김 상태로 변경
      student.status = STATUS.DISCONNECTED;
      student.disconnectedAt = Date.now();
      this.addAlert(`${student.name} 학생의 연결이 끊어졌습니다.`, 'warning');
      
      // 퇴실 체크
      this.attendanceManager.checkOut(student.name);
      this.updateTodayAttendance();
      
      this.renderStudentGrid();
      this.updateStats();
    }
  }

  renderStudentGrid() {
    this.elements.studentGrid.innerHTML = '';
    
    if (this.students.size === 0) {
      this.elements.studentGrid.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500">
          <span class="material-symbols-rounded text-3xl mb-2 opacity-50">hourglass_empty</span>
          <p class="text-sm">접속한 학생이 없습니다</p>
        </div>
      `;
      return;
    }
    
    this.students.forEach((student) => {
      const card = document.createElement('div');
      
      // 상태별 스타일 - 깔끔한 흰색 배경 기반
      let statusStyle = {
        bg: 'bg-white dark:bg-gray-800',
        border: 'border-gray-200 dark:border-gray-700',
        icon: 'hourglass_empty',
        iconColor: 'text-gray-400',
        textColor: 'text-gray-500',
        accentColor: '#9CA3AF'
      };
      
      if (student.status === STATUS.STANDING) {
        statusStyle = {
          bg: 'bg-white dark:bg-gray-800',
          border: 'border-l-4 border-l-green-500 border-gray-200 dark:border-gray-700',
          icon: 'accessibility_new',
          iconColor: 'text-green-500',
          textColor: 'text-green-600 dark:text-green-400',
          accentColor: '#22C55E'
        };
      } else if (student.status === STATUS.SITTING) {
        statusStyle = {
          bg: 'bg-white dark:bg-gray-800',
          border: 'border-l-4 border-l-blue-500 border-gray-200 dark:border-gray-700',
          icon: 'weekend',
          iconColor: 'text-blue-500',
          textColor: 'text-blue-600 dark:text-blue-400',
          accentColor: '#3B82F6'
        };
      } else if (student.status === STATUS.AWAY) {
        statusStyle = {
          bg: 'bg-white dark:bg-gray-800',
          border: 'border-l-4 border-l-red-500 border-gray-200 dark:border-gray-700',
          icon: 'person_off',
          iconColor: 'text-red-500',
          textColor: 'text-red-600 dark:text-red-400',
          accentColor: '#EF4444'
        };
      } else if (student.status === STATUS.HAND_RAISED) {
        statusStyle = {
          bg: 'bg-white dark:bg-gray-800',
          border: 'border-l-4 border-l-purple-500 border-gray-200 dark:border-gray-700',
          icon: 'pan_tool',
          iconColor: 'text-purple-500',
          textColor: 'text-purple-600 dark:text-purple-400',
          accentColor: '#A855F7'
        };
      } else if (student.status === STATUS.NO_RESPONSE) {
        statusStyle = {
          bg: 'bg-white dark:bg-gray-800',
          border: 'border-l-4 border-l-amber-500 border-gray-200 dark:border-gray-700',
          icon: 'wifi_off',
          iconColor: 'text-amber-500',
          textColor: 'text-amber-600 dark:text-amber-400',
          accentColor: '#F59E0B'
        };
      } else if (student.status === STATUS.DISCONNECTED) {
        statusStyle = {
          bg: 'bg-gray-50 dark:bg-gray-800/50',
          border: 'border-l-4 border-l-gray-400 border-gray-200 dark:border-gray-700',
          icon: 'link_off',
          iconColor: 'text-gray-400',
          textColor: 'text-gray-500',
          accentColor: '#9CA3AF'
        };
      }
      
      card.className = `p-3 rounded-xl border ${statusStyle.bg} ${statusStyle.border} transition-all hover:shadow-card shadow-soft`;
      card.setAttribute('data-peer-id', student.peerId);
      
      let statusInfo = '';
      if (student.status === STATUS.AWAY && student.awayStartTime) {
        const seconds = Math.floor((Date.now() - student.awayStartTime) / 1000);
        statusInfo = `<p class="text-[10px] text-red-500 font-medium away-timer">${this.formatTime(seconds)}</p>`;
      } else if (student.status === STATUS.NO_RESPONSE && student.noResponseAt) {
        const seconds = Math.floor((Date.now() - student.noResponseAt) / 1000);
        statusInfo = `<p class="text-[10px] text-amber-500 font-medium no-response-timer">응답없음 ${this.formatTime(seconds)}</p>`;
      } else if (student.status === STATUS.DISCONNECTED && student.disconnectedAt) {
        const seconds = Math.floor((Date.now() - student.disconnectedAt) / 1000);
        statusInfo = `<p class="text-[10px] text-slate-400 font-medium">연결끊김 ${seconds}초</p>`;
      }
      
      // 집중도 표시
      let focusDisplay = '';
      if (student.focus && student.status !== STATUS.DISCONNECTED && student.status !== STATUS.NO_RESPONSE) {
        const focusColor = FOCUS_COLOR[student.focus.level] || '#9CA3AF';
        focusDisplay = `
          <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <div class="flex items-center justify-between text-[10px] mb-1">
              <span class="text-gray-400">집중도</span>
              <span class="font-bold focus-score" style="color: ${focusColor}">${student.focus.score}%</span>
            </div>
            <div class="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300 focus-bar" style="width: ${student.focus.score}%; background-color: ${focusColor}"></div>
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="flex items-start justify-between mb-2">
          <span class="material-symbols-rounded text-2xl ${statusStyle.iconColor}">${statusStyle.icon}</span>
          <div class="flex gap-0.5">
            <button class="btn-ptt p-1 rounded-md bg-white/80 dark:bg-gray-700/80 hover:bg-white dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors" title="말하기 (꾹 누르기)">
              <span class="material-symbols-rounded text-sm">mic</span>
            </button>
            <button class="btn-focus-report p-1 rounded-md bg-white/80 dark:bg-gray-700/80 hover:bg-white dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors" title="집중도 보고서">
              <span class="material-symbols-rounded text-sm">assessment</span>
            </button>
            <button class="btn-attendance p-1 rounded-md bg-white/80 dark:bg-gray-700/80 hover:bg-white dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors" title="출석 현황">
              <span class="material-symbols-rounded text-sm">calendar_month</span>
            </button>
            <button class="btn-focus-detail p-1 rounded-md bg-white/80 dark:bg-gray-700/80 hover:bg-white dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors" title="집중도 상세">
              <span class="material-symbols-rounded text-sm">analytics</span>
            </button>
            <button class="btn-send-message p-1 rounded-md bg-white/80 dark:bg-gray-700/80 hover:bg-white dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors" title="메시지 전송">
              <span class="material-symbols-rounded text-sm">chat</span>
            </button>
            <button class="btn-view-video p-1 rounded-md bg-white/80 dark:bg-gray-700/80 hover:bg-white dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors" title="영상 확인">
              <span class="material-symbols-rounded text-sm">videocam</span>
            </button>
          </div>
        </div>
        <div class="text-center">
          <p class="font-semibold text-sm text-gray-800 dark:text-gray-200 truncate">${student.name}</p>
          <p class="text-[10px] text-gray-400">${student.grade ? student.grade + '학년' : ''}</p>
          <p class="text-[10px] ${statusStyle.textColor} font-medium">${STATUS_LABEL[student.status]}</p>
          ${statusInfo}
          ${focusDisplay}
          <p class="text-[10px] text-gray-400 mt-1 last-update">${this.formatLastUpdate(student.lastUpdate)}</p>
        </div>
      `;
      
      // 영상 확인 버튼 클릭 이벤트
      const viewBtn = card.querySelector('.btn-view-video');
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openVideoModal(student.peerId, student.name);
      });
      
      // 집중도 상세 버튼 클릭 이벤트
      const focusBtn = card.querySelector('.btn-focus-detail');
      focusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFocusDetailModal(student.peerId);
      });
      
      // 메시지 버튼 클릭 이벤트
      const msgBtn = card.querySelector('.btn-send-message');
      msgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openMessageModal(student.peerId, student.name);
      });
      
      // 출석 버튼 클릭 이벤트
      const attendanceBtn = card.querySelector('.btn-attendance');
      attendanceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAttendanceModal(student.name);
      });
      
      // 집중도 보고서 버튼 클릭 이벤트
      const focusReportBtn = card.querySelector('.btn-focus-report');
      focusReportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFocusReportModal(student.name, student.grade);
      });
      
      // PTT 버튼 이벤트 (꾹 누르기)
      const pttBtn = card.querySelector('.btn-ptt');
      pttBtn.addEventListener('mousedown', async (e) => {
        e.stopPropagation();
        await this.startPTT(student.peerId, student.name, pttBtn);
      });
      pttBtn.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        this.stopPTT(student.peerId, pttBtn);
      });
      pttBtn.addEventListener('mouseleave', (e) => {
        // 버튼 밖으로 마우스가 나가면 PTT 종료
        if (this.currentPTTTarget === student.peerId) {
          this.stopPTT(student.peerId, pttBtn);
        }
      });
      // 터치 이벤트 (모바일)
      pttBtn.addEventListener('touchstart', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.startPTT(student.peerId, student.name, pttBtn);
      });
      pttBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.stopPTT(student.peerId, pttBtn);
      });
      
      this.elements.studentGrid.appendChild(card);
    });
  }

  /**
   * 개별 학생 카드 부분 업데이트 (집중도, 시간 등)
   */
  updateStudentCard(peerId, student) {
    const card = this.elements.studentGrid.querySelector(`[data-peer-id="${peerId}"]`);
    if (!card) return;
    
    // 집중도 업데이트
    if (student.focus) {
      const focusScoreEl = card.querySelector('.focus-score');
      const focusBarEl = card.querySelector('.focus-bar');
      if (focusScoreEl && focusBarEl) {
        const focusColor = FOCUS_COLOR[student.focus.level] || '#9CA3AF';
        focusScoreEl.textContent = `${student.focus.score}%`;
        focusScoreEl.style.color = focusColor;
        focusBarEl.style.width = `${student.focus.score}%`;
        focusBarEl.style.backgroundColor = focusColor;
      }
    }
    
    // 마지막 업데이트 시간
    const lastUpdateEl = card.querySelector('.last-update');
    if (lastUpdateEl) {
      lastUpdateEl.textContent = this.formatLastUpdate(student.lastUpdate);
    }
  }


  updateStats() {
    let standing = 0, sitting = 0, away = 0, noResponse = 0, handRaised = 0;
    
    this.students.forEach((student) => {
      switch (student.status) {
        case STATUS.STANDING: standing++; break;
        case STATUS.SITTING: sitting++; break;
        case STATUS.AWAY: away++; break;
        case STATUS.HAND_RAISED: handRaised++; break;
        case STATUS.NO_RESPONSE:
        case STATUS.DISCONNECTED:
          noResponse++; break;
      }
    });

    this.elements.totalStudents.textContent = this.students.size;
    this.elements.standingCount.textContent = standing;
    this.elements.sittingCount.textContent = sitting;
    this.elements.awayCount.textContent = away + noResponse;
    this.elements.handRaisedCount.textContent = handRaised;
  }

  updateAwayTimers() {
    let needsFullRender = false;
    const now = Date.now();
    
    this.students.forEach((student, peerId) => {
      // 자리비움 타이머 업데이트 (DOM만 업데이트, 전체 렌더링 X)
      if (student.status === STATUS.AWAY && student.awayStartTime) {
        const card = this.elements.studentGrid.querySelector(`[data-peer-id="${peerId}"]`);
        if (card) {
          const timerEl = card.querySelector('.away-timer');
          if (timerEl) {
            const seconds = Math.floor((now - student.awayStartTime) / 1000);
            timerEl.textContent = this.formatTime(seconds);
          }
        }
      }
      
      // 응답없음 타이머 업데이트
      if (student.status === STATUS.NO_RESPONSE && student.noResponseAt) {
        const card = this.elements.studentGrid.querySelector(`[data-peer-id="${peerId}"]`);
        if (card) {
          const timerEl = card.querySelector('.no-response-timer');
          if (timerEl) {
            const seconds = Math.floor((now - student.noResponseAt) / 1000);
            timerEl.textContent = `응답없음 ${this.formatTime(seconds)}`;
          }
        }
      }
      
      // 응답없음 체크 (연결끊김 상태가 아닌 경우만)
      if (student.status !== STATUS.DISCONNECTED && student.status !== STATUS.NO_RESPONSE) {
        const secondsSinceUpdate = (now - student.lastUpdate) / 1000;
        if (secondsSinceUpdate > NO_RESPONSE_THRESHOLD) {
          student.status = STATUS.NO_RESPONSE;
          student.noResponseAt = now;
          this.addAlert(`⚠️ ${student.name} 학생이 응답하지 않습니다.`, 'warning');
          needsFullRender = true;
        }
      }
      
      // 연결끊김 후 60초 지나면 목록에서 제거
      if (student.status === STATUS.DISCONNECTED && student.disconnectedAt) {
        const secondsSinceDisconnect = (now - student.disconnectedAt) / 1000;
        if (secondsSinceDisconnect > 60) {
          this.students.delete(peerId);
          needsFullRender = true;
        }
      }
    });

    if (needsFullRender) {
      this.renderStudentGrid();
      this.updateStats();
    }
  }

  addAlert(message, type = 'info') {
    // 빈 상태 메시지 제거
    const emptyMsg = this.elements.alertList.querySelector('.text-center');
    if (emptyMsg) emptyMsg.remove();
    
    const alertItem = document.createElement('div');
    
    let alertStyle = 'bg-gray-50 dark:bg-gray-800 border-border-light dark:border-border-dark';
    let iconStyle = 'text-gray-500';
    let icon = 'info';
    
    if (type === 'warning') {
      alertStyle = 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
      iconStyle = 'text-amber-500';
      icon = 'warning';
    } else if (type === 'critical') {
      alertStyle = 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      iconStyle = 'text-red-500';
      icon = 'error';
    }
    
    alertItem.className = `flex items-start gap-2 p-2 rounded-lg border ${alertStyle}`;
    
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    alertItem.innerHTML = `
      <span class="material-symbols-rounded ${iconStyle} text-sm flex-shrink-0 mt-0.5">${icon}</span>
      <div class="flex-1 min-w-0">
        <p class="text-xs text-gray-700 dark:text-gray-300">${message}</p>
        <p class="text-[10px] text-gray-400 mt-0.5">${time}</p>
      </div>
    `;
    
    this.elements.alertList.insertBefore(alertItem, this.elements.alertList.firstChild);
    
    // 최대 50개 알림 유지
    while (this.elements.alertList.children.length > 50) {
      this.elements.alertList.removeChild(this.elements.alertList.lastChild);
    }
  }

  playAlertSound() {
    if (this.alertSound) {
      this.alertSound.currentTime = 0;
      this.alertSound.play().catch(() => {});
    }
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs.toString().padStart(2, '0')}초`;
  }

  formatLastUpdate(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return '방금 전';
    if (seconds < 60) return `${seconds}초 전`;
    return `${Math.floor(seconds / 60)}분 전`;
  }

  /**
   * 영상 모달 열기
   */
  async openVideoModal(peerId, studentName) {
    console.log(`[TeacherApp] 영상 모달 열기 시도: ${peerId}, ${studentName}`);
    
    const student = this.students.get(peerId);
    if (!student || student.status === STATUS.DISCONNECTED) {
      alert('해당 학생과 연결되어 있지 않습니다.');
      return;
    }

    // 연결 상태 확인
    const connectedPeers = this.peerManager.getConnectedPeers();
    console.log(`[TeacherApp] 연결된 피어 목록:`, connectedPeers);
    
    if (!connectedPeers.includes(peerId)) {
      alert('해당 학생과 데이터 연결이 없습니다.');
      return;
    }

    this.elements.modalStudentName.textContent = studentName;
    this.elements.videoModal.style.display = 'flex';
    this.currentVideoStudent = peerId;

    try {
      console.log(`[TeacherApp] 영상 스트림 요청 시작: ${peerId}`);
      const stream = await this.peerManager.requestStream(peerId);
      console.log(`[TeacherApp] 영상 스트림 수신 성공`);
      this.elements.modalVideo.srcObject = stream;
      this.elements.modalVideo.play();
    } catch (error) {
      console.error('영상 연결 실패:', error);
      alert('영상 연결에 실패했습니다: ' + error.message);
      this.closeVideoModal();
    }
  }

  /**
   * 영상 모달 닫기
   */
  closeVideoModal() {
    if (this.currentVideoStudent) {
      this.peerManager.closeStream(this.currentVideoStudent);
      this.currentVideoStudent = null;
    }
    
    this.elements.modalVideo.srcObject = null;
    this.elements.videoModal.style.display = 'none';
  }

  /**
   * 집중도 상세 모달 열기
   */
  openFocusDetailModal(peerId) {
    const student = this.students.get(peerId);
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
    
    // 마지막 업데이트 시간
    if (this.elements.focusLastUpdate) {
      this.elements.focusLastUpdate.textContent = `마지막 업데이트: ${new Date().toLocaleTimeString('ko-KR')}`;
    }
    
    // 차트 범위 버튼 초기화
    this.chartRange = 60;
    this.updateChartRangeButtons();
    
    // 차트 그리기
    this.drawFocusChart(student.focusHistory);
    
    // 통계 계산
    this.updateFocusStats(student.focusHistory);
    
    this.elements.focusDetailModal.style.display = 'flex';
  }

  /**
   * 차트 범위 변경
   */
  setChartRange(range) {
    this.chartRange = range;
    this.updateChartRangeButtons();
    
    // 현재 학생의 차트 다시 그리기
    if (this.currentFocusStudent) {
      const student = this.students.get(this.currentFocusStudent);
      if (student) {
        this.drawFocusChart(student.focusHistory);
        this.updateFocusStats(student.focusHistory);
      }
    }
  }

  /**
   * 차트 범위 버튼 스타일 업데이트
   */
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

  /**
   * 집중도 통계 업데이트
   */
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
    
    if (this.elements.focusAvgScore) {
      this.elements.focusAvgScore.textContent = avg + '%';
      this.elements.focusAvgScore.style.color = avg >= 70 ? '#10B981' : avg >= 40 ? '#F59E0B' : '#EF4444';
    }
    if (this.elements.focusMinScore) {
      this.elements.focusMinScore.textContent = min + '%';
    }
    if (this.elements.focusMaxScore) {
      this.elements.focusMaxScore.textContent = max + '%';
    }
  }

  /**
   * 집중도 상세 모달 닫기
   */
  closeFocusDetailModal() {
    this.elements.focusDetailModal.style.display = 'none';
    this.currentFocusStudent = null;
    
    // 차트 정리
    if (this.focusChart) {
      this.focusChart.destroy();
      this.focusChart = null;
    }
  }

  /**
   * 집중도 차트 그리기 (Chart.js)
   */
  drawFocusChart(history) {
    const canvas = this.elements.focusChart;
    if (!canvas) return;
    
    // 기존 차트 제거
    if (this.focusChart) {
      this.focusChart.destroy();
      this.focusChart = null;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (!history || history.length < 2) {
      // 데이터 없을 때 빈 차트
      this.focusChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: '집중도',
            data: [],
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          }
        }
      });
      return;
    }
    
    // 선택된 범위만큼 데이터 가져오기
    const points = history.slice(-this.chartRange);
    
    // 라벨 생성 (시간)
    const labels = points.map((_, i) => {
      const secondsAgo = (points.length - 1 - i);
      if (secondsAgo === 0) return '현재';
      if (secondsAgo % 10 === 0) return `-${secondsAgo}초`;
      return '';
    });
    
    // 그라데이션 생성
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.05)');
    
    this.focusChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '집중도',
          data: points.map(p => p.score),
          borderColor: '#10B981',
          backgroundColor: gradient,
          borderWidth: 3,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#10B981',
          pointBorderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(31, 41, 55, 0.9)',
            titleColor: '#fff',
            bodyColor: '#fff',
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: function(context) {
                return `집중도: ${context.raw}%`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            min: 0,
            max: 100,
            grid: {
              color: 'rgba(156, 163, 175, 0.1)',
              borderDash: [5, 5]
            },
            ticks: {
              color: '#9CA3AF',
              font: { family: "'Inter', sans-serif", size: 11 },
              callback: function(value) {
                return value + '%';
              }
            },
            border: { display: false }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: '#9CA3AF',
              font: { family: "'Inter', sans-serif", size: 11 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 7
            },
            border: { display: false }
          }
        }
      }
    });
  }

  /**
   * 메시지 모달 열기
   * @param {string|null} peerId - 특정 학생 ID (null이면 전체 공지)
   * @param {string} studentName - 학생 이름
   */
  openMessageModal(peerId, studentName = null) {
    console.log('[TeacherApp] openMessageModal 호출', peerId, studentName);
    console.log('[TeacherApp] messageModal 요소:', this.elements.messageModal);
    
    this.currentMessageTarget = peerId;
    this.elements.messageInput.value = '';
    
    if (peerId) {
      this.elements.messageModalTitle.textContent = '메시지 전송';
      this.elements.messageTargetInfo.innerHTML = `<span class="text-indigo-500 font-bold">${studentName}</span> 학생에게 메시지를 보냅니다.`;
    } else {
      this.elements.messageModalTitle.textContent = '전체 공지';
      this.elements.messageTargetInfo.innerHTML = `접속 중인 모든 학생(<span class="text-indigo-500 font-bold">${this.students.size}명</span>)에게 메시지를 보냅니다.`;
    }
    
    this.elements.messageModal.style.display = 'flex';
    this.elements.messageInput.focus();
  }

  /**
   * 메시지 모달 닫기
   */
  closeMessageModal() {
    this.currentMessageTarget = null;
    this.elements.messageModal.style.display = 'none';
    this.elements.messageInput.value = '';
  }

  /**
   * 메시지 전송
   */
  sendMessage() {
    const message = this.elements.messageInput.value.trim();
    if (!message) {
      alert('메시지를 입력해주세요.');
      return;
    }

    const messageData = {
      type: 'teacher_message',
      message: message,
      timestamp: Date.now(),
      isBroadcast: !this.currentMessageTarget
    };

    if (this.currentMessageTarget) {
      // 특정 학생에게 전송
      this.peerManager.send(this.currentMessageTarget, messageData);
      const student = this.students.get(this.currentMessageTarget);
      this.addAlert(`📤 ${student?.name || '학생'}에게 메시지 전송: "${message}"`, 'info');
    } else {
      // 전체 공지
      this.students.forEach((student, peerId) => {
        if (student.status !== STATUS.DISCONNECTED) {
          this.peerManager.send(peerId, messageData);
        }
      });
      this.addAlert(`📢 전체 공지 전송: "${message}"`, 'info');
    }

    this.closeMessageModal();
  }

  /**
   * 오늘 출석 현황 업데이트
   */
  updateTodayAttendance() {
    const stats = this.attendanceManager.getTodayStats();
    if (this.elements.todayAttendanceCount) {
      this.elements.todayAttendanceCount.textContent = stats.totalStudents;
    }
  }

  /**
   * 오늘 출석자 명단 모달 열기
   */
  openTodayAttendanceModal() {
    const stats = this.attendanceManager.getTodayStats();
    
    // 날짜 표시
    if (this.elements.todayAttendanceDate) {
      const today = new Date();
      const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
      this.elements.todayAttendanceDate.textContent = dateStr;
    }
    
    // 총 인원 표시
    if (this.elements.todayAttendanceTotal) {
      this.elements.todayAttendanceTotal.textContent = `${stats.totalStudents}명`;
    }
    
    // 출석자 목록 렌더링
    this.renderTodayAttendanceList(stats.records);
    
    // 모달 표시
    if (this.elements.todayAttendanceModal) {
      this.elements.todayAttendanceModal.style.display = 'flex';
    }
  }

  /**
   * 오늘 출석자 명단 모달 닫기
   */
  closeTodayAttendanceModal() {
    if (this.elements.todayAttendanceModal) {
      this.elements.todayAttendanceModal.style.display = 'none';
    }
  }

  /**
   * 오늘 출석자 목록 렌더링
   */
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
    
    // 출석 시간순 정렬
    const sortedRecords = [...records].sort((a, b) => a.checkInTime - b.checkInTime);
    
    let html = '<div class="space-y-2">';
    
    sortedRecords.forEach((record, index) => {
      const checkInTime = new Date(record.checkInTime).toLocaleTimeString('ko-KR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      // 현재 접속 중인지 확인
      const isOnline = this.students.has(record.studentName) || 
        Array.from(this.students.values()).some(s => s.name === record.studentName && s.status !== 'disconnected');
      
      // 총 접속 시간 계산
      let totalTime = record.totalTime || 0;
      if (!record.checkOutTime && record.checkInTime) {
        totalTime += Date.now() - record.checkInTime;
      }
      const duration = this.attendanceManager.formatDuration(totalTime);
      
      html += `
        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center text-teal-600 dark:text-teal-400 font-bold text-sm">
              ${index + 1}
            </div>
            <div>
              <p class="font-medium text-gray-800 dark:text-gray-200">${record.studentName}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                <span class="material-symbols-rounded text-[10px] align-middle">login</span>
                ${checkInTime} 출석
              </p>
            </div>
          </div>
          <div class="text-right">
            <div class="flex items-center gap-1.5">
              ${isOnline ? `
                <span class="relative flex h-2 w-2">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                <span class="text-xs font-medium text-green-600 dark:text-green-400">접속중</span>
              ` : `
                <span class="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                <span class="text-xs font-medium text-gray-500 dark:text-gray-400">오프라인</span>
              `}
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">${duration}</p>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    this.elements.todayAttendanceList.innerHTML = html;
  }

  /**
   * 출석 모달 열기
   */
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

  /**
   * 출석 모달 닫기
   */
  closeAttendanceModal() {
    this.currentAttendanceStudent = null;
    if (this.elements.attendanceModal) {
      this.elements.attendanceModal.style.display = 'none';
    }
  }

  /**
   * 출석 월 변경
   */
  async setAttendanceMonth(offset) {
    this.attendanceMonthOffset = (this.attendanceMonthOffset || 0) + offset;
    await this.updateAttendanceStats();
  }

  /**
   * 출석 통계 업데이트
   */
  async updateAttendanceStats() {
    if (!this.currentAttendanceStudent) return;
    
    const summary = await this.attendanceManager.getStudentSummary(this.currentAttendanceStudent);
    
    // 주간 통계
    if (this.elements.attendanceWeeklyDays) {
      this.elements.attendanceWeeklyDays.textContent = `${summary.weekly.presentDays}/${summary.weekly.totalDays}일`;
    }
    if (this.elements.attendanceWeeklyRate) {
      this.elements.attendanceWeeklyRate.textContent = `${summary.weekly.rate}%`;
      this.elements.attendanceWeeklyRate.style.color = summary.weekly.rate >= 80 ? '#10B981' : summary.weekly.rate >= 50 ? '#F59E0B' : '#EF4444';
    }
    if (this.elements.attendanceWeeklyTime) {
      this.elements.attendanceWeeklyTime.textContent = this.attendanceManager.formatDuration(summary.weekly.totalTime);
    }
    
    // 월간 통계
    if (this.elements.attendanceMonthlyDays) {
      this.elements.attendanceMonthlyDays.textContent = `${summary.monthly.presentDays}/${summary.monthly.totalDays}일`;
    }
    if (this.elements.attendanceMonthlyRate) {
      this.elements.attendanceMonthlyRate.textContent = `${summary.monthly.rate}%`;
      this.elements.attendanceMonthlyRate.style.color = summary.monthly.rate >= 80 ? '#10B981' : summary.monthly.rate >= 50 ? '#F59E0B' : '#EF4444';
    }
    if (this.elements.attendanceMonthlyTime) {
      this.elements.attendanceMonthlyTime.textContent = this.attendanceManager.formatDuration(summary.monthly.totalTime);
    }
    
    // 캘린더 렌더링
    await this.renderAttendanceCalendar();
  }

  /**
   * 출석 캘린더 렌더링
   */
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
    
    // 출석 날짜 Set 생성
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
    
    // 요일 헤더
    dayNames.forEach((day, i) => {
      const color = i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400';
      html += `<div class="${color} font-medium py-1">${day}</div>`;
    });
    
    // 빈 칸 (첫째 주)
    for (let i = 0; i < firstDay; i++) {
      html += '<div></div>';
    }
    
    // 날짜
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

  /**
   * 출석 CSV 다운로드
   */
  async downloadAttendanceCSV() {
    if (!this.currentAttendanceStudent) return;
    
    const now = new Date();
    const offset = this.attendanceMonthOffset || 0;
    const targetDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    
    const startDate = this.attendanceManager.getDateString(targetDate);
    const endDate = this.attendanceManager.getDateString(new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0));
    
    // 해당 학생만 필터링된 CSV 생성
    let csv = '\uFEFF날짜,학생이름,출석시간,퇴실시간,총접속시간,상태\n'; // BOM for Excel
    
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
    
    // 다운로드
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `출석_${this.currentAttendanceStudent}_${targetDate.getFullYear()}년${targetDate.getMonth() + 1}월.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 출석 PDF 다운로드
   */
  async downloadAttendancePDF() {
    if (!this.currentAttendanceStudent) return;
    
    const now = new Date();
    const offset = this.attendanceMonthOffset || 0;
    const targetDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;
    
    // 데이터 수집
    const summary = await this.attendanceManager.getStudentSummary(this.currentAttendanceStudent);
    const monthlyStats = await this.attendanceManager.getMonthlyStats(
      this.currentAttendanceStudent,
      targetDate.getFullYear(),
      targetDate.getMonth()
    );
    
    // 일별 출석 데이터 수집
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
    
    // PDF용 HTML 생성
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
    
    // 새 창에서 PDF 인쇄
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  }

  /**
   * 집중도 보고서 모달 열기
   */
  async openFocusReportModal(studentName, studentGrade) {
    console.log('[TeacherApp] openFocusReportModal:', studentName, studentGrade);
    this.currentFocusReportStudent = studentName;
    this.currentFocusReportGrade = studentGrade;
    this.focusReportType = 'daily';
    
    if (this.elements.focusReportStudentName) {
      this.elements.focusReportStudentName.textContent = studentName;
    }
    if (this.elements.focusReportStudentGrade) {
      this.elements.focusReportStudentGrade.textContent = studentGrade ? `${studentGrade}학년` : '';
      console.log('[TeacherApp] 학년 설정:', studentGrade ? `${studentGrade}학년` : '(없음)');
    }
    
    await this.updateFocusReport();
    
    if (this.elements.focusReportModal) {
      this.elements.focusReportModal.style.display = 'flex';
    }
  }

  /**
   * 집중도 보고서 모달 닫기
   */
  closeFocusReportModal() {
    this.currentFocusReportStudent = null;
    if (this.elements.focusReportModal) {
      this.elements.focusReportModal.style.display = 'none';
    }
  }

  /**
   * 보고서 타입 변경
   */
  async setFocusReportType(type) {
    this.focusReportType = type;
    
    // 버튼 스타일 업데이트
    document.querySelectorAll('.focus-report-type-btn').forEach(btn => {
      if (btn.dataset.type === type) {
        btn.className = 'focus-report-type-btn px-3 py-1.5 text-xs rounded-lg bg-orange-500 text-white font-medium transition-all';
      } else {
        btn.className = 'focus-report-type-btn px-3 py-1.5 text-xs rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium transition-all hover:bg-gray-300 dark:hover:bg-gray-600';
      }
    });
    
    await this.updateFocusReport();
  }

  /**
   * 집중도 보고서 업데이트
   */
  async updateFocusReport() {
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
      // 월간일 때만 지난달 대비 변화량 가져오기
      comparison = await this.focusReportManager.getMonthlyComparison(this.currentFocusReportStudent);
    }
    
    // 출석 데이터 가져오기
    const attendanceSummary = await this.attendanceManager.getStudentSummary(this.currentFocusReportStudent);
    
    const grade = this.focusReportManager.getFocusGrade(report.focusRate || 0);
    
    // 변화량 표시 헬퍼 함수
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
      
      <!-- 핵심 지표 -->
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
      
      <!-- 상세 지표 -->
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

  /**
   * 집중도 보고서 CSV 다운로드
   */
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
    
    // 출석 데이터 가져오기
    const attendanceSummary = await this.attendanceManager.getStudentSummary(this.currentFocusReportStudent);
    const attendanceData = this.focusReportType === 'weekly' ? attendanceSummary.weekly : attendanceSummary.monthly;
    
    let csv = '\uFEFF이름,학년,기간,집중률,평균점수,순집중시간(초),최대연속집중(초),최대착석시간(초),총학습시간(초),자리비움횟수,출석일수,출석률';
    
    // 월간일 때 변화량 컬럼 추가
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
    
    // 월간일 때 변화량 데이터 추가
    if (this.focusReportType === 'monthly' && comparison) {
      csv += `,${comparison.changes.focusedTime},${comparison.changes.focusedTimePercent}%,${comparison.changes.maxSeatedDuration},${comparison.changes.maxSeatedDurationPercent}%`;
    }
    csv += '\n';
    
    // 일별 상세 (주간/월간인 경우)
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

  /**
   * 집중도 보고서 PDF 다운로드
   */
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
    
    // 출석 데이터 가져오기
    const attendanceSummary = await this.attendanceManager.getStudentSummary(this.currentFocusReportStudent);
    
    const grade = this.focusReportManager.getFocusGrade(report.focusRate || 0);
    const studentGrade = this.currentFocusReportGrade ? `${this.currentFocusReportGrade}학년` : '';
    
    // 변화량 표시 헬퍼
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
    printWindow.onload = () => {
      printWindow.print();
    };
  }

  /**
   * PTT 시작 (마이크 버튼 누름)
   */
  async startPTT(peerId, studentName, btnElement) {
    const student = this.students.get(peerId);
    if (!student || student.status === STATUS.DISCONNECTED) {
      return;
    }

    this.currentPTTTarget = peerId;
    
    // 버튼 스타일 변경
    btnElement.classList.remove('bg-white/80', 'dark:bg-gray-700/80', 'text-gray-500', 'dark:text-gray-400');
    btnElement.classList.add('bg-red-500', 'text-white', 'animate-pulse');
    btnElement.querySelector('.material-symbols-rounded').textContent = 'mic';
    
    // PTT 시작
    const success = await this.peerManager.startPTT(peerId);
    
    if (success) {
      this.addAlert(`🎤 ${studentName} 학생에게 말하는 중...`, 'info');
    } else {
      this.addAlert(`❌ 마이크 연결 실패`, 'warning');
      this.stopPTT(peerId, btnElement);
    }
  }

  /**
   * PTT 종료 (마이크 버튼 뗌)
   */
  stopPTT(peerId, btnElement) {
    if (this.currentPTTTarget !== peerId) return;
    
    this.currentPTTTarget = null;
    
    // 버튼 스타일 복원
    btnElement.classList.remove('bg-red-500', 'text-white', 'animate-pulse');
    btnElement.classList.add('bg-white/80', 'dark:bg-gray-700/80', 'text-gray-500', 'dark:text-gray-400');
    btnElement.querySelector('.material-symbols-rounded').textContent = 'mic';
    
    // PTT 종료
    this.peerManager.stopPTT(peerId);
  }

  // ==================== 수업 시간 관리 ====================

  /**
   * 저장된 수업 시간 설정 불러오기
   */
  loadClassTimeSettings() {
    const saved = localStorage.getItem('classTimeSettings');
    if (saved) {
      try {
        const settings = JSON.parse(saved);
        this.lessonDuration = settings.lessonDuration || CONFIG.classTime.lessonDuration;
        this.breakDuration = settings.breakDuration || CONFIG.classTime.breakDuration;
      } catch (e) {
        console.error('[TeacherApp] 수업 시간 설정 로드 실패:', e);
      }
    }
  }

  /**
   * 수업 시간 설정 저장
   */
  saveClassTimeSettings() {
    localStorage.setItem('classTimeSettings', JSON.stringify({
      lessonDuration: this.lessonDuration,
      breakDuration: this.breakDuration
    }));
  }

  /**
   * 수업 타이머 시작
   */
  startClassTimer() {
    if (this.classTimerInterval) {
      clearInterval(this.classTimerInterval);
    }
    
    // 수업 모드로 시작
    this.classMode = CLASS_MODE.LESSON;
    this.lessonCount = 1;
    this.remainingSeconds = this.lessonDuration * 60;
    this.notifiedBeforeEnd = false;
    
    this.updateClassTimerUI();
    this.notifyClassModeChange();
    
    this.classTimerInterval = setInterval(() => {
      this.tickClassTimer();
    }, 1000);
    
    this.addAlert(`📚 ${this.lessonCount}교시 수업이 시작되었습니다. (${this.lessonDuration}분)`, 'info');
  }

  /**
   * 수업 타이머 정지
   */
  stopClassTimer() {
    if (this.classTimerInterval) {
      clearInterval(this.classTimerInterval);
      this.classTimerInterval = null;
    }
    
    this.classMode = CLASS_MODE.STOPPED;
    this.remainingSeconds = 0;
    this.updateClassTimerUI();
    this.notifyClassModeChange();
    
    this.addAlert('⏹️ 수업 타이머가 정지되었습니다.', 'info');
  }

  /**
   * 수업 타이머 토글 (시작/정지)
   */
  toggleClassTimer() {
    if (this.classMode === CLASS_MODE.STOPPED) {
      this.startClassTimer();
    } else {
      this.stopClassTimer();
    }
  }

  /**
   * 타이머 틱 (1초마다 호출)
   */
  tickClassTimer() {
    this.remainingSeconds--;
    
    // 종료 1분 전 알림
    if (!this.notifiedBeforeEnd && this.remainingSeconds === 60) {
      this.notifiedBeforeEnd = true;
      if (this.classMode === CLASS_MODE.LESSON) {
        this.addAlert('⏰ 1분 후 쉬는 시간입니다.', 'info');
        this.playAlertSound();
      } else {
        this.addAlert('⏰ 1분 후 수업이 시작됩니다.', 'info');
        this.playAlertSound();
      }
      // 학생들에게도 알림
      this.broadcastClassNotification(this.classMode === CLASS_MODE.LESSON ? 
        '⏰ 1분 후 쉬는 시간입니다.' : '⏰ 1분 후 수업이 시작됩니다.');
    }
    
    // 시간 종료
    if (this.remainingSeconds <= 0) {
      this.switchClassMode();
    }
    
    this.updateClassTimerUI();
    
    // 학생들에게 시간 업데이트 (5초마다 전송하여 네트워크 부하 감소)
    if (this.remainingSeconds % 5 === 0 || this.remainingSeconds <= 10) {
      this.notifyClassModeChange();
    }
  }

  /**
   * 수업/쉬는시간 전환
   */
  switchClassMode() {
    this.notifiedBeforeEnd = false;
    
    if (this.classMode === CLASS_MODE.LESSON) {
      // 수업 → 쉬는시간
      this.classMode = CLASS_MODE.BREAK;
      this.remainingSeconds = this.breakDuration * 60;
      this.addAlert(`☕ 쉬는 시간입니다! (${this.breakDuration}분)`, 'info');
      this.playAlertSound();
    } else {
      // 쉬는시간 → 수업
      this.classMode = CLASS_MODE.LESSON;
      this.lessonCount++;
      this.remainingSeconds = this.lessonDuration * 60;
      this.addAlert(`📚 ${this.lessonCount}교시 수업이 시작되었습니다. (${this.lessonDuration}분)`, 'info');
      this.playAlertSound();
    }
    
    this.notifyClassModeChange();
  }

  /**
   * 강제로 쉬는시간 전환
   */
  forceBreak() {
    if (this.classMode === CLASS_MODE.STOPPED) {
      this.startClassTimer();
    }
    
    this.classMode = CLASS_MODE.BREAK;
    this.remainingSeconds = this.breakDuration * 60;
    this.notifiedBeforeEnd = false;
    this.updateClassTimerUI();
    this.notifyClassModeChange();
    this.addAlert(`☕ 쉬는 시간으로 전환되었습니다. (${this.breakDuration}분)`, 'info');
  }

  /**
   * 강제로 수업 전환
   */
  forceLesson() {
    if (this.classMode === CLASS_MODE.STOPPED) {
      this.startClassTimer();
      return;
    }
    
    this.classMode = CLASS_MODE.LESSON;
    this.remainingSeconds = this.lessonDuration * 60;
    this.notifiedBeforeEnd = false;
    this.updateClassTimerUI();
    this.notifyClassModeChange();
    this.addAlert(`📚 수업으로 전환되었습니다. (${this.lessonDuration}분)`, 'info');
  }

  /**
   * 수업 모드 변경 알림 (학생들에게 전송)
   */
  notifyClassModeChange() {
    const message = {
      type: 'class_mode_change',
      mode: this.classMode,
      remainingSeconds: this.remainingSeconds,
      lessonCount: this.lessonCount
    };
    
    this.peerManager.send(null, message); // 브로드캐스트
  }

  /**
   * 수업 알림 브로드캐스트
   */
  broadcastClassNotification(message) {
    this.peerManager.send(null, {
      type: 'teacher_message',
      message: message,
      timestamp: Date.now(),
      isBroadcast: true,
      isSystemMessage: true
    });
  }

  /**
   * 수업 타이머 UI 업데이트
   */
  updateClassTimerUI() {
    const timerBar = this.elements.classTimerBar;
    const statusEl = this.elements.classTimerStatus;
    const timeEl = this.elements.classTimerTime;
    const progressEl = this.elements.classTimerProgress;
    const toggleBtn = this.elements.classTimerToggle;
    const idleMsg = document.getElementById('class-timer-idle');
    
    if (!timerBar) return;
    
    // 시간 포맷
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
      
      // 프로그레스 바
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
      
      // 프로그레스 바
      const totalSeconds = this.breakDuration * 60;
      const progress = ((totalSeconds - this.remainingSeconds) / totalSeconds) * 100;
      progressEl.style.width = `${progress}%`;
      progressEl.className = 'h-full bg-amber-500 rounded-full transition-all duration-1000';
      
      toggleBtn.innerHTML = '<span class="material-symbols-rounded text-sm">stop</span> 정지';
      toggleBtn.className = 'px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1';
    }
  }

  /**
   * 수업 설정 모달 열기
   */
  openClassSettingsModal() {
    const modal = this.elements.classSettingsModal;
    if (!modal) return;
    
    // 현재 설정값 표시
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
   * 수업 설정 모달 닫기
   */
  closeClassSettingsModal() {
    const modal = this.elements.classSettingsModal;
    if (!modal) return;
    
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  /**
   * 수업 설정 저장
   */
  saveClassSettings() {
    const lessonInput = this.elements.lessonDurationInput;
    const breakInput = this.elements.breakDurationInput;
    
    if (lessonInput && breakInput) {
      const lesson = parseInt(lessonInput.value) || 50;
      const breakTime = parseInt(breakInput.value) || 10;
      
      // 유효성 검사
      if (lesson < 1 || lesson > 180) {
        alert('수업 시간은 1~180분 사이로 설정해주세요.');
        return;
      }
      if (breakTime < 1 || breakTime > 60) {
        alert('쉬는 시간은 1~60분 사이로 설정해주세요.');
        return;
      }
      
      this.lessonDuration = lesson;
      this.breakDuration = breakTime;
      this.saveClassTimeSettings();
      
      this.addAlert(`⚙️ 수업 시간 설정: 수업 ${lesson}분, 쉬는시간 ${breakTime}분`, 'info');
    }
    
    this.closeClassSettingsModal();
  }

  /**
   * 현재 수업 모드인지 확인 (데이터 수집 여부 판단용)
   */
  isLessonTime() {
    return this.classMode === CLASS_MODE.LESSON;
  }

  /**
   * 현재 쉬는 시간인지 확인
   */
  isBreakTime() {
    return this.classMode === CLASS_MODE.BREAK;
  }
}

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
  const app = new TeacherApp();
  app.init();
});

export { TeacherApp };
