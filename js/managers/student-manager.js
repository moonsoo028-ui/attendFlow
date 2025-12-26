/**
 * 학생 관리 모듈
 * - 학생 데이터 관리 (Map)
 * - 학생 카드 렌더링
 * - 상태 업데이트
 */
import { STATUS, STATUS_LABEL, FOCUS_COLOR, FOCUS_LEVEL, NO_RESPONSE_THRESHOLD } from '../config.js';

export class StudentManager {
  constructor(options = {}) {
    this.students = new Map(); // peerId -> studentData
    this.elements = options.elements || {};
    this.onAlert = options.onAlert || (() => {});
    this.onPlaySound = options.onPlaySound || (() => {});
    this.attendanceManager = options.attendanceManager;
    this.focusReportManager = options.focusReportManager;
    this.isLessonTime = options.isLessonTime || (() => true);
    
    // 콜백
    this.onOpenVideoModal = options.onOpenVideoModal || (() => {});
    this.onOpenFocusDetailModal = options.onOpenFocusDetailModal || (() => {});
    this.onOpenMessageModal = options.onOpenMessageModal || (() => {});
    this.onOpenAttendanceModal = options.onOpenAttendanceModal || (() => {});
    this.onOpenFocusReportModal = options.onOpenFocusReportModal || (() => {});
    this.onStartPTT = options.onStartPTT || (() => {});
    this.onStopPTT = options.onStopPTT || (() => {});
  }

  /**
   * 학생 등록
   */
  registerStudent(peerId, data, peerManager) {
    const studentName = data.name || '이름없음';
    const studentGrade = data.grade || '';
    
    // 같은 이름의 기존 학생이 있는지 확인
    let existingPeerId = null;
    let isDuplicateActive = false;
    
    this.students.forEach((student, oldPeerId) => {
      if (student.name === studentName && oldPeerId !== peerId) {
        if (student.status === STATUS.DISCONNECTED || student.status === STATUS.NO_RESPONSE) {
          existingPeerId = oldPeerId;
        } else {
          isDuplicateActive = true;
        }
      }
    });
    
    // 활성 상태의 중복 이름이 있으면 등록 거부
    if (isDuplicateActive) {
      console.log(`[StudentManager] 중복 이름 거부: ${studentName}`);
      peerManager.send(peerId, {
        type: 'name_duplicate',
        message: `"${studentName}" 이름이 이미 사용 중입니다. 다른 이름으로 변경 후 다시 참여해주세요.`
      });
      return false;
    }
    
    // 기존 중복 학생 제거
    if (existingPeerId) {
      this.students.delete(existingPeerId);
      console.log(`[StudentManager] 기존 연결끊김 학생 제거: ${existingPeerId}`);
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
      this.onAlert(`${studentName} 학생이 접속했습니다.`, 'info');
      
      // 출석 체크
      if (this.attendanceManager) {
        this.attendanceManager.checkIn(studentName);
      }
      return true;
    }
    return false;
  }

  /**
   * 학생 상태 업데이트
   */
  updateStudentStatus(peerId, data) {
    let student = this.students.get(peerId);
    
    if (!student) {
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
    
    if (data.grade) {
      student.grade = data.grade;
    }
    
    // 집중도 데이터 업데이트
    if (data.focus) {
      student.focus = data.focus;
      if (data.focus.score !== undefined) {
        student.focusHistory.push({
          score: data.focus.score,
          timestamp: Date.now()
        });
        if (student.focusHistory.length > 300) {
          student.focusHistory.shift();
        }
        
        // 집중도 보고서 매니저에 기록
        if (this.isLessonTime() && this.focusReportManager) {
          this.focusReportManager.recordFocusData(student.name, data.focus, data.status);
        }
      }
      
      // 집중도 낮음 알림
      if (this.isLessonTime()) {
        if (data.focus.level === FOCUS_LEVEL.VERY_LOW && student.lastFocusAlert !== 'very_low') {
          this.onAlert(`⚠️ ${student.name} 학생의 집중도가 매우 낮습니다! (${data.focus.score}%)`, 'warning');
          student.lastFocusAlert = 'very_low';
        } else if (data.focus.level !== FOCUS_LEVEL.VERY_LOW) {
          student.lastFocusAlert = null;
        }
      }
    }

    // 자리비움 시간 추적
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
      student.awayStartTime = null;
    }

    // 자리비움 알림
    if (this.isLessonTime() && data.status === STATUS.AWAY) {
      const awayDuration = student.awayStartTime ? 
        Math.floor((Date.now() - student.awayStartTime) / 1000) : 0;
      
      if (awayDuration === 60) {
        this.onAlert(`⚠️ ${student.name} 학생이 1분간 자리를 비웠습니다.`, 'warning');
        this.onPlaySound();
      } else if (awayDuration === 180) {
        this.onAlert(`🚨 ${student.name} 학생이 3분간 자리를 비웠습니다!`, 'critical');
        this.onPlaySound();
      }
    }

    return prevStatus !== data.status;
  }

