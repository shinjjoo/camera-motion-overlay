/**
 * ============================================================================
 * [푸른 바다 지킴이 (Ocean Trash Cleaner) - 메인 애플리케이션 통합 제어기]
 * 파일명: js/app-ocean.js
 * 
 * [주요 기능]
 * 1. 카메라 매니저(CameraManager), 모션 트래커(MotionTracker),
 *    사운드 엔진(SoundEngine), 해양 게임 엔진(OceanGameEngine) 인스턴스 총괄 제어
 * 2. 브라우저 창 리사이즈 및 고해상도(DPI) 캔버스 자동 동기화
 * 3. 5단계 레벨 선택, 거울 모드, OBS 투명 모드, 크로마키, 전체화면 등 모든 버튼 바인딩
 * 4. 초당 60fps requestAnimationFrame 메인 렌더링 파이프라인 구동
 * ============================================================================
 */

import { CameraManager } from './camera.js';
import { MotionTracker } from './motion.js';
import { SoundEngine } from './audio.js';
import { OceanGameEngine } from './game-ocean.js';

class OceanApp {
  constructor() {
    // ------------------------------------------------------------------------
    // [1. DOM 엘리먼트 캐싱]
    // ------------------------------------------------------------------------
    this.appContainer = document.getElementById('appContainer');
    this.videoElement = document.getElementById('webcam');
    this.canvasElement = document.getElementById('gameCanvas');
    this.cameraSelect = document.getElementById('cameraSelect');
    this.levelSelect = document.getElementById('levelSelect');

    // 제어 버튼들
    this.gameStartBtn = document.getElementById('gameStartBtn');
    this.toggleMirrorBtn = document.getElementById('toggleMirrorBtn');
    this.toggleObsBtn = document.getElementById('toggleObsBtn');
    this.toggleChromaBtn = document.getElementById('toggleChromaBtn');
    this.toggleSoundBtn = document.getElementById('toggleSoundBtn');
    this.soundIcon = document.getElementById('soundIcon');
    this.soundText = document.getElementById('soundText');
    this.toggleFullscreenBtn = document.getElementById('toggleFullscreenBtn');

    // 안내 가이드 & 모달
    this.guideOverlay = document.getElementById('guideOverlay');
    this.guideCloseBtn = document.getElementById('guideCloseBtn');
    this.modalRestartBtn = document.getElementById('modalRestartBtn');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
    this.resultModal = document.getElementById('resultModal');

    // 거북이 무대
    this.bottomTurtleStage = document.getElementById('bottomTurtleStage');

    // ------------------------------------------------------------------------
    // [2. 하위 엔진 인스턴스 초기화]
    // ------------------------------------------------------------------------
    this.soundEngine = new SoundEngine();
    this.cameraManager = new CameraManager(this.videoElement, this.cameraSelect);
    this.motionTracker = new MotionTracker();
    this.gameEngine = new OceanGameEngine(this.canvasElement, this.soundEngine);

    // 내부 상태 변수
    this.isRunning = false;
    this.animationFrameId = null;
    this.lastFrameTime = 0;
  }

  /**
   * 애플리케이션 초기화 시작 진입점
   */
  async init() {
    try {
      this.gameEngine.showNotification('📷 카메라와 AI 모션 엔진을 준비하고 있습니다...', '⏳', 3000);

      // 1. 캔버스 해상도 화면 비율 동기화
      this.handleResize();
      window.addEventListener('resize', () => this.handleResize());

      // 2. UI 버튼 이벤트 리스너 바인딩
      this.bindEvents();

      // 3. 카메라 스트림 시작 (웹캠 권한 획득)
      await this.cameraManager.init();

      // 4. Google MediaPipe Tasks Vision AI 손동작 인식 모델 로드
      this.gameEngine.showNotification('🤖 손동작 인식 AI 모델을 불러오는 중입니다...', '✋', 2500);
      await this.motionTracker.init();

      // 5. 준비 완료 알림
      this.gameEngine.showNotification('✨ 준비 완료! [게임 시작]을 눌러 바다를 구해주세요!', '🌊', 3500);

      // 6. 메인 60fps 렌더링 루프 가동
      this.isRunning = true;
      this.renderLoop = this.renderLoop.bind(this);
      this.animationFrameId = requestAnimationFrame(this.renderLoop);

    } catch (error) {
      console.error('[OceanApp] 초기화 중 오류 발생:', error);
      this.gameEngine.showNotification(`⚠️ 오류: ${error.message || '카메라나 모델을 불러오지 못했습니다.'}`, '❌', 6000);
    }
  }

