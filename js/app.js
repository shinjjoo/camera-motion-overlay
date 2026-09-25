/**
 * ==============================================================================
 * [북극 빙하 지킴이] 메인 애플리케이션 진입점 및 통합 제어기 (AppController)
 * ==============================================================================
 * 파일명: js/app.js
 * 
 * 💡 [교육자 및 개발자를 위한 안내]
 *   - 본 모듈은 카메라 관리(CameraManager), AI 모션 추적(MotionTracker),
 *     Web Audio 사운드 신디사이저(SoundEngine), 물리/게임 렌더링(GameEngine) 모듈을
 *     하나로 통합하여 60fps 실시간 인터랙션 게임을 구동하는 최상위 컨트롤러입니다.
 *   - M2 MacBook, iPad Safari, Windows 11 PC, 교실 빔프로젝터,
 *     그리고 OBS Studio 및 ATEM 방송 스위처 환경에서 완벽하게 동작하도록 설계되었습니다.
 *   - 코딩을 처음 접하는 교육자분들도 쉽게 이해하고 수정할 수 있도록
 *     모든 함수와 흐름에 친절하고 상세한 한글 주석을 작성했습니다.
 * ==============================================================================
 */

// 1. 하위 핵심 모듈 ES import
import { CameraManager } from './camera.js';
import { MotionTracker } from './motion.js';
import { SoundEngine } from './audio.js';
import { GameEngine, GAME_STATE } from './game.js';

/**
 * 북극 빙하 지킴이 애플리케이션 메인 컨트롤러 클래스
 */