  /**
   * 학생 연결 해제 처리
   */
  handleStudentDisconnect(peerId) {
    const student = this.students.get(peerId);
    if (student) {
      student.status = STATUS.DISCONNECTED;
      student.disconnectedAt = Date.now();
      this.onAlert(`${student.name} 학생의 연결이 끊어졌습니다.`, 'warning');
      
      if (this.attendanceManager) {
        this.attendanceManager.checkOut(student.name);
      }
      return true;
    }
    return false;
  }

  /**
   * 학생 가져오기
   */
  getStudent(peerId) {
    return this.students.get(peerId);
  }

  /**
   * 모든 학생 가져오기
   */
  getAllStudents() {
    return this.students;
  }

  /**
   * 학생 수
   */
  get size() {
    return this.students.size;
  }

  /**
   * 통계 계산
   */
  getStats() {
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

    return {
      total: this.students.size,
      standing,
      sitting,
      away: away + noResponse,
      handRaised
    };
  }

  /**
   * 타이머 업데이트 (1초마다 호출)
   */
  updateTimers() {
    let needsFullRender = false;
    const now = Date.now();
    
    this.students.forEach((student, peerId) => {
      // 자리비움 타이머 업데이트
      if (student.status === STATUS.AWAY && student.awayStartTime) {
        const card = this.elements.studentGrid?.querySelector(`[data-peer-id="${peerId}"]`);
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
        const card = this.elements.studentGrid?.querySelector(`[data-peer-id="${peerId}"]`);
        if (card) {
          const timerEl = card.querySelector('.no-response-timer');
          if (timerEl) {
            const seconds = Math.floor((now - student.noResponseAt) / 1000);
            timerEl.textContent = `응답없음 ${this.formatTime(seconds)}`;
          }
        }
      }
      
      // 응답없음 체크
      if (student.status !== STATUS.DISCONNECTED && student.status !== STATUS.NO_RESPONSE) {
        const secondsSinceUpdate = (now - student.lastUpdate) / 1000;
        if (secondsSinceUpdate > NO_RESPONSE_THRESHOLD) {
          student.status = STATUS.NO_RESPONSE;
          student.noResponseAt = now;
          this.onAlert(`⚠️ ${student.name} 학생이 응답하지 않습니다.`, 'warning');
          needsFullRender = true;
        }
      }
      
      // 연결끊김 후 60초 지나면 제거
      if (student.status === STATUS.DISCONNECTED && student.disconnectedAt) {
        const secondsSinceDisconnect = (now - student.disconnectedAt) / 1000;
        if (secondsSinceDisconnect > 60) {
          this.students.delete(peerId);
          needsFullRender = true;
        }
      }
    });

    return needsFullRender;
  }

  /**
   * 개별 카드 부분 업데이트
   */
  updateStudentCard(peerId, student) {
    const card = this.elements.studentGrid?.querySelector(`[data-peer-id="${peerId}"]`);
    if (!card) return;
    
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
    
    const lastUpdateEl = card.querySelector('.last-update');
    if (lastUpdateEl) {
      lastUpdateEl.textContent = this.formatLastUpdate(student.lastUpdate);
    }
  }

  /**
   * 시간 포맷
   */
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
}
