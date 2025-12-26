/**
 * PeerJS 연결 관리자
 * 학생-교사 간 P2P 통신 담당
 */
import { CONFIG } from './config.js';

class PeerManager {
  constructor() {
    this.peer = null;
    this.connections = new Map(); // peerId -> connection
    this.mediaConnections = new Map(); // peerId -> mediaConnection (영상 통화)
    this.audioConnections = new Map(); // peerId -> mediaConnection (오디오 PTT)
    this.onConnectionChange = null;
    this.onDataReceived = null;
    this.onError = null;
    this.onStreamReceived = null; // 영상 스트림 수신 콜백
    this.onStreamRequest = null; // 영상 요청 수신 콜백
    this.onAudioReceived = null; // 오디오 스트림 수신 콜백
    this.myId = null;
    this.role = null; // 'student' or 'teacher'
    this.localStream = null; // 로컬 미디어 스트림
    this.localAudioStream = null; // 로컬 오디오 스트림 (PTT용)
  }

  /**
   * PeerJS 초기화
   * @param {string} role - 'student' 또는 'teacher'
   * @param {string} customId - 커스텀 ID (선택)
   */
  async init(role, customId = null) {
    this.role = role;
    this.customId = customId; // 재연결 시 사용하기 위해 저장
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000; // 2초
    
    return this._createPeerConnection(customId);
  }

  /**
   * PeerJS 연결 생성 (내부 메서드)
   */
  _createPeerConnection(customId = null) {
    return new Promise((resolve, reject) => {
      const peerId = customId || this.generateId(this.role);
      
      // 기존 peer가 있으면 정리
      if (this.peer) {
        try {
          this.peer.destroy();
        } catch (e) {
          console.log('[PeerManager] 기존 peer 정리 중 에러 (무시):', e);
        }
        this.peer = null;
      }
      
      this.peer = new Peer(peerId, {
        host: CONFIG.peer.host,
        port: CONFIG.peer.port,
        secure: CONFIG.peer.secure,
        debug: CONFIG.peer.debug
      });

      this.peer.on('open', (id) => {
        this.myId = id;
        this.reconnectAttempts = 0; // 연결 성공 시 재시도 횟수 초기화
        console.log(`[PeerManager] 연결됨: ${id}`);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        console.log(`[PeerManager] 새 연결 수신: ${conn.peer}`);
        this.handleConnection(conn);
      });

      // 영상 통화 수신 처리
      this.peer.on('call', (call) => {
        this.handleIncomingCall(call);
      });

      this.peer.on('error', (err) => {
        console.error('[PeerManager] 에러:', err);
        
        // ID 중복 에러 처리 (unavailable-id)
        if (err.type === 'unavailable-id') {
          console.log('[PeerManager] ID 중복 에러, 재연결 시도...');
          this._handleIdConflict(resolve, reject);
          return;
        }
        
        if (this.onError) this.onError(err);
        reject(err);
      });

      this.peer.on('disconnected', () => {
        console.log('[PeerManager] 연결 끊김');
        this._handleDisconnect();
      });
      
      this.peer.on('close', () => {
        console.log('[PeerManager] Peer 종료됨');
      });
    });
  }

  /**
   * ID 충돌 처리 (재부팅 후 같은 ID로 접속 시)
   */
  _handleIdConflict(resolve, reject) {
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error('[PeerManager] 최대 재연결 시도 횟수 초과');
      const error = new Error('ID 충돌로 인한 연결 실패. 잠시 후 다시 시도해주세요.');
      error.type = 'unavailable-id';
      reject(error);
      return;
    }
    