  /**
   * 브라우저 창 크기 및 화면 비율에 맞춰 캔버스 크기를 선명하게 리사이즈
   */
  handleResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // 실제 캔버스 내부 버퍼 크기를 화면 픽셀과 1:1로 맞춤
    this.canvasElement.width = width;
    this.canvasElement.height = height;

    if (this.gameEngine && this.gameEngine.initAmbientBubbles) {
      this.gameEngine.initAmbientBubbles();
    }
  }

  /**
   * 모든 UI 버튼 및 드롭다운에 클릭/변경 이벤트 리스너 등록
   */
  bindEvents() {
    // 1. 게임 시작 / 재도전 버튼
    if (this.gameStartBtn) {
      this.gameStartBtn.addEventListener('click', () => {
        this.gameEngine.startGame();
      });
    }

    // 2. 5단계 난이도 선택 드롭다운
    if (this.levelSelect) {
      this.levelSelect.addEventListener('change', (e) => {
        this.gameEngine.setLevel(e.target.value);
      });
    }

    // 3. 카메라 장치 변경 드롭다운
    if (this.cameraSelect) {
      this.cameraSelect.addEventListener('change', async (e) => {
        const deviceId = e.target.value;
        if (deviceId) {
          this.gameEngine.showNotification('📷 선택한 카메라로 전환하고 있습니다...', '🔄', 2000);
          await this.cameraManager.switchCamera(deviceId);
          this.gameEngine.showNotification('✅ 카메라가 성공적으로 변경되었습니다.', '📷', 2000);
        }
      });
    }

    // 4. 거울 모드 (좌우 반전) 토글
    if (this.toggleMirrorBtn) {
      this.toggleMirrorBtn.addEventListener('click', () => {
        const isMirror = this.appContainer.classList.toggle('mirror-active');
        this.toggleMirrorBtn.classList.toggle('active', isMirror);
        this.gameEngine.showNotification(
          isMirror ? '🪞 거울 모드가 켜졌습니다.' : '🪞 일반 화면 모드로 변경되었습니다.',
          '🪞',
          1800
        );
      });
    }

    // 5. OBS 방송용 투명 배경 모드 토글
    if (this.toggleObsBtn) {
      this.toggleObsBtn.addEventListener('click', () => {
        const isObs = this.appContainer.classList.toggle('obs-mode');
        this.toggleObsBtn.classList.toggle('active', isObs);
        if (isObs && this.appContainer.classList.contains('chromakey-mode')) {
          this.appContainer.classList.remove('chromakey-mode');
          if (this.toggleChromaBtn) this.toggleChromaBtn.classList.remove('active');
        }
        this.gameEngine.showNotification(
          isObs ? '🎬 OBS 투명 모드: 웹캠이 투명해졌습니다!' : '🎬 일반 모드로 복구되었습니다.',
          '🎬',
          2200
        );
      });
    }

    // 6. 크로마키(그린스크린) 모드 토글
    if (this.toggleChromaBtn) {
      this.toggleChromaBtn.addEventListener('click', () => {
        const isChroma = this.appContainer.classList.toggle('chromakey-mode');
        this.toggleChromaBtn.classList.toggle('active', isChroma);
        if (isChroma && this.appContainer.classList.contains('obs-mode')) {
          this.appContainer.classList.remove('obs-mode');
          if (this.toggleObsBtn) this.toggleObsBtn.classList.remove('active');
        }
        this.gameEngine.showNotification(
          isChroma ? '🟩 크로마키 모드: 초록색 배경이 켜졌습니다.' : '🟩 크로마키가 꺼졌습니다.',
          '🟩',
          2000
        );
      });
    }

    // 7. 사운드 켜기/끄기 토글
    if (this.toggleSoundBtn) {
      this.toggleSoundBtn.addEventListener('click', () => {
        const isMuted = this.soundEngine.toggleMute();
        this.toggleSoundBtn.classList.toggle('active', !isMuted);

        if (this.soundIcon) this.soundIcon.textContent = isMuted ? '🔇' : '🔊';
        if (this.soundText) this.soundText.textContent = isMuted ? '소리 끔' : '소리 켬';

        this.gameEngine.showNotification(
          isMuted ? '🔇 효과음이 꺼졌습니다.' : '🔊 효과음이 켜졌습니다.',
          isMuted ? '🔇' : '🔊',
          1800
        );
      });
    }

    // 8. 전체화면 토글
    if (this.toggleFullscreenBtn) {
      this.toggleFullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch((err) => {
            console.warn('[OceanApp] 전체화면 실패:', err);
          });
        } else {
          document.exitFullscreen().catch((err) => {
            console.warn('[OceanApp] 전체화면 해제 실패:', err);
          });
        }
      });
    }

    // 9. 안내 가이드 닫기
    if (this.guideCloseBtn && this.guideOverlay) {
      this.guideCloseBtn.addEventListener('click', () => {
        this.guideOverlay.classList.add('hidden');
      });
    }

    // 10. 결과 모달 다시 도전 / 닫기
    if (this.modalRestartBtn) {
      this.modalRestartBtn.addEventListener('click', () => {
        if (this.resultModal) this.resultModal.classList.add('hidden');
        this.gameEngine.startGame();
      });
    }

    if (this.modalCloseBtn) {
      this.modalCloseBtn.addEventListener('click', () => {
        if (this.resultModal) this.resultModal.classList.add('hidden');
      });
    }

    // 11. 거북이 캐릭터 클릭 시 인터랙션 멘트
    if (this.bottomTurtleStage) {
      this.bottomTurtleStage.addEventListener('click', () => {
        const turtleCheers = [
          '안녕 친구야! 바다를 사랑해줘서 고마워! 🐢🌊',
          '플라스틱 빨대는 안돼요! 바다 친구들이 아파해요 🥤❌',
          '손을 힘차게 뻗으면 쓰레기를 쉽게 건질 수 있어! ✋✨',
          '산소 방울을 터뜨리면 내가 더 힘이 나! 🫧💖'
        ];
        const pick = turtleCheers[Math.floor(Math.random() * turtleCheers.length)];
        this.gameEngine.updateTurtleMood('dancing', pick);
        if (this.soundEngine) this.soundEngine.playIceChime();
      });
    }
  }

  /**
   * 60fps 실시간 메인 통합 루프
   */
  renderLoop(timestamp) {
    if (!this.isRunning) return;

    let fingerPoints = [];

    // 1. 비디오가 정상 재생 중이고 크기가 유효할 때 모션 인식 수행
    if (
      this.videoElement &&
      this.videoElement.readyState >= 2 &&
      this.videoElement.videoWidth > 0 &&
      this.motionTracker &&
      this.motionTracker.isReady
    ) {
      // 거울 모드 여부 전달 (캔버스 좌표 보정용)
      const isMirror = this.appContainer.classList.contains('mirror-active');
      const landmarks = this.motionTracker.detectForVideo(this.videoElement, timestamp);

      if (landmarks && landmarks.length > 0) {
        fingerPoints = this.extractFingerPoints(landmarks, isMirror);
      }
    }

    // 2. 게임 엔진에 손끝 좌표를 전달하여 물리/충돌/렌더링 갱신
    if (this.gameEngine) {
      this.gameEngine.updateAndRender(fingerPoints, timestamp);
    }

    // 다음 프레임 요청
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  }

  /**
   * MediaPipe 랜드마크에서 검지 및 엄지 손끝의 캔버스 픽셀 좌표를 추출
   * @param {Array} landmarks - 손동작 인식 결과
   * @param {boolean} isMirror - 거울 모드 여부
   * @returns {Array<{x: number, y: number}>}
   */
  extractFingerPoints(landmarks, isMirror) {
    const points = [];
    const width = this.canvasElement.width;
    const height = this.canvasElement.height;

    // MediaPipe Hand Landmarks:
    // 4: 엄지 손끝 (Thumb Tip)
    // 8: 검지 손끝 (Index Finger Tip)
    // 12: 중지 손끝 (Middle Finger Tip)
    const targetIndices = [8, 4, 12];

    for (const hand of landmarks) {
      for (const idx of targetIndices) {
        const lm = hand[idx];
        if (lm) {
          // 거울 모드일 때 좌표계 반전 보정
          let normX = lm.x;
          if (isMirror) {
            normX = 1.0 - normX;
          }

          points.push({
            x: normX * width,
            y: lm.y * height
          });
        }
      }
    }

    return points;
  }
}

// DOM 로드 완료 후 앱 자동 시작
window.addEventListener('DOMContentLoaded', () => {
  const app = new OceanApp();
  app.init();
});
