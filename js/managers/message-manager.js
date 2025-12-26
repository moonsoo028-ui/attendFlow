/**
 * 메시지 관리 모듈
 * - 전체 공지
 * - 개별 메시지
 */

export class MessageManager {
  constructor(options = {}) {
    this.elements = options.elements || {};
    this.peerManager = options.peerManager || null;
    this.currentTarget = null; // null이면 전체
    this.onAlert = options.onAlert || (() => {});
  }

  /**
   * PeerManager 설정
   */
  setPeerManager(peerManager) {
    this.peerManager = peerManager;
  }

  /**
   * 메시지 모달 열기
   */
  openModal(peerId = null, studentName = null) {
    this.currentTarget = peerId;
    
    if (this.elements.messageModalTitle) {
      this.elements.messageModalTitle.textContent = peerId ? `${studentName}에게 메시지` : '전체 공지';
    }
    
    if (this.elements.messageTargetInfo) {
      this.elements.messageTargetInfo.textContent = peerId ? 
        `${studentName} 학생에게만 메시지가 전송됩니다.` : 
        '모든 학생에게 메시지가 전송됩니다.';
    }
    
    if (this.elements.messageInput) {
      this.elements.messageInput.value = '';
    }
    
    if (this.elements.messageModal) {
      this.elements.messageModal.style.display = 'flex';
      this.elements.messageInput?.focus();
    }
  }

  /**
   * 메시지 모달 닫기
   */
  closeModal() {
    this.currentTarget = null;
    if (this.elements.messageModal) {
      this.elements.messageModal.style.display = 'none';
    }
  }

  /**
   * 메시지 전송
   */
  send() {
    const message = this.elements.messageInput?.value?.trim();
    if (!message) {
      alert('메시지를 입력해주세요.');
      return false;
    }
    
    if (!this.peerManager) {
      console.error('[MessageManager] PeerManager가 설정되지 않았습니다.');
      return false;
    }
    
    const data = {
      type: 'teacher_message',
      message: message,
      timestamp: Date.now(),
      isBroadcast: !this.currentTarget
    };
    
    if (this.currentTarget) {
      // 개별 전송
      this.peerManager.send(this.currentTarget, data);
      this.onAlert(`📨 메시지 전송 완료`, 'info');
    } else {
      // 전체 전송
      this.peerManager.send(null, data);
      this.onAlert(`📢 전체 공지 전송: "${message.substring(0, 20)}${message.length > 20 ? '...' : ''}"`, 'info');
    }
    
    this.closeModal();
    return true;
  }

  /**
   * 학생 메시지 처리
   */
  handleStudentMessage(peerId, data, onAlert, onPlaySound) {
    const studentName = data.name || '학생';
    const message = data.message;
    
    onAlert(`💬 ${studentName}: "${message}"`, 'info');
    onPlaySound();
  }
}