    console.log(`[PeerManager] ID 충돌 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    // 기존 peer 정리
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {
        // 무시
      }
      this.peer = null;
    }
    
    // 지연 후 재연결 (PeerJS 서버에서 이전 ID가 해제될 시간 확보)
    setTimeout(() => {
      this._createPeerConnection(this.customId)
        .then(resolve)
        .catch(reject);
    }, this.reconnectDelay * this.reconnectAttempts); // 점진적 지연
  }

  /**
   * 연결 끊김 처리
   */
  _handleDisconnect() {
    // 이미 재연결 중이면 무시
    if (this._reconnecting) return;
    
    // peer가 없거나 파괴되었으면 무시
    if (!this.peer || this.peer.destroyed) return;
    
    // 이미 연결되어 있으면 재연결 불필요
    if (!this.peer.disconnected) {
      console.log('[PeerManager] 이미 연결된 상태, 재연결 불필요');
      return;
    }
    
    this._reconnecting = true;
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error('[PeerManager] 최대 재연결 시도 횟수 초과');
      this._reconnecting = false;
      return;
    }
    
    console.log(`[PeerManager] 재연결 시도 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(() => {
      // 재연결 전 다시 한번 상태 확인
      if (this.peer && !this.peer.destroyed && this.peer.disconnected) {
        try {
          this.peer.reconnect();
        } catch (e) {
          console.warn('[PeerManager] 재연결 실패:', e.message);
        }
      }
      this._reconnecting = false;
    }, this.reconnectDelay);
  }

