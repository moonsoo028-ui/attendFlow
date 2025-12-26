/**
 * 집중도 보고서 관리 모듈
 * - 집중도 데이터 저장 및 통계
 * - 일/주/월 단위 보고서 생성
 */
import { CONFIG } from './config.js';

class FocusReportManager {
  constructor() {
    this.prefix = 'focus_';
    this.today = this.getDateString(new Date());
    this.todayData = new Map(); // studentName -> FocusSessionData
  }

  getDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return this.getDateString(d);
  }

  /**
   * 날짜 문자열을 로컬 Date 객체로 변환
   */
  parseLocalDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * 초기화 - 오늘 데이터 로드
   */
  async init() {
    const data = localStorage.getItem(`${this.prefix}daily_${this.today}`);
    if (data) {
      const parsed = JSON.parse(data);
      Object.entries(parsed).forEach(([name, record]) => {
        this.todayData.set(name, record);
      });
    }
    console.log(`[FocusReportManager] 초기화 완료. 오늘 데이터: ${this.todayData.size}명`);
  }

  /**
   * 집중도 데이터 기록 (1초마다 호출)
   */
  recordFocusData(studentName, focusData, status) {
    const now = Date.now();
    let session = this.todayData.get(studentName);
    
    if (!session) {
      session = {
        studentName,
        date: this.today,
        startTime: now,
        lastUpdate: now,
        totalSeconds: 0,
        focusedSeconds: 0,        // 집중 시간 (70% 이상)
        scores: [],               // 점수 히스토리 (샘플링)
        sessions: [],             // 집중 세션들
        currentSessionStart: null, // 현재 세션 시작 시간
        maxFocusDuration: 0,      // 최대 연속 집중 시간
        currentFocusDuration: 0,  // 현재 연속 집중 시간
        awayCount: 0,             // 자리비움 횟수
        avgScore: 0,
        lastStatus: null,
        // 최대 착석 시간 (자리비움 → 자리비움 사이)
        maxSeatedDuration: 0,     // 최대 착석 시간
        currentSeatedDuration: 0, // 현재 착석 시간
        seatedSessionStart: null  // 착석 세션 시작 시간
      };
      this.todayData.set(studentName, session);
    }

    session.lastUpdate = now;
    session.totalSeconds++;

    const score = focusData?.score || 0;
    const isAway = status === 'away';
    const isFocused = score >= 70 && !isAway;

    // 집중 시간 계산 (70% 이상)
    if (isFocused) {
      session.focusedSeconds++;
      
      // 연속 집중 시간 계산
      if (session.currentSessionStart === null) {
        // 새 집중 세션 시작
        session.currentSessionStart = now;
        session.currentFocusDuration = 0;
      }
      session.currentFocusDuration++;
      
      // 최대 연속 집중 시간 업데이트 (실시간)
      if (session.currentFocusDuration > session.maxFocusDuration) {
        session.maxFocusDuration = session.currentFocusDuration;
      }
    } else {
      // 집중이 끊김 (점수 낮거나 자리비움)
      if (session.currentSessionStart !== null) {
        // 세션 종료 기록
        session.sessions.push({
          startTime: session.currentSessionStart,
          endTime: now,
          duration: session.currentFocusDuration
        });
        session.currentSessionStart = null;
        session.currentFocusDuration = 0;
      }
    }

    // 자리비움 카운트
    if (isAway && session.lastStatus !== 'away') {
      session.awayCount++;
      
      // 착석 세션 종료 - 최대 착석 시간 업데이트
      if (session.seatedSessionStart !== null && session.currentSeatedDuration > 0) {
        if (session.currentSeatedDuration > session.maxSeatedDuration) {
          session.maxSeatedDuration = session.currentSeatedDuration;
        }
        session.seatedSessionStart = null;
        session.currentSeatedDuration = 0;
      }
    }
    
    // 착석 시간 계산 (자리비움이 아닐 때)
    if (!isAway) {
      if (session.seatedSessionStart === null) {
        // 새 착석 세션 시작
        session.seatedSessionStart = now;
        session.currentSeatedDuration = 0;
      }
      session.currentSeatedDuration++;
      
      // 최대 착석 시간 실시간 업데이트
      if (session.currentSeatedDuration > session.maxSeatedDuration) {
        session.maxSeatedDuration = session.currentSeatedDuration;
      }
    }
    
    session.lastStatus = status;

    // 점수 샘플링 (10초마다)
    if (session.totalSeconds % 10 === 0) {
      session.scores.push({
        time: now,
        score: score
      });
      // 최대 360개 (1시간)
      if (session.scores.length > 360) {
        session.scores.shift();
      }
    }

    // 평균 점수 계산
    if (session.scores.length > 0) {
      session.avgScore = Math.round(
        session.scores.reduce((sum, s) => sum + s.score, 0) / session.scores.length
      );
    }

    // 저장 (10초마다)
    if (session.totalSeconds % 10 === 0) {
      this.saveTodayData();
    }
  }

  /**
   * 오늘 데이터 저장
   */
  saveTodayData() {
    const data = {};
    this.todayData.forEach((session, name) => {
      data[name] = session;
    });
    localStorage.setItem(`${this.prefix}daily_${this.today}`, JSON.stringify(data));
  }

  /**
   * 특정 날짜 데이터 조회
   */
  getDailyData(date) {
    const dateStr = typeof date === 'string' ? date : this.getDateString(date);
    if (dateStr === this.today) {
      const result = {};
      this.todayData.forEach((v, k) => result[k] = v);
      return result;
    }
    
    // 로컬 시간 기준 키로 먼저 조회
    let data = localStorage.getItem(`${this.prefix}daily_${dateStr}`);
    if (data) {
      return JSON.parse(data);
    }
    
    // 없으면 UTC 기준 키로도 조회 (기존 데이터 호환)
    const dateObj = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
    const utcDateStr = dateObj.toISOString().split('T')[0];
    if (utcDateStr !== dateStr) {
      data = localStorage.getItem(`${this.prefix}daily_${utcDateStr}`);
      if (data) {
        return JSON.parse(data);
      }
    }
    
    return {};
  }

  /**
   * 학생별 일간 보고서
   */
  async getDailyReport(studentName, date = null) {
    const dateStr = date || this.today;
    const data = this.getDailyData(dateStr);
    const session = data[studentName];

    if (!session) {
      return {
        studentName,
        date: dateStr,
        hasData: false
      };
    }

    return {
      studentName,
      date: dateStr,
      hasData: true,
      totalTime: session.totalSeconds,
      focusedTime: session.focusedSeconds,
      focusRate: session.totalSeconds > 0 
        ? Math.round((session.focusedSeconds / session.totalSeconds) * 100) 
        : 0,
      avgScore: session.avgScore,
      maxFocusDuration: session.maxFocusDuration,
      maxSeatedDuration: session.maxSeatedDuration || 0,
      awayCount: session.awayCount,
      sessionCount: session.sessions?.length || 0,
      scores: session.scores || []
    };
  }

  /**
   * 학생별 주간 보고서
   */
  async getWeeklyReport(studentName) {
    const weekStart = this.getWeekStart(new Date());
    const report = {
      studentName,
      weekStart,
      days: [],
      totalTime: 0,
      focusedTime: 0,
      avgScore: 0,
      maxFocusDuration: 0,
      maxSeatedDuration: 0,
      totalAwayCount: 0,
      activeDays: 0
    };

    let totalScores = [];

    for (let i = 0; i < 7; i++) {
      const date = this.parseLocalDate(weekStart);
      date.setDate(date.getDate() + i);
      const dateStr = this.getDateString(date);
      
      if (dateStr > this.today) break;

      const daily = await this.getDailyReport(studentName, dateStr);
      report.days.push(daily);

      if (daily.hasData) {
        report.activeDays++;
        report.totalTime += daily.totalTime;
        report.focusedTime += daily.focusedTime;
        report.totalAwayCount += daily.awayCount;
        
        if (daily.maxFocusDuration > report.maxFocusDuration) {
          report.maxFocusDuration = daily.maxFocusDuration;
        }
        
        if (daily.maxSeatedDuration > report.maxSeatedDuration) {
          report.maxSeatedDuration = daily.maxSeatedDuration;
        }
        
        if (daily.scores) {
          totalScores = totalScores.concat(daily.scores.map(s => s.score));
        }
      }
    }

    report.focusRate = report.totalTime > 0 
      ? Math.round((report.focusedTime / report.totalTime) * 100) 
      : 0;
    report.avgScore = totalScores.length > 0 
      ? Math.round(totalScores.reduce((a, b) => a + b, 0) / totalScores.length) 
      : 0;

    return report;
  }

  /**
   * 학생별 월간 보고서
   */
  async getMonthlyReport(studentName, year = null, month = null) {
    const now = new Date();
    year = year || now.getFullYear();
    month = month !== null ? month : now.getMonth();

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    const report = {
      studentName,
      year,
      month: month + 1,
      days: [],
      totalTime: 0,
      focusedTime: 0,
      avgScore: 0,
      maxFocusDuration: 0,
      maxSeatedDuration: 0,
      totalAwayCount: 0,
      activeDays: 0
    };

    let totalScores = [];

    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = this.getDateString(d);
      if (dateStr > this.today) break;

      const daily = await this.getDailyReport(studentName, dateStr);
      report.days.push(daily);

      if (daily.hasData) {
        report.activeDays++;
        report.totalTime += daily.totalTime;
        report.focusedTime += daily.focusedTime;
        report.totalAwayCount += daily.awayCount;
        
        if (daily.maxFocusDuration > report.maxFocusDuration) {
          report.maxFocusDuration = daily.maxFocusDuration;
        }
        
        if (daily.maxSeatedDuration > report.maxSeatedDuration) {
          report.maxSeatedDuration = daily.maxSeatedDuration;
        }
        
        if (daily.scores) {
          totalScores = totalScores.concat(daily.scores.map(s => s.score));
        }
      }
    }

    report.focusRate = report.totalTime > 0 
      ? Math.round((report.focusedTime / report.totalTime) * 100) 
      : 0;
    report.avgScore = totalScores.length > 0 
      ? Math.round(totalScores.reduce((a, b) => a + b, 0) / totalScores.length) 
      : 0;

    return report;
  }

  /**
   * 지난달 대비 변화량 계산
   */
  async getMonthlyComparison(studentName) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // 지난달 계산
    let lastYear = currentYear;
    let lastMonth = currentMonth - 1;
    if (lastMonth < 0) {
      lastMonth = 11;
      lastYear--;
    }
    
    // 이번달, 지난달 보고서 가져오기
    const currentReport = await this.getMonthlyReport(studentName, currentYear, currentMonth);
    const lastReport = await this.getMonthlyReport(studentName, lastYear, lastMonth);
    
    // 변화량 계산
    const comparison = {
      hasLastMonthData: lastReport.activeDays > 0,
      lastMonth: {
        year: lastYear,
        month: lastMonth + 1,
        focusedTime: lastReport.focusedTime,
        maxSeatedDuration: lastReport.maxSeatedDuration
      },
      currentMonth: {
        year: currentYear,
        month: currentMonth + 1,
        focusedTime: currentReport.focusedTime,
        maxSeatedDuration: currentReport.maxSeatedDuration
      },
      changes: {
        focusedTime: currentReport.focusedTime - lastReport.focusedTime,
        focusedTimePercent: lastReport.focusedTime > 0 
          ? Math.round(((currentReport.focusedTime - lastReport.focusedTime) / lastReport.focusedTime) * 100)
          : 0,
        maxSeatedDuration: currentReport.maxSeatedDuration - lastReport.maxSeatedDuration,
        maxSeatedDurationPercent: lastReport.maxSeatedDuration > 0
          ? Math.round(((currentReport.maxSeatedDuration - lastReport.maxSeatedDuration) / lastReport.maxSeatedDuration) * 100)
          : 0
      }
    };
    
    return comparison;
  }

  /**
   * 시간 포맷팅
   */
  formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0분';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    if (minutes > 0) {
      return `${minutes}분 ${secs}초`;
    }
    return `${secs}초`;
  }

  /**
   * 집중도 등급
   */
  getFocusGrade(rate) {
    if (rate >= 90) return { grade: 'A+', label: '최우수', color: '#10B981' };
    if (rate >= 80) return { grade: 'A', label: '우수', color: '#34D399' };
    if (rate >= 70) return { grade: 'B+', label: '양호', color: '#60A5FA' };
    if (rate >= 60) return { grade: 'B', label: '보통', color: '#FBBF24' };
    if (rate >= 50) return { grade: 'C', label: '주의', color: '#F97316' };
    return { grade: 'D', label: '경고', color: '#EF4444' };
  }
}

export { FocusReportManager };
