/**
 * UI 렌더링 모듈
 * - 학생 카드 렌더링
 * - 통계 업데이트
 */
import { STATUS, STATUS_LABEL, FOCUS_COLOR } from '../config.js';

export class UIRenderer {
  constructor(options = {}) {
    this.elements = options.elements || {};
    this.studentManager = options.studentManager || null;
    
    // 콜백
    this.onOpenVideoModal = options.onOpenVideoModal || (() => {});
    this.onOpenFocusDetailModal = options.onOpenFocusDetailModal || (() => {});
    this.onOpenMessageModal = options.onOpenMessageModal || (() => {});
    this.onOpenAttendanceModal = options.onOpenAttendanceModal || (() => {});
    this.onOpenFocusReportModal = options.onOpenFocusReportModal || (() => {});
    this.onStartPTT = options.onStartPTT || (() => {});
    this.onStopPTT = options.onStopPTT || (() => {});
    this.onOpenScreenModal = options.onOpenScreenModal || (() => {});
  }

  /**
   * 학생 그리드 렌더링
   */
  renderStudentGrid(students) {
    const grid = this.elements.studentGrid;
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (students.size === 0) {
      grid.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center py-6 text-gray-400 dark:text-gray-500">
          <span class="material-symbols-rounded text-3xl mb-2 opacity-50">hourglass_empty</span>
          <p class="text-sm">접속한 학생이 없습니다</p>
        </div>
      `;
      return;
    }
    
    students.forEach((student) => {
      const card = this.createStudentCard(student);
      grid.appendChild(card);
    });
  }

  /**
   * 학생 카드 생성
   */
  createStudentCard(student) {
    const card = document.createElement('div');
    const statusStyle = this.getStatusStyle(student.status);
    
    card.className = `p-3 rounded-xl border ${statusStyle.bg} ${statusStyle.border} transition-all hover:shadow-card shadow-soft`;
    card.setAttribute('data-peer-id', student.peerId);
    
    const statusInfo = this.getStatusInfo(student);
    const focusDisplay = this.getFocusDisplay(student);
    
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
    
    this.bindCardEvents(card, student);
    return card;
  }

  /**
   * 카드 이벤트 바인딩
   */
  bindCardEvents(card, student) {
    // 영상 확인
    card.querySelector('.btn-view-video')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenVideoModal(student.peerId, student.name);
    });
    
    // 집중도 상세
    card.querySelector('.btn-focus-detail')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenFocusDetailModal(student.peerId);
    });
    
    // 메시지
    card.querySelector('.btn-send-message')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenMessageModal(student.peerId, student.name);
    });
    
    // 출석
    card.querySelector('.btn-attendance')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenAttendanceModal(student.name);
    });
    
    // 집중도 보고서
    card.querySelector('.btn-focus-report')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenFocusReportModal(student.name, student.grade);
    });
    
    // 화면 썸네일 클릭
    card.querySelector('.screen-thumbnail')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenScreenModal(student.peerId);
    });
    card.querySelector('.btn-view-screen')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenScreenModal(student.peerId);
    });
    
    // PTT
    const pttBtn = card.querySelector('.btn-ptt');
    if (pttBtn) {
      pttBtn.addEventListener('mousedown', async (e) => {
        e.stopPropagation();
        await this.onStartPTT(student.peerId, student.name, pttBtn);
      });
      pttBtn.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        this.onStopPTT(student.peerId, pttBtn);
      });
      pttBtn.addEventListener('mouseleave', () => {
        this.onStopPTT(student.peerId, pttBtn);
      });
      pttBtn.addEventListener('touchstart', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this.onStartPTT(student.peerId, student.name, pttBtn);
      });
      pttBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.onStopPTT(student.peerId, pttBtn);
      });
    }
  }

  /**
   * 상태별 스타일
   */
  getStatusStyle(status) {
    const styles = {
      [STATUS.STANDING]: {
        bg: 'bg-white dark:bg-gray-800',
        border: 'border-l-4 border-l-green-500 border-gray-200 dark:border-gray-700',
        icon: 'accessibility_new',
        iconColor: 'text-green-500',
        textColor: 'text-green-600 dark:text-green-400'
      },
      [STATUS.SITTING]: {
        bg: 'bg-white dark:bg-gray-800',
        border: 'border-l-4 border-l-blue-500 border-gray-200 dark:border-gray-700',
        icon: 'weekend',
        iconColor: 'text-blue-500',
        textColor: 'text-blue-600 dark:text-blue-400'
      },
      [STATUS.AWAY]: {
        bg: 'bg-white dark:bg-gray-800',
        border: 'border-l-4 border-l-red-500 border-gray-200 dark:border-gray-700',
        icon: 'person_off',
        iconColor: 'text-red-500',
        textColor: 'text-red-600 dark:text-red-400'
      },
      [STATUS.HAND_RAISED]: {
        bg: 'bg-white dark:bg-gray-800',
        border: 'border-l-4 border-l-purple-500 border-gray-200 dark:border-gray-700',
        icon: 'pan_tool',
        iconColor: 'text-purple-500',
        textColor: 'text-purple-600 dark:text-purple-400'
      },
      [STATUS.NO_RESPONSE]: {
        bg: 'bg-white dark:bg-gray-800',
        border: 'border-l-4 border-l-amber-500 border-gray-200 dark:border-gray-700',
        icon: 'wifi_off',
        iconColor: 'text-amber-500',
        textColor: 'text-amber-600 dark:text-amber-400'
      },
      [STATUS.DISCONNECTED]: {
        bg: 'bg-gray-50 dark:bg-gray-800/50',
        border: 'border-l-4 border-l-gray-400 border-gray-200 dark:border-gray-700',
        icon: 'link_off',
        iconColor: 'text-gray-400',
        textColor: 'text-gray-500'
      }
    };
    
    return styles[status] || {
      bg: 'bg-white dark:bg-gray-800',
      border: 'border-gray-200 dark:border-gray-700',
      icon: 'hourglass_empty',
      iconColor: 'text-gray-400',
      textColor: 'text-gray-500'
    };
  }

  /**
   * 상태 정보 HTML
   */
  getStatusInfo(student) {
    if (student.status === STATUS.AWAY && student.awayStartTime) {
      const seconds = Math.floor((Date.now() - student.awayStartTime) / 1000);
      return `<p class="text-[10px] text-red-500 font-medium away-timer">${this.formatTime(seconds)}</p>`;
    } else if (student.status === STATUS.NO_RESPONSE && student.noResponseAt) {
      const seconds = Math.floor((Date.now() - student.noResponseAt) / 1000);
      return `<p class="text-[10px] text-amber-500 font-medium no-response-timer">응답없음 ${this.formatTime(seconds)}</p>`;
    } else if (student.status === STATUS.DISCONNECTED && student.disconnectedAt) {
      const seconds = Math.floor((Date.now() - student.disconnectedAt) / 1000);
      return `<p class="text-[10px] text-slate-400 font-medium">연결끊김 ${seconds}초</p>`;
    }
    return '';
  }

  /**
   * 집중도 표시 HTML
   */
  getFocusDisplay(student) {
    let html = '';
    
    // 화면 공유 중이면 썸네일 표시
    if (student.isScreenSharing && student.screenThumbnail) {
      html += `
        <div class="screen-thumbnail-container mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[10px] text-gray-400 flex items-center gap-1">
              <span class="material-symbols-rounded text-xs text-indigo-500">screen_share</span>
              화면 공유 중
            </span>
            <button class="btn-view-screen text-[10px] text-indigo-500 hover:text-indigo-600 font-medium">확대</button>
          </div>
          <img class="screen-thumbnail w-full rounded-md border border-gray-200 dark:border-gray-600 cursor-pointer hover:opacity-90 transition-opacity" src="${student.screenThumbnail}" />
        </div>
      `;
    } else if (student.isScreenSharing) {
      html += `
        <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div class="flex items-center gap-1 text-[10px] text-indigo-500">
            <span class="material-symbols-rounded text-xs">screen_share</span>
            화면 공유 대기 중...
          </div>
        </div>
      `;
    }
    
    if (student.focus && student.status !== STATUS.DISCONNECTED && student.status !== STATUS.NO_RESPONSE) {
      const focusColor = FOCUS_COLOR[student.focus.level] || '#9CA3AF';
      html += `
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
    return html;
  }

  /**
   * 통계 업데이트
   */
  updateStats(stats) {
    if (this.elements.totalStudents) {
      this.elements.totalStudents.textContent = stats.total;
    }
    if (this.elements.standingCount) {
      this.elements.standingCount.textContent = stats.standing;
    }
    if (this.elements.sittingCount) {
      this.elements.sittingCount.textContent = stats.sitting;
    }
    if (this.elements.awayCount) {
      this.elements.awayCount.textContent = stats.away;
    }
    if (this.elements.handRaisedCount) {
      this.elements.handRaisedCount.textContent = stats.handRaised;
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