  generateId(role) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `${role}-${timestamp}-${random}`;
  }


  /**
   * 다른 피어에 연결
   * @param {string} peerId - 연결할 피어 ID
   */
  connect(peerId) {
    if (this.connections.has(peerId)) {
      console.log(`[PeerManager] 이미 연결됨: ${peerId}`);
      return this.connections.get(peerId);
    }

    const conn = this.peer.connect(peerId, {
      reliable: true
    });

    this.handleConnection(conn);
    return conn;
  }

  handleConnection(conn) {
    console.log(`[PeerManager] handleConnection 호출: ${conn.peer}, role: ${this.role}, isReverse: ${conn._isReverse}`);
    
    conn.on('open', () => {
      console.log(`[PeerManager] 연결 열림: ${conn.peer}`);
      this.connections.set(conn.peer, conn);
      
      // 교사인 경우: 학생에게 역방향 연결 (양방향 통신 위해)
      if (this.role === 'teacher' && !conn._isReverse) {
        console.log(`[PeerManager] 역방향 연결 시도: ${conn.peer}`);
        const reverseConn = this.peer.connect(conn.peer, { reliable: true });
        reverseConn._isReverse = true;
        this.handleConnection(reverseConn);
      }
      
      if (this.onConnectionChange) {
        this.onConnectionChange('connected', conn.peer);
      }
    });

    conn.on('data', (data) => {
      console.log(`[PeerManager] 데이터 수신 from ${conn.peer}:`, data);
      if (this.onDataReceived) {
        this.onDataReceived(conn.peer, data);
      }
    });

    conn.on('close', () => {
      console.log(`[PeerManager] 연결 닫힘: ${conn.peer}`);
      this.connections.delete(conn.peer);
      
      if (this.onConnectionChange) {
        this.onConnectionChange('disconnected', conn.peer);
      }
    });

    conn.on('error', (err) => {
      console.error(`[PeerManager] 연결 에러 (${conn.peer}):`, err);
      // 에러 발생 시에도 연결 끊김 처리
      this.connections.delete(conn.peer);
      if (this.onConnectionChange) {
        this.onConnectionChange('disconnected', conn.peer);
      }
    });
    
    // ICE 연결 상태 변경 감지 (WebRTC 레벨)
    if (conn.peerConnection) {
      conn.peerConnection.oniceconnectionstatechange = () => {
        const state = conn.peerConnection.iceConnectionState;
        console.log(`[PeerManager] ICE 상태 변경 (${conn.peer}): ${state}`);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          console.log(`[PeerManager] ICE 연결 끊김: ${conn.peer}`);
          this.connections.delete(conn.peer);
          if (this.onConnectionChange) {
            this.onConnectionChange('disconnected', conn.peer);
          }
        }
      };
    }
  }

  /**
   * 데이터 전송
   * @param {string} peerId - 대상 피어 ID (null이면 모든 연결에 전송)
   * @param {object} data - 전송할 데이터
   * @returns {boolean} 전송 성공 여부
   */
  send(peerId, data) {
    console.log(`[PeerManager] 데이터 전송 시도: ${peerId}`, data.type);
    console.log(`[PeerManager] 현재 연결 목록:`, Array.from(this.connections.keys()));
    
    if (peerId) {
      const conn = this.connections.get(peerId);
      if (conn && conn.open) {
        try {
          conn.send(data);
          console.log(`[PeerManager] 전송 성공: ${peerId}`);
          return true;
        } catch (e) {
          console.error(`[PeerManager] 전송 실패: ${peerId}`, e);
          // 전송 실패 시 연결 끊김 처리
          this.connections.delete(peerId);
          if (this.onConnectionChange) {
            this.onConnectionChange('disconnected', peerId);
          }
          return false;
        }
      } else {
        console.error(`[PeerManager] 연결 없음 또는 닫힘: ${peerId}`);
        // 연결이 없으면 끊김 알림
        if (this.connections.has(peerId)) {
          this.connections.delete(peerId);
          if (this.onConnectionChange) {
            this.onConnectionChange('disconnected', peerId);
          }
        }
        return false;
      }
    } else {
      // 브로드캐스트
      let sentCount = 0;
      this.connections.forEach((conn, connPeerId) => {
        if (conn.open) {
          try {
            conn.send(data);
            sentCount++;
          } catch (e) {
            console.error(`[PeerManager] 브로드캐스트 전송 실패: ${connPeerId}`, e);
          }
        }
      });
      return sentCount > 0;
    }
  }

  /**
   * 연결된 피어 목록
   */
  getConnectedPeers() {
    return Array.from(this.connections.keys());
  }

  /**
   * 연결 해제
   */
  disconnect() {
    this.connections.forEach((conn) => conn.close());
    this.connections.clear();
    if (this.peer) {
      this.peer.destroy();
    }
  }

  setOnConnectionChange(callback) {
    this.onConnectionChange = callback;
  }

  setOnDataReceived(callback) {
    this.onDataReceived = callback;
  }

  setOnError(callback) {
    this.onError = callback;
  }

  setOnStreamReceived(callback) {
    this.onStreamReceived = callback;
  }

  setOnStreamRequest(callback) {
    this.onStreamRequest = callback;
  }

  /**
   * 로컬 미디어 스트림 설정 (학생용)
   */
  setLocalStream(stream) {
    this.localStream = stream;
  }

  /**
   * 영상 통화 수신 처리
   */
  handleIncomingCall(call) {
    console.log(`[PeerManager] 영상 요청 수신: ${call.peer}, role: ${this.role}, hasLocalStream: ${!!this.localStream}`);
    
    // 학생인 경우: 로컬 스트림으로 응답
    if (this.role === 'student' && this.localStream) {
      console.log('[PeerManager] 학생: 로컬 스트림으로 응답');
      call.answer(this.localStream);
      
      this.mediaConnections.set(call.peer, call);
      
      call.on('close', () => {
        console.log(`[PeerManager] 영상 통화 종료: ${call.peer}`);
        this.mediaConnections.delete(call.peer);
      });
    } else if (this.role === 'teacher') {
      // 교사인 경우: 학생이 보낸 스트림 수신
      console.log('[PeerManager] 교사: 빈 스트림으로 응답하고 학생 스트림 수신 대기');
      call.answer(this.createEmptyStream());
      
      call.on('stream', (remoteStream) => {
        console.log(`[PeerManager] 교사: 영상 스트림 수신 성공: ${call.peer}`);
        console.log(`[PeerManager] 스트림 트랙:`, remoteStream.getTracks());
        this.mediaConnections.set(call.peer, call);
        
        if (this.onStreamReceived) {
          this.onStreamReceived(call.peer, remoteStream);
        }
      });
      
      call.on('close', () => {
        console.log(`[PeerManager] 영상 통화 종료: ${call.peer}`);
        this.mediaConnections.delete(call.peer);
      });
      
      call.on('error', (err) => {
        console.error(`[PeerManager] 영상 통화 에러: ${call.peer}`, err);
      });
    } else {
      console.log('[PeerManager] 로컬 스트림 없음, 응답 불가');
    }
  }

  /**
   * 영상 스트림 요청 (교사 → 학생) - DataChannel로 요청 메시지 전송
   * @param {string} peerId - 학생 피어 ID
   */
  requestStream(peerId) {
    return new Promise((resolve, reject) => {
      console.log(`[PeerManager] 영상 요청 전송: ${peerId}`);
      
      // 스트림 수신 콜백 설정
      const originalCallback = this.onStreamReceived;
      let resolved = false;
      
      this.onStreamReceived = (fromPeerId, stream) => {
        console.log(`[PeerManager] onStreamReceived 호출: ${fromPeerId}`);
        if (fromPeerId === peerId && !resolved) {
          resolved = true;
          this.onStreamReceived = originalCallback;
          resolve(stream);
        }
      };
      
      // DataChannel로 영상 요청 메시지 전송
      this.send(peerId, { type: 'video_request' });

      // 타임아웃 20초
      setTimeout(() => {
        if (!resolved) {
          this.onStreamReceived = originalCallback;
          reject(new Error('영상 연결 타임아웃'));
        }
      }, 20000);
    });
  }

  /**
   * 영상 스트림 전송 (학생 → 교사)
   * @param {string} peerId - 교사 피어 ID
   */
  sendStream(peerId) {
    if (!this.localStream) {
      console.error('[PeerManager] 로컬 스트림 없음');
      return;
    }
    
    console.log(`[PeerManager] 영상 스트림 전송 시작: ${peerId}`);
    console.log(`[PeerManager] 로컬 스트림 트랙:`, this.localStream.getTracks());
    
    const call = this.peer.call(peerId, this.localStream);
    
    if (!call) {
      console.error('[PeerManager] call 생성 실패');
      return;
    }
    
    call.on('stream', (remoteStream) => {
      console.log(`[PeerManager] 영상 통화 연결됨 (상대 스트림 수신): ${peerId}`);
    });
    
    call.on('close', () => {
      console.log(`[PeerManager] 영상 통화 종료: ${peerId}`);
      this.mediaConnections.delete(peerId);
    });
    
    call.on('error', (err) => {
      console.error(`[PeerManager] 영상 통화 에러: ${peerId}`, err);
    });
    
    this.mediaConnections.set(peerId, call);
    console.log(`[PeerManager] call 생성 완료, mediaConnections:`, Array.from(this.mediaConnections.keys()));
  }

  /**
   * 영상 스트림 종료
   * @param {string} peerId - 피어 ID
   */
  closeStream(peerId) {
    const call = this.mediaConnections.get(peerId);
    if (call) {
      call.close();
      this.mediaConnections.delete(peerId);
    }
  }

  /**
   * 빈 미디어 스트림 생성 (교사용 - 영상 안 보냄)
   */
  createEmptyStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillRect(0, 0, 1, 1);
    return canvas.captureStream(1);
  }

  /**
   * 오디오 스트림 수신 콜백 설정
   */
  setOnAudioReceived(callback) {
    this.onAudioReceived = callback;
  }

  /**
   * PTT 시작 - 마이크 권한 획득 및 오디오 전송 시작
   * @param {string} peerId - 대상 피어 ID
   */
  async startPTT(peerId) {
    try {
      console.log(`[PeerManager] PTT 시작: ${peerId}`);
      
      // 마이크 권한 획득
      if (!this.localAudioStream) {
        this.localAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        console.log('[PeerManager] 마이크 권한 획득 성공');
      }
      
      // 상대방에게 PTT 시작 알림
      this.send(peerId, { type: 'ptt_start' });
      
      // 오디오 스트림 전송
      const call = this.peer.call(peerId, this.localAudioStream, {
        metadata: { type: 'ptt_audio' }
      });
      
      if (!call) {
        console.error('[PeerManager] PTT call 생성 실패');
        return false;
      }
      
      call.on('stream', () => {
        console.log(`[PeerManager] PTT 연결됨: ${peerId}`);
      });
      
      call.on('close', () => {
        console.log(`[PeerManager] PTT 종료: ${peerId}`);
        this.audioConnections.delete(peerId);
      });
      
      call.on('error', (err) => {
        console.error(`[PeerManager] PTT 에러: ${peerId}`, err);
      });
      
      this.audioConnections.set(peerId, call);
      return true;
      
    } catch (err) {
      console.error('[PeerManager] PTT 시작 실패:', err);
      return false;
    }
  }

  /**
   * PTT 종료 - 오디오 전송 중지
   * @param {string} peerId - 대상 피어 ID
   */
  stopPTT(peerId) {
    console.log(`[PeerManager] PTT 종료: ${peerId}`);
    
    // 상대방에게 PTT 종료 알림
    this.send(peerId, { type: 'ptt_end' });
    
    // 오디오 연결 종료
    const call = this.audioConnections.get(peerId);
    if (call) {
      call.close();
      this.audioConnections.delete(peerId);
    }
  }

  /**
   * 마이크 스트림 해제
   */
  releaseMicrophone() {
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(track => track.stop());
      this.localAudioStream = null;
      console.log('[PeerManager] 마이크 해제');
    }
  }

  /**
   * 영상 통화 수신 처리 (오디오 PTT 포함)
   */
  handleIncomingCall(call) {
    const metadata = call.metadata || {};
    
    // PTT 오디오인 경우
    if (metadata.type === 'ptt_audio') {
      console.log(`[PeerManager] PTT 오디오 수신: ${call.peer}`);
      
      call.answer(this.createEmptyAudioStream());
      
      call.on('stream', (remoteStream) => {
        console.log(`[PeerManager] PTT 오디오 스트림 수신: ${call.peer}`);
        this.audioConnections.set(call.peer, call);
        
        if (this.onAudioReceived) {
          this.onAudioReceived(call.peer, remoteStream, true); // true = 시작
        }
      });
      
      call.on('close', () => {
        console.log(`[PeerManager] PTT 오디오 종료: ${call.peer}`);
        this.audioConnections.delete(call.peer);
        
        if (this.onAudioReceived) {
          this.onAudioReceived(call.peer, null, false); // false = 종료
        }
      });
      
      return;
    }
    
    // 기존 영상 통화 처리
    console.log(`[PeerManager] 영상 요청 수신: ${call.peer}, role: ${this.role}, hasLocalStream: ${!!this.localStream}`);
    
    // 학생인 경우: 로컬 스트림으로 응답
    if (this.role === 'student' && this.localStream) {
      console.log('[PeerManager] 학생: 로컬 스트림으로 응답');
      call.answer(this.localStream);
      
      this.mediaConnections.set(call.peer, call);
      
      call.on('close', () => {
        console.log(`[PeerManager] 영상 통화 종료: ${call.peer}`);
        this.mediaConnections.delete(call.peer);
      });
    } else if (this.role === 'teacher') {
      // 교사인 경우: 학생이 보낸 스트림 수신
      console.log('[PeerManager] 교사: 빈 스트림으로 응답하고 학생 스트림 수신 대기');
      call.answer(this.createEmptyStream());
      
      call.on('stream', (remoteStream) => {
        console.log(`[PeerManager] 교사: 영상 스트림 수신 성공: ${call.peer}`);
        console.log(`[PeerManager] 스트림 트랙:`, remoteStream.getTracks());
        this.mediaConnections.set(call.peer, call);
        
        if (this.onStreamReceived) {
          this.onStreamReceived(call.peer, remoteStream);
        }
      });
      
      call.on('close', () => {
        console.log(`[PeerManager] 영상 통화 종료: ${call.peer}`);
        this.mediaConnections.delete(call.peer);
      });
      
      call.on('error', (err) => {
        console.error(`[PeerManager] 영상 통화 에러: ${call.peer}`, err);
      });
    } else {
      console.log('[PeerManager] 로컬 스트림 없음, 응답 불가');
    }
  }

  /**
   * 빈 오디오 스트림 생성
   */
  createEmptyAudioStream() {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst = ctx.createMediaStreamDestination();
    oscillator.connect(dst);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.001);
    return dst.stream;
  }
}

export { PeerManager };
