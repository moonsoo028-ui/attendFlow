/**
 * 출석 관리 모듈
 * - localStorage 기반 저장 (추후 MySQL 연동 가능)
 * - 주간/월간 출석 통계
 */
import { CONFIG } from './config.js';

// 저장소 인터페이스 (Strategy Pattern)
class StorageInterface {
  async save(key, data) { throw new Error('Not implemented'); }
  async load(key) { throw new Error('Not implemented'); }
  async delete(key) { throw new Error('Not implemented'); }
}

// localStorage 저장소
class LocalStorageAdapter extends StorageInterface {
  constructor(prefix = 'attendance_') {
    super();
    this.prefix = prefix;
  }

  async save(key, data) {
    localStorage.setItem(this.prefix + key, JSON.stringify(data));
    return true;
  }

  async load(key) {
    const data = localStorage.getItem(this.prefix + key);
    return data ? JSON.parse(data) : null;
  }

  async delete(key) {
    localStorage.removeItem(this.prefix + key);
    return true;
  }

  async getAllKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(this.prefix)) {
        keys.push(key.replace(this.prefix, ''));
      }
    }
    return keys;
  }
}

// MySQL API 저장소 (추후 구현)
class MySQLAdapter extends StorageInterface {
  constructor(baseUrl) {
    super();
    this.baseUrl = baseUrl;
  }