export class ArcticGuardianApp {
  /**
   * 애플리케이션 생성자
   * HTML DOM 엘리먼트들을 참조하고 초기 상태 변수를 설정합니다.
   */
  constructor() {
    // --------------------------------------------------------------------------
    // 1. 주요 DOM 엘리먼트 캐싱
    // --------------------------------------------------------------------------
    this.appContainer = document.getElementById('appContainer');
    this.stageContainer = document.getElementById('stageContainer');
    this.webcam = document.getElementById('webcam');
    this.canvas = document.getElementById('gameCanvas');
    this.cameraSelect = document.getElementById('cameraSelect');

    // 기능 토글 버튼들
    this.toggleMirrorBtn = document.getElementById('toggleMirrorBtn');
    this.toggleObsBtn = document.getElementById('toggleObsBtn');
    this.toggleChromaBtn = document.getElementById('toggleChromaBtn');
    this.toggleSoundBtn = document.getElementById('toggleSoundBtn');
    this.soundIcon = document.getElementById('soundIcon');
    this.soundText = document.getElementById('soundText');
    this.toggleFullscreenBtn = document.getElementById('toggleFullscreenBtn');
    this.gameStartBtn = document.getElementById('gameStartBtn');
    this.gameStartText = document.getElementById('gameStartText');

    // 중앙 알림 배너
    this.notificationBanner = document.getElementById('notificationBanner');
    this.notificationIcon = document.getElementById('notificationIcon');
    this.notificationText = document.getElementById('notificationText');

    // 시작 도움말 카드
    this.guideOverlay = document.getElementById('guideOverlay');
    this.guideCloseBtn = document.getElementById('guideCloseBtn');

    // 게임 결과 모달
    this.resultModal = document.getElementById('resultModal');
    this.modalRestartBtn = document.getElementById('modalRestartBtn');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');

    // --------------------------------------------------------------------------
    // 2. 핵심 하위 시스템 인스턴스 변수
    // --------------------------------------------------------------------------
    this.cameraManager = null;
    this.motionTracker = null;
    this.soundEngine = null;
    this.gameEngine = null;

    // --------------------------------------------------------------------------
    // 3. 통합 루프 제어 상태 변수
    // --------------------------------------------------------------------------
    this.isInitialized = false;     // 앱 초기화 완료 여부
    this.isRunning = false;         // 60fps 렌더 루프 실행 여부
    this.animationFrameId = null;   // requestAnimationFrame ID
    this.lastFrameTimestamp = performance.now();

    // 알림 배너 타이머 핸들
    this._notifTimeout = null;

    // --------------------------------------------------------------------------
    // 4. 메서드 바인딩 (이벤트 콜백에서 this 유지)
    // --------------------------------------------------------------------------
    this.renderLoop = this.renderLoop.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * ============================================================================
   * [애플리케이션 초기화: initApp]
   * 웹캠 권한 획득, AI 모델 로드, 오디오 및 게임 엔진 연결, 루프 시작을 순차 진행합니다.
   * ============================================================================
   */
  async initApp() {
    if (this.isInitialized) {
      console.warn('⚠️ [시스템] 이미 애플리케이션이 초기화되었습니다.');
      return;
    }

    console.log('🧊 [시스템] 북극 빙하 지킴이 초기화를 시작합니다...');
    this.showNotification('북극 환경 시스템을 가동하는 중입니다...', '🧊', 5000);

    try {
      // ------------------------------------------------------------------------
      // 1단계: 사운드 신디사이저 엔진 초기화
      // ------------------------------------------------------------------------
      console.log('🔊 [1/4] Web Audio API 사운드 엔진을 준비합니다.');
      this.soundEngine = new SoundEngine();
      // 사운드 토글 버튼과 자동 연동
      this.soundEngine.bindUI({
        button: this.toggleSoundBtn,
        icon: this.soundIcon,
        text: this.soundText
      });

      // ------------------------------------------------------------------------
      // 2단계: 카메라 매니저 초기화 및 웹캠 권한 획득
      // ------------------------------------------------------------------------
      console.log('🎥 [2/4] 웹캠 비디오 장치를 탐색하고 연결합니다.');
      this.showNotification('웹캠 연결을 확인하고 있습니다...', '📷', 3000);

      this.cameraManager = new CameraManager({
        videoElement: this.webcam,
        selectElement: this.cameraSelect,
        preferredWidth: 1280,
        preferredHeight: 720,
        onStreamReady: (info) => {
          console.log(`✅ [카메라] 웹캠 연결 성공 (${info.width}x${info.height})`);
          this.handleResize();
        },
        onError: (errInfo) => {
          console.error('❌ [카메라 오류]', errInfo.message);
          this.showNotification(errInfo.message, '🚫', 6000);
        }
      });

      // 웹캠 스트림 시작 (브라우저 카메라 허용 팝업이 뜹니다)
      await this.cameraManager.start().catch((err) => {
        console.warn('⚠️ [카메라] 초기 웹캠 자동 연결 실패:', err.message);
        // 카메라가 없거나 권한이 거부되어도 안내 배너를 띄우고 앱 구동은 유지
        this.showNotification(
          '카메라 연결에 실패했습니다. 주소창의 자물쇠를 눌러 카메라 권한을 허용해 주세요.',
          '⚠️',
          6000
        );
      });

      // ------------------------------------------------------------------------
      // 3단계: Google MediaPipe Tasks Vision 60fps AI 모션 트래커 초기화
      // ------------------------------------------------------------------------
      console.log('🤖 [3/4] MediaPipe 실시간 손동작 AI 신경망을 로딩합니다.');
      this.showNotification('AI 손동작 인식 엔진을 로드하고 있습니다...', '🤖', 4000);

      this.motionTracker = new MotionTracker({
        maxNumHands: 2,               // 양손 동시 추적 (북극을 지키는 2개의 손!)
        minDetectionConfidence: 0.5,  // 손 인식 최소 신뢰도
        minTrackingConfidence: 0.5,   // 연속 추적 최소 신뢰도
        useGpu: true                  // M2 Mac, iPad, 고성능 GPU 하드웨어 가속
      });

      // AI 모델 다운로드 및 WebAssembly 엔진 초기화
      await this.motionTracker.init((progressMsg) => {
        this.showNotification(progressMsg, '🤖', 2000);
      });

      // ------------------------------------------------------------------------
      // 4단계: 물리 및 게임 그래픽 렌더링 엔진 초기화
      // ------------------------------------------------------------------------
      console.log('🎮 [4/4] 게임 물리 렌더링 엔진을 바인딩합니다.');
      this.gameEngine = new GameEngine({
        canvas: this.canvas,
        soundEngine: this.soundEngine,
        autoLoop: false, // app.js의 통합 렌더 루프에서 단일 제어하기 위해 false 설정
        onPostRender: (ctx, width, height) => {
          // 게임 그래픽(빙하, 방울, 파티클) 렌더링 직후, 그 위에 손끝 수호 링 오버레이 렌더링
          if (this.motionTracker) {
            this.motionTracker.renderGuardianOverlay(ctx, width, height, {
              showSkeleton: true, // 얼음 수정 뼈대 표시
              showRing: true,     // 손끝 이중 회전 얼음빛 수호 링
              showParticles: true // 흩날리는 눈꽃 파티클
            });
          }
        },
        onStateChange: (newState) => {
          this._handleGameStateChange(newState);
        },
        onScoreUpdate: ({ score, health, hitType }) => {
          // 점수나 체력이 바뀔 때 추가 애니메이션이나 효과가 필요하면 연동
        }
      });

      // 게임 엔진 내부 중복 루프가 켜져 있다면 확실히 멈추고 통합 루프로 단일화
      this.gameEngine.stopInternalLoop();

      // ------------------------------------------------------------------------
      // 5단계: 화면 해상도 동기화 및 브라우저 이벤트 리스너 등록
      // ------------------------------------------------------------------------
      this.handleResize();
      window.addEventListener('resize', this.handleResize);
      window.addEventListener('orientationchange', this.handleResize);

      // 전체화면 변경 이벤트 감지 (ESC로 나갈 때 UI 동기화)
      document.addEventListener('fullscreenchange', () => this._syncFullscreenUI());
      document.addEventListener('webkitfullscreenchange', () => this._syncFullscreenUI());

      // 키보드 편의 단축키 등록
      window.addEventListener('keydown', this.handleKeyDown);

      // 하단 툴바 및 UI 버튼 이벤트 바인딩
      this._bindUIEventListeners();

      // ------------------------------------------------------------------------
      // 6단계: 60fps 메인 실시간 통합 렌더 루프 가동!
      // ------------------------------------------------------------------------
      this.isInitialized = true;
      this.isRunning = true;
      this.lastFrameTimestamp = performance.now();
      this.animationFrameId = requestAnimationFrame(this.renderLoop);

      console.log('🎉 [시스템] 북극 빙하 지킴이 모든 시스템이 완벽하게 가동되었습니다!');
      this.showNotification('준비 완료! 양손을 들어 북극곰의 빙하를 지켜주세요! 🐻‍❄️✨', '🚀', 4000);

    } catch (error) {
      console.error('❌ [초기화 실패] 시스템 구동 중 치명적 오류:', error);
      this.showNotification(
        `초기화 중 오류가 발생했습니다: ${error.message || '네트워크 상태를 확인해 주세요.'}`,
        '❌',
        8000
      );
    }
  }

  /**
   * ============================================================================
   * [메인 실시간 통합 렌더 루프: renderLoop]
   * requestAnimationFrame을 통해 60fps로 매 프레임:
   *   1. 비디오 프레임 확인
   *   2. AI 손동작 인식(MediaPipe HandLandmarker)
   *   3. 정제된 손끝 좌표 추출
   *   4. 물리 충돌 판정 및 게임 그래픽 렌더링
   *   5. 손끝 '얼음빛 수호 링' 및 눈꽃 파티클 궤적 오버레이 합성
   * ============================================================================
   * @param {number} timestamp - requestAnimationFrame 타임스탬프
   */
  renderLoop(timestamp) {
    if (!this.isRunning) return;

    try {
      const video = this.webcam;
      const isVideoReady = video && video.readyState >= 2 && !video.paused;

      let fingerPoints = [];

      // 1. 비디오가 재생 중이고 새로운 프레임이 있으면 AI 손동작 감지
      if (isVideoReady && this.motionTracker && this.motionTracker.isModelLoaded) {
        // 단일 프레임 감지 실행
        this.motionTracker.detect(video, timestamp);

        // 캔버스 크기 기준 픽셀화된 검지/엄지 손끝 인터랙션 포인트 추출
        fingerPoints = this.motionTracker.getFingerPoints(this.canvas.width, this.canvas.height);
      }

      // 2. 게임 엔진 물리 시뮬레이션 및 그래픽 렌더링 일괄 구동
      // (내부에서 onPostRender를 통해 motionTracker.renderGuardianOverlay가 자동 합성됩니다)
      if (this.gameEngine) {
        this.gameEngine.updateAndRender(fingerPoints, timestamp);
      }

    } catch (err) {
      console.warn('⚠️ [렌더 루프] 프레임 처리 중 일시적 오류:', err);
    }

    // 다음 화면 주사율에 맞춰 자기 자신을 재호출 (60fps 유지)
    this.animationFrameId = requestAnimationFrame(this.renderLoop);
  }

  /**
   * ============================================================================
   * [반응형 캔버스 리사이즈: handleResize]
   * 브라우저 창 크기 변화, 모바일 회전, 전체화면 전환 시
   * 캔버스 픽셀 버퍼(canvas.width, canvas.height)를 실제 화면 크기와
   * 기기 픽셀 비율(DevicePixelRatio)에 맞춰 선명하게 리사이즈합니다.
   * ============================================================================
   */
  handleResize() {
    if (!this.canvas || !this.stageContainer) return;

    // 실제 화면에 표시되는 스테이지 컨테이너의 CSS 픽셀 너비/높이
    const clientWidth = this.stageContainer.clientWidth || window.innerWidth;
    const clientHeight = this.stageContainer.clientHeight || window.innerHeight;

    if (clientWidth <= 0 || clientHeight <= 0) return;

    // 고해상도 레티나(Retina) 디스플레이 지원 (최대 2배수로 제한하여 GPU 과부하 방지)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.round(clientWidth * dpr);
    const targetHeight = Math.round(clientHeight * dpr);

    // 캔버스 버퍼 해상도 동기화
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
      console.log(`📐 [리사이즈] 캔버스 버퍼 조정: ${targetWidth}x${targetHeight} (DPR: ${dpr})`);

      // 게임 엔진 내부 해상도 갱신
      if (this.gameEngine) {
        this.gameEngine.resize(targetWidth, targetHeight);
      }
    }
  }

  /**
   * ============================================================================
   * [UI 버튼 및 인터랙션 이벤트 리스너 등록]
   * 하단 툴바의 모든 버튼(게임 시작, 거울 모드, OBS, 크로마키, 사운드, 전체화면)과
   * 카메라 선택 셀렉트, 모달 창 이벤트들을 빈틈없이 바인딩합니다.
   * ============================================================================
   * @private
   */
  _bindUIEventListeners() {
    // --------------------------------------------------------------------------
    // 1. 게임 시작 / 일시정지 / 다시하기 버튼 (#gameStartBtn)
    // --------------------------------------------------------------------------
    if (this.gameStartBtn) {
      this.gameStartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this._handleGameStartButton();
      });
    }

    // --------------------------------------------------------------------------
    // 2. 좌우 반전 거울 모드 토글 버튼 (#toggleMirrorBtn)
    // --------------------------------------------------------------------------
    if (this.toggleMirrorBtn) {
      this.toggleMirrorBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleMirrorMode();
      });
    }

    // --------------------------------------------------------------------------
    // 3. OBS Studio 투명 브라우저 소스 모드 토글 버튼 (#toggleObsBtn)
    // --------------------------------------------------------------------------
    if (this.toggleObsBtn) {
      this.toggleObsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleObsMode();
      });
    }

    // --------------------------------------------------------------------------
    // 4. ATEM 크로마키(그린스크린) 모드 토글 버튼 (#toggleChromaBtn)
    // --------------------------------------------------------------------------
    if (this.toggleChromaBtn) {
      this.toggleChromaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleChromaMode();
      });
    }

    // --------------------------------------------------------------------------
    // 5. 전체화면 전환 토글 버튼 (#toggleFullscreenBtn)
    // --------------------------------------------------------------------------
    if (this.toggleFullscreenBtn) {
      this.toggleFullscreenBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleFullscreen();
      });
    }

    // --------------------------------------------------------------------------
    // 6. 카메라 장치 선택 드롭다운 (#cameraSelect)
    // --------------------------------------------------------------------------
    if (this.cameraSelect) {
      this.cameraSelect.addEventListener('change', () => {
        const selectedLabel = this.cameraSelect.options[this.cameraSelect.selectedIndex]?.text || '새 카메라';
        this.showNotification(`카메라를 "${selectedLabel}"(으)로 변경 중입니다...`, '📷', 2500);
      });
    }

    // --------------------------------------------------------------------------
    // 7. 시작 도움말 닫기 버튼 (#guideCloseBtn)
    // --------------------------------------------------------------------------
    if (this.guideCloseBtn && this.guideOverlay) {
      this.guideCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.guideOverlay.classList.add('hidden');
      });
    }

    // --------------------------------------------------------------------------
    // 8. 게임 결과 모달 내 액션 버튼들
    // --------------------------------------------------------------------------
    if (this.modalRestartBtn) {
      this.modalRestartBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.gameEngine) {
          this.gameEngine.hideResultModal();
          this.gameEngine.startWithCountdown();
        }
      });
    }

    if (this.modalCloseBtn) {
      this.modalCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.gameEngine) {
          this.gameEngine.hideResultModal();
          this.gameEngine.reset();
        }
      });
    }
  }

  /**
   * 게임 시작 버튼 클릭 핸들러
   * @private
   */
  _handleGameStartButton() {
    if (!this.gameEngine) return;

    // 사운드 엔진 활성화 (사용자 제스처 보장)
    if (this.soundEngine) {
      this.soundEngine.init();
    }

    const state = this.gameEngine.state;

    if (state === GAME_STATE.IDLE || state === GAME_STATE.VICTORY || state === GAME_STATE.GAME_OVER) {
      // 대기 또는 종료 상태에서는 3초 카운트다운 후 시작
      this.gameEngine.startWithCountdown();
    } else if (state === GAME_STATE.PLAYING) {
      // 플레이 중이면 일시정지
      this.gameEngine.pause();
    } else if (state === GAME_STATE.PAUSED) {
      // 일시정지 상태이면 계속 진행
      this.gameEngine.resume();
    }
  }

  /**
   * 게임 상태 변경 시 UI 텍스트 및 버튼 스타일 동기화
   * @private
   * @param {string} newState 
   */
  _handleGameStateChange(newState) {
    if (!this.gameStartBtn || !this.gameStartText) return;

    switch (newState) {
      case GAME_STATE.PLAYING:
        this.gameStartText.textContent = '일시 정지';
        this.gameStartBtn.classList.remove('btn-primary');
        this.gameStartBtn.classList.add('btn-secondary');
        break;

      case GAME_STATE.PAUSED:
        this.gameStartText.textContent = '계속 하기';
        this.gameStartBtn.classList.remove('btn-secondary');
        this.gameStartBtn.classList.add('btn-primary');
        break;

      case GAME_STATE.VICTORY:
      case GAME_STATE.GAME_OVER:
        this.gameStartText.textContent = '다시 도전';
        this.gameStartBtn.classList.remove('btn-secondary');
        this.gameStartBtn.classList.add('btn-primary');
        break;

      case GAME_STATE.IDLE:
      default:
        this.gameStartText.textContent = '게임 시작';
        this.gameStartBtn.classList.remove('btn-secondary');
        this.gameStartBtn.classList.add('btn-primary');
        break;
    }
  }

  /**
   * ============================================================================
   * [기능 1: 거울 모드 (Mirror Mode) 토글]
   * #appContainer의 'mirror-active' 클래스를 토글하여
   * 사용자가 화면을 거울처럼 직관적으로 볼 수 있게 합니다.
   * ============================================================================
   */
  toggleMirrorMode() {
    if (!this.appContainer) return;

    const isNowMirrored = this.appContainer.classList.toggle('mirror-active');

    // 버튼 활성 상태 갱신
    if (this.toggleMirrorBtn) {
      this.toggleMirrorBtn.classList.toggle('active', isNowMirrored);
      this.toggleMirrorBtn.setAttribute('aria-pressed', String(isNowMirrored));
    }

    const message = isNowMirrored
      ? '🪞 거울 모드가 켜졌습니다. (내 모습이 거울처럼 좌우 반전됩니다)'
      : '📷 일반 카메라 모드로 전환되었습니다. (실제 카메라 시야)';

    console.log(`[모드 변경] ${message}`);
    this.showNotification(message, '🪞', 2000);
  }

  /**
   * ============================================================================
   * [기능 2: OBS Studio 투명 방송 모드 토글]
   * 웹캠 배경을 완전 투명하게 만들고 오버레이 그래픽만 남겨
   * OBS 브라우저 소스에서 스트리밍 화면 위에 합성할 수 있도록 합니다.
   * ============================================================================
   */
  toggleObsMode() {
    if (!this.appContainer) return;

    // 만약 크로마키 모드가 켜져 있었다면 먼저 해제 (상호 배타적)
    if (this.appContainer.classList.contains('chromakey-mode')) {
      this.appContainer.classList.remove('chromakey-mode');
      if (this.toggleChromaBtn) {
        this.toggleChromaBtn.classList.remove('active');
        this.toggleChromaBtn.setAttribute('aria-pressed', 'false');
      }
    }

    const isNowObs = this.appContainer.classList.toggle('obs-mode');

    if (this.toggleObsBtn) {
      this.toggleObsBtn.classList.toggle('active', isNowObs);
      this.toggleObsBtn.setAttribute('aria-pressed', String(isNowObs));
    }

    const message = isNowObs
      ? '🎬 OBS 투명 오버레이 모드 활성화 (웹캠 배경이 투명해졌습니다)'
      : '🎬 OBS 투명 모드가 해제되었습니다. (일반 배경 복원)';

    console.log(`[모드 변경] ${message}`);
    this.showNotification(message, '🎬', 2500);
  }

  /**
   * ============================================================================
   * [기능 3: ATEM 크로마키(그린스크린) 모드 토글]
   * 배경을 순수 단색 형광 초록색(#00ff00)으로 변경하여
   * ATEM 스위처나 영상 편집기에서 크로마키 키잉을 손쉽게 수행할 수 있도록 합니다.
   * ============================================================================
   */
  toggleChromaMode() {
    if (!this.appContainer) return;

    // 만약 OBS 투명 모드가 켜져 있었다면 먼저 해제
    if (this.appContainer.classList.contains('obs-mode')) {
      this.appContainer.classList.remove('obs-mode');
      if (this.toggleObsBtn) {
        this.toggleObsBtn.classList.remove('active');
        this.toggleObsBtn.setAttribute('aria-pressed', 'false');
      }
    }

    const isNowChroma = this.appContainer.classList.toggle('chromakey-mode');

    if (this.toggleChromaBtn) {
      this.toggleChromaBtn.classList.toggle('active', isNowChroma);
      this.toggleChromaBtn.setAttribute('aria-pressed', String(isNowChroma));
    }

    const message = isNowChroma
      ? '🟩 크로마키(그린스크린) 모드 활성화 (ATEM 스위처 키잉 가능)'
      : '🟩 크로마키 모드가 해제되었습니다.';

    console.log(`[모드 변경] ${message}`);
    this.showNotification(message, '🟩', 2500);
  }

  /**
   * ============================================================================
   * [기능 4: 전체화면 모드 (Fullscreen) 토글]
   * 교실 대형 프로젝터나 모니터 전체화면으로 전환하여 몰입도를 극대화합니다.
   * ============================================================================
   */
  async toggleFullscreen() {
    try {
      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );

      if (!isFullscreen) {
        // 전체화면 진입
        const targetElement = this.appContainer || document.documentElement;
        if (targetElement.requestFullscreen) {
          await targetElement.requestFullscreen();
        } else if (targetElement.webkitRequestFullscreen) {
          await targetElement.webkitRequestFullscreen();
        } else if (targetElement.msRequestFullscreen) {
          await targetElement.msRequestFullscreen();
        }
        this.showNotification('⛶ 전체화면으로 전환되었습니다. (ESC로 종료)', '⛶', 2000);
      } else {
        // 전체화면 해제
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn('⚠️ [전체화면 오류]', err);
    }
  }

  /**
   * 전체화면 상태 변화에 따른 UI 버튼 동기화
   * @private
   */
  _syncFullscreenUI() {
    const isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement
    );

    if (this.toggleFullscreenBtn) {
      this.toggleFullscreenBtn.classList.toggle('active', isFullscreen);
      this.toggleFullscreenBtn.setAttribute('aria-pressed', String(isFullscreen));
    }

    // 해상도 재조정
    setTimeout(() => this.handleResize(), 150);
  }

  /**
   * ============================================================================
   * [기능 5: 교육 현장 편의를 위한 키보드 단축키]
   * 강사나 교육자가 무선 리모컨/키보드로 편리하게 조작할 수 있도록 지원합니다.
   * ============================================================================
   * @param {KeyboardEvent} e 
   */
  handleKeyDown(e) {
    // 입력 폼에 포커스가 있는 경우 단축키 무시
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      return;
    }

    switch (e.code) {
      case 'Space': // 스페이스바: 게임 시작 / 일시정지
        e.preventDefault();
        this._handleGameStartButton();
        break;

      case 'KeyM': // M: 거울 모드 토글
        e.preventDefault();
        this.toggleMirrorMode();
        break;

      case 'KeyO': // O: OBS 투명 모드 토글
        e.preventDefault();
        this.toggleObsMode();
        break;

      case 'KeyC': // C: 크로마키 그린스크린 모드 토글
        e.preventDefault();
        this.toggleChromaMode();
        break;

      case 'KeyS': // S: 사운드 On/Off 토글
        e.preventDefault();
        if (this.soundEngine) {
          this.soundEngine.init();
          this.soundEngine.toggleMute();
          // UI 버튼 상태 갱신은 bindUI에서 자동 처리되거나 직접 호출
          const isMuted = this.soundEngine.isMuted;
          if (this.soundIcon) this.soundIcon.textContent = isMuted ? '🔇' : '🔊';
          if (this.soundText) this.soundText.textContent = isMuted ? '사운드 OFF' : '사운드 ON';
          if (this.toggleSoundBtn) this.toggleSoundBtn.classList.toggle('active', !isMuted);
          this.showNotification(isMuted ? '🔇 사운드 음소거' : '🔊 사운드 켜짐', isMuted ? '🔇' : '🔊', 1500);
        }
        break;

      case 'KeyF': // F: 전체화면 토글
        e.preventDefault();
        this.toggleFullscreen();
        break;

      case 'Escape': // ESC: 도움말이나 결과 모달 닫기
        if (this.guideOverlay && !this.guideOverlay.classList.contains('hidden')) {
          this.guideOverlay.classList.add('hidden');
        } else if (this.resultModal && !this.resultModal.classList.contains('hidden')) {
          if (this.gameEngine) this.gameEngine.hideResultModal();
        }
        break;

      default:
        break;
    }
  }

  /**
   * ============================================================================
   * [알림 토스트 배너: showNotification]
   * 화면 중앙 상단에 친절한 한글 안내 메시지와 이모지를 표시합니다.
   * ============================================================================
   * @param {string} text - 표시할 메시지
   * @param {string} [icon='✨'] - 아이콘 이모지
   * @param {number} [duration=2500] - 노출 시간 (밀리초)
   */
  showNotification(text, icon = '✨', duration = 2500) {
    if (!this.notificationBanner) return;

    if (this.notificationIcon) this.notificationIcon.textContent = icon;
    if (this.notificationText) this.notificationText.textContent = text;

    this.notificationBanner.classList.remove('hidden');

    if (this._notifTimeout) clearTimeout(this._notifTimeout);
    this._notifTimeout = setTimeout(() => {
      if (this.notificationBanner) {
        this.notificationBanner.classList.add('hidden');
      }
    }, duration);
  }

  /**
   * ============================================================================
   * [자원 해제 및 종료: destroy]
   * 페이지 전환이나 새로고침 시 메모리 누수 방지
   * ============================================================================
   */
  destroy() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);

    if (this.cameraManager) this.cameraManager.destroy();
    if (this.motionTracker) this.motionTracker.destroy();
    if (this.gameEngine) this.gameEngine.destroy();

    console.log('🧹 [시스템] ArcticGuardianApp 자원이 완전히 해제되었습니다.');
  }
}

/**
 * ==============================================================================
 * [애플리케이션 자동 진입점]
 * DOM 트리 로딩이 완료되면 즉시 ArcticGuardianApp 인스턴스를 생성하고 시작합니다.
 * ==============================================================================
 */
document.addEventListener('DOMContentLoaded', () => {
  const app = new ArcticGuardianApp();
  // 전역 디버깅 및 브라우저 콘솔 테스트를 위해 window 객체에 등록
  window.__arcticApp = app;

  // 앱 비동기 초기화 시작
  app.initApp().catch((err) => {
    console.error('❌ [앱 시작 치명적 오류]', err);
  });
});

// ES 모듈 기본 내보내기
export default ArcticGuardianApp;