  async save(key, data) {
    const response = await fetch(`${this.baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, data })
    });
    return response.ok;
  }

  async load(key) {
    const response = await fetch(`${this.baseUrl}/attendance/${key}`);
    if (!response.ok) return null;
    return response.json();
  }

  async delete(key) {
    const response = await fetch(`${this.baseUrl}/attendance/${key}`, {
      method: 'DELETE'
    });
    return response.ok;
  }
}

/**
 * 출석 기록 데이터 구조
 * @typedef {Object} AttendanceRecord
 * @property {string} date - 날짜 (YYYY-MM-DD)
 * @property {string} studentName - 학생 이름
 * @property {number} checkInTime - 출석 시간 (timestamp)
 * @property {number|null} checkOutTime - 퇴실 시간 (timestamp)
 * @property {number} totalTime - 총 접속 시간 (ms)
 * @property {string} status - 출석 상태 (present, late, absent)
 */

class AttendanceManager {
  constructor() {
    // 저장소 선택 (config 기반)
    if (CONFIG.api?.enabled) {
      this.storage = new MySQLAdapter(CONFIG.api.baseUrl);
    } else {
      this.storage = new LocalStorageAdapter();
    }
    
    // 오늘 날짜
    this.today = this.getDateString(new Date());
    
    // 메모리 캐시 (현재 세션)
    this.todayRecords = new Map(); // studentName -> AttendanceRecord
  }

  /**
   * 날짜를 YYYY-MM-DD 형식으로 변환 (로컬 시간 기준)
   */
  getDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 주의 시작일 (월요일) 구하기
   */
  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return this.getDateString(d);
  }

  /**
   * 월의 시작일 구하기
   */
  getMonthStart(date) {
    const d = new Date(date);
    d.setDate(1);
    return this.getDateString(d);
  }

  /**
   * 초기화 - 오늘 출석 데이터 로드
   */
  async init() {
    const data = await this.storage.load(`daily_${this.today}`);
    if (data) {
      data.forEach(record => {
        this.todayRecords.set(record.studentName, record);
      });
    }
    console.log(`[AttendanceManager] 초기화 완료. 오늘 출석: ${this.todayRecords.size}명`);
  }

  /**
   * 출석 체크 (학생 접속 시)
   */
  async checkIn(studentName) {
    const now = Date.now();
    
    // 이미 오늘 출석한 학생인지 확인
    let record = this.todayRecords.get(studentName);
    
    if (record) {
      // 재접속 - checkOutTime만 초기화
      record.checkOutTime = null;
      console.log(`[AttendanceManager] ${studentName} 재접속`);
    } else {
      // 신규 출석
      record = {
        date: this.today,
        studentName: studentName,
        checkInTime: now,
        checkOutTime: null,
        totalTime: 0,
        status: 'present'
      };
      this.todayRecords.set(studentName, record);
      console.log(`[AttendanceManager] ${studentName} 출석 체크`);
    }
    
    await this.saveTodayRecords();
    return record;
  }

  /**
   * 퇴실 체크 (학생 연결 해제 시)
   */
  async checkOut(studentName) {
    const record = this.todayRecords.get(studentName);
    if (!record) return null;
    
    const now = Date.now();
    record.checkOutTime = now;
    
    // 총 접속 시간 계산 (이번 세션)
    const sessionTime = now - (record.lastCheckIn || record.checkInTime);
    record.totalTime += sessionTime;
    record.lastCheckIn = null;
    
    await this.saveTodayRecords();
    console.log(`[AttendanceManager] ${studentName} 퇴실. 총 시간: ${this.formatDuration(record.totalTime)}`);
    return record;
  }

  /**
   * 오늘 출석 데이터 저장
   */
  async saveTodayRecords() {
    const records = Array.from(this.todayRecords.values());
    await this.storage.save(`daily_${this.today}`, records);
  }

  /**
   * 특정 날짜의 출석 데이터 조회
   */
  async getDailyRecords(date) {
    const dateStr = typeof date === 'string' ? date : this.getDateString(date);
    if (dateStr === this.today) {
      return Array.from(this.todayRecords.values());
    }
    return await this.storage.load(`daily_${dateStr}`) || [];
  }

  /**
   * 주간 출석 통계
   */
  async getWeeklyStats(studentName = null) {
    const weekStart = this.getWeekStart(new Date());
    const stats = {
      weekStart,
      totalDays: 0,
      presentDays: 0,
      totalTime: 0,
      dailyRecords: []
    };
    
    // 이번 주 7일간 데이터 조회
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + i);
      const dateStr = this.getDateString(date);
      
      // 미래 날짜는 스킵
      if (dateStr > this.today) break;
      
      stats.totalDays++;
      const records = await this.getDailyRecords(dateStr);
      
      if (studentName) {
        // 특정 학생
        const record = records.find(r => r.studentName === studentName);
        if (record) {
          stats.presentDays++;
          stats.totalTime += record.totalTime;
          stats.dailyRecords.push(record);
        } else {
          stats.dailyRecords.push({ date: dateStr, status: 'absent' });
        }
      } else {
        // 전체 학생
        stats.dailyRecords.push({
          date: dateStr,
          count: records.length,
          records: records
        });
        if (records.length > 0) stats.presentDays++;
      }
    }
    
    return stats;
  }

  /**
   * 월간 출석 통계
   */
  async getMonthlyStats(studentName = null, year = null, month = null) {
    const now = new Date();
    year = year || now.getFullYear();
    month = month !== null ? month : now.getMonth();
    
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    
    const stats = {
      year,
      month: month + 1,
      totalDays: 0,
      presentDays: 0,
      totalTime: 0,
      dailyRecords: []
    };
    
    // 해당 월의 모든 날짜 조회
    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = this.getDateString(d);
      
      // 미래 날짜는 스킵
      if (dateStr > this.today) break;
      
      stats.totalDays++;
      const records = await this.getDailyRecords(dateStr);
      
      if (studentName) {
        const record = records.find(r => r.studentName === studentName);
        if (record) {
          stats.presentDays++;
          stats.totalTime += record.totalTime;
          stats.dailyRecords.push(record);
        } else {
          stats.dailyRecords.push({ date: dateStr, status: 'absent' });
        }
      } else {
        stats.dailyRecords.push({
          date: dateStr,
          count: records.length,
          records: records
        });
        if (records.length > 0) stats.presentDays++;
      }
    }
    
    return stats;
  }

  /**
   * 학생별 출석 요약
   */
  async getStudentSummary(studentName) {
    const weekly = await this.getWeeklyStats(studentName);
    const monthly = await this.getMonthlyStats(studentName);
    
    return {
      studentName,
      weekly: {
        presentDays: weekly.presentDays,
        totalDays: weekly.totalDays,
        rate: weekly.totalDays > 0 ? Math.round((weekly.presentDays / weekly.totalDays) * 100) : 0,
        totalTime: weekly.totalTime
      },
      monthly: {
        presentDays: monthly.presentDays,
        totalDays: monthly.totalDays,
        rate: monthly.totalDays > 0 ? Math.round((monthly.presentDays / monthly.totalDays) * 100) : 0,
        totalTime: monthly.totalTime
      }
    };
  }

  /**
   * 전체 학생 목록 (출석 기록 있는)
   */
  async getAllStudents() {
    const students = new Set();
    
    // localStorage에서 모든 출석 데이터 키 조회
    if (this.storage instanceof LocalStorageAdapter) {
      const keys = await this.storage.getAllKeys();
      for (const key of keys) {
        if (key.startsWith('daily_')) {
          const records = await this.storage.load(key);
          if (records) {
            records.forEach(r => students.add(r.studentName));
          }
        }
      }
    }
    
    return Array.from(students);
  }

  /**
   * 시간 포맷팅 (ms -> 시:분:초)
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    return `${minutes}분 ${secs}초`;
  }

  /**
   * 오늘 출석 현황 (실시간)
   */
  getTodayStats() {
    const records = Array.from(this.todayRecords.values());
    return {
      date: this.today,
      totalStudents: records.length,
      records: records
    };
  }

  /**
   * 출석 데이터 내보내기 (CSV)
   */
  async exportToCSV(startDate, endDate) {
    let csv = '날짜,학생이름,출석시간,퇴실시간,총접속시간,상태\n';
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = this.getDateString(d);
      const records = await this.getDailyRecords(dateStr);
      
      records.forEach(r => {
        const checkIn = new Date(r.checkInTime).toLocaleTimeString('ko-KR');
        const checkOut = r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString('ko-KR') : '-';
        const duration = this.formatDuration(r.totalTime);
        csv += `${r.date},${r.studentName},${checkIn},${checkOut},${duration},${r.status}\n`;
      });
    }
    
    return csv;
  }

  /**
   * 저장소 타입 변경 (런타임)
   */
  setStorageType(type, options = {}) {
    if (type === 'mysql' && options.baseUrl) {
      this.storage = new MySQLAdapter(options.baseUrl);
      console.log('[AttendanceManager] MySQL 저장소로 전환');
    } else {
      this.storage = new LocalStorageAdapter();
      console.log('[AttendanceManager] localStorage 저장소로 전환');
    }
  }
}

export { AttendanceManager, LocalStorageAdapter, MySQLAdapter };
