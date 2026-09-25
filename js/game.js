/**
 * ==============================================================================
 * [북극 빙하 지킴이] 메인 게임 및 물리 렌더링 엔진 (GameEngine)
 * ==============================================================================
 * 파일명: js/game.js
 * 
 * 💡 [교육자 및 개발자를 위한 안내]
 *   - 본 모듈은 HTML5 Canvas 위에 떨어지는 온실가스(CO2, CH4), 얼음 회복 결정(ICE),
 *     유독 매연 폭탄(BOMB)을 물리 법칙(중력, 좌우 부유 모션)에 따라 움직이고,
 *   - 카메라 손동작 추적(MotionTracker)에서 추출된 사용자의 손끝 좌표와의
 *     충돌을 실시간으로 감지하여 화려한 파티클 폭발과 점수/체력 시스템을 구동합니다.
 *   - 바닥에는 북극 빙하가 찰랑이는 파도와 함께 그려지며, 체력에 따라 빙하가 녹아내리고
 *     금이 가는 생생한 시각적 효과를 제공합니다.
 *   - M2 Mac, iPad, 일반 PC 등 다양한 기기에서 60fps로 부드럽게 구동되도록 최적화되었습니다.
 * ==============================================================================
 */

import { SoundEngine } from './audio.js';

/**
 * 게임 상태를 나타내는 열거형(Enum) 상수
 */
export const GAME_STATE = {
  IDLE: 'IDLE',           // 게임 대기 상태 (시작 전)
  COUNTDOWN: 'COUNTDOWN', // 3, 2, 1 카운트다운 진행 중
  PLAYING: 'PLAYING',     // 60초 게임 진행 중
  PAUSED: 'PAUSED',       // 일시 정지 상태
  VICTORY: 'VICTORY',     // 60초 생존 승리 (지구 환경 수호자!)
  GAME_OVER: 'GAME_OVER'  // 빙하 체력 0% 도달 (패배)
};

/**
 * 하늘에서 떨어지는 방울(오브젝트) 4가지 유형 상수 정의
 */
export const BUBBLE_TYPES = {
  CO2: {
    type: 'CO2',
    name: '이산화탄소',
    label: 'CO₂',
    subLabel: '+10kg',
    radius: 36,
    score: 10,           // 터뜨렸을 때 얻는 탄소 감축량 (+10kg)
    damage: 5,           // 바닥 빙하에 닿았을 때 빙하 손상도 (-5%)
    heal: 0,
    baseColor: 'rgba(120, 140, 165, 0.85)',
    borderColor: '#94a3b8',
    glowColor: 'rgba(148, 163, 184, 0.6)',
    speedMin: 1.8,
    speedMax: 2.8,
    spawnWeight: 45      // 스폰 확률 가중치 (45%)
  },
  CH4: {
    type: 'CH4',
    name: '메탄가스',
    label: 'CH₄',
    subLabel: '+25kg',
    radius: 38,
    score: 25,           // 터뜨렸을 때 얻는 탄소 감축량 (+25kg)
    damage: 7,           // 바닥 빙하에 닿았을 때 빙하 손상도 (-7%)
    heal: 0,
    baseColor: 'rgba(34, 197, 94, 0.85)',
    borderColor: '#4ade80',
    glowColor: 'rgba(74, 222, 128, 0.65)',
    speedMin: 2.2,
    speedMax: 3.4,
    spawnWeight: 25      // 스폰 확률 가중치 (25%)
  },
  ICE: {
    type: 'ICE',
    name: '눈꽃 결정',
    label: '❄️',
    subLabel: '+15%',
    radius: 34,
    score: 0,
    damage: 0,
    heal: 15,            // 손끝으로 터치 시 빙하 체력 회복 (+15%)
    baseColor: 'rgba(0, 242, 254, 0.85)',
    borderColor: '#38bdf8',
    glowColor: 'rgba(0, 242, 254, 0.8)',
    speedMin: 1.5,
    speedMax: 2.4,
    spawnWeight: 18      // 스폰 확률 가중치 (18%)
  },
  BOMB: {
    type: 'BOMB',
    name: '유독 매연 폭탄',
    label: '☠️',
    subLabel: '-25% 위험!',
    radius: 40,
    score: 0,
    damage: 25,          // 건드리면 즉시 폭발하여 빙하 체력 대폭 감소 (-25%)
    heal: 0,
    baseColor: 'rgba(239, 68, 68, 0.85)',
    borderColor: '#f87171',
    glowColor: 'rgba(239, 68, 68, 0.85)',
    speedMin: 2.0,
    speedMax: 3.2,
    spawnWeight: 12      // 스폰 확률 가중치 (12%)
  }
};

/**
 * 북극 빙하 지킴이 메인 게임 엔진 클래스
 */
export class GameEngine {
  /**
   * 게임 엔진 생성자
   * @param {Object} [options={}] 설정 옵션
   * @param {HTMLCanvasElement|string} [options.canvas] - 게임이 그려질 canvas 엘리먼트
   * @param {SoundEngine} [options.soundEngine] - Web Audio API 사운드 엔진 인스턴스
   * @param {Function} [options.onStateChange] - 게임 상태 변경 시 호출되는 콜백
   * @param {Function} [options.onScoreUpdate] - 점수/체력 변경 시 호출되는 콜백
   */
  constructor(options = {}) {
    // 1. 캔버스 엘리먼트 및 2D 렌더링 컨텍스트 획득
    if (typeof options.canvas === 'string') {
      this.canvas = document.querySelector(options.canvas);
    } else {
      this.canvas = options.canvas || document.getElementById('gameCanvas');
    }

    if (!this.canvas) {
      throw new Error('GameEngine: canvas 엘리먼트를 찾을 수 없습니다.');
    }
    this.ctx = this.canvas.getContext('2d');

    // 2. 사운드 신디사이저 엔진 연결 (전달되지 않으면 자체 생성)
    this.sound = options.soundEngine || new SoundEngine();

    // 3. 콜백 함수 설정
    this.onStateChange = options.onStateChange || null;
    this.onScoreUpdate = options.onScoreUpdate || null;
    this.onPostRender = options.onPostRender || null;

    // 4. 거울 모드 감지용 타깃 컨테이너
    this.appContainer = document.getElementById('appContainer');

    // 5. DOM UI 요소들 캐싱
    this._cacheDOMElements();

    // 6. 게임 핵심 상태 변수 초기화
    this.state = GAME_STATE.IDLE;
    this.gameDuration = 60;        // 정규 플레이 시간: 60초
    this.timeLeft = this.gameDuration;
    this.glacierHealth = 100;     // 빙하 보존율 (100% 시작, 0%가 되면 게임 오버)
    this.carbonScore = 0;         // 총 탄소 감축량 (kg CO2)

    // 카운트다운 타이머 변수
    this.countdownSeconds = 3;
    this.countdownTimerId = null;

    // 7. 게임 내 물리 오브젝트 보관 배열
    this.bubbles = [];            // 떨어지는 방울 목록
    this.particles = [];          // 터질 때 사방으로 튀는 파편 파티클
    this.floatingTexts = [];      // 화면 위로 스르륵 떠오르는 점수 텍스트 (+10kg, +15% 등)
    this.glacierMeltEffects = []; // 빙하에 온실가스가 닿을 때 피어오르는 수증기 파티클

    // 8. 스폰 제어 타이머
    this.spawnTimer = 0;
    this.spawnInterval = 1100;    // 초기 스폰 간격 (밀리초 단위, 시간이 갈수록 점진적 단축)
    this.lastFrameTime = performance.now();

    // 9. 손동작 인식 손끝 좌표 버퍼
    // [{ x, y, rawX, rawY, isPinching }] 형태
    this.trackedFingerPoints = [];

    // 10. 특수 시각 효과 제어 변수
    this.shakeIntensity = 0;      // 폭탄 피격 시 화면 흔들림 강도 (픽셀)
    this.glacierWaveTime = 0;     // 바닥 빙하 출렁임 삼각함수 시간 변수

    // 11. requestAnimationFrame 메인 루프 ID
    this.animationFrameId = null;

    // 12. 브라우저 창 크기 변화 대응
    this._resizeHandler = this._resizeHandler.bind(this);
    window.addEventListener('resize', this._resizeHandler);
    this.resize();

    // 13. 메인 루프 함수 바인딩
    this._gameLoop = this._gameLoop.bind(this);

    // 14. UI 버튼 이벤트 리스너 바인딩
    this._bindDefaultUI();

    // 초기 HUD 표시 동기화
    this.updateHUD();

    // 15. 자동 애니메이션 루프 제어 (options.autoLoop 기본값: true)
    this.autoLoop = options.autoLoop !== false;
    if (this.autoLoop) {
      this.animationFrameId = requestAnimationFrame(this._gameLoop);
    }
    console.log(`🧊 [게임 엔진] GameEngine 준비 완료! (내부 루프: ${this.autoLoop ? '활성' : '수동 제어'})`);
  }

  /**
   * GameEngine 내부 requestAnimationFrame 루프를 중지합니다.
   * app.js의 통합 메인 루프에서 updateAndRender를 단독 제어할 때 호출합니다.
   */
  stopInternalLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.autoLoop = false;
  }

  /**
   * GameEngine 내부 requestAnimationFrame 루프를 시작합니다.
   */
  startInternalLoop() {
    if (!this.animationFrameId) {
      this.autoLoop = true;
      this.lastFrameTime = performance.now();
      this.animationFrameId = requestAnimationFrame(this._gameLoop);
    }
  }

  /**
   * --------------------------------------------------------------------------
   * 1. DOM 요소 캐싱 및 UI 바인딩
   * --------------------------------------------------------------------------
   */

  /**
   * index.html에 정의된 주요 HUD 및 모달 요소들을 캐싱합니다.
   * @private
   */
  _cacheDOMElements() {
    // 상단 HUD 지표
    this.timerDisplay = document.getElementById('timerDisplay');
    this.glacierHealthBar = document.getElementById('glacierHealthBar');
    this.glacierHealthText = document.getElementById('glacierHealthText');
    this.bearStatusIcon = document.getElementById('bearStatusIcon');
    this.carbonScoreDisplay = document.getElementById('carbonScore');

    // 중앙 알림 배너
    this.notificationBanner = document.getElementById('notificationBanner');
    this.notificationIcon = document.getElementById('notificationIcon');
    this.notificationText = document.getElementById('notificationText');

    // 결과 성적표 모달
    this.resultModal = document.getElementById('resultModal');
    this.resultEmblem = document.getElementById('resultEmblem');
    this.resultRankBadge = document.getElementById('resultRankBadge');
    this.modalTitle = document.getElementById('modalTitle');
    this.modalSubtitle = document.getElementById('modalSubtitle');
    this.finalScore = document.getElementById('finalScore');
    this.finalHealth = document.getElementById('finalHealth');
    this.finalBearStatus = document.getElementById('finalBearStatus');
    this.finalTitle = document.getElementById('finalTitle');
    this.finalEducateMessage = document.getElementById('finalEducateMessage');
    this.modalRestartBtn = document.getElementById('modalRestartBtn');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');

    // 툴바 제어 버튼
    this.gameStartBtn = document.getElementById('gameStartBtn');
    this.gameStartText = document.getElementById('gameStartText');
    this.toggleSoundBtn = document.getElementById('toggleSoundBtn');
    this.soundIcon = document.getElementById('soundIcon');
    this.soundText = document.getElementById('soundText');

    // 도움말 안내창
    this.guideOverlay = document.getElementById('guideOverlay');
    this.guideCloseBtn = document.getElementById('guideCloseBtn');
  }

  /**
   * 기본 UI 버튼 클릭 이벤트를 등록합니다.
   * @private
   */
  _bindDefaultUI() {
    // 1. 게임 시작 / 일시정지 / 재개 버튼
    if (this.gameStartBtn) {
      this.gameStartBtn.addEventListener('click', () => {
        this.sound.init(); // 사용자 클릭 시 Web Audio API 활성화
        if (this.state === GAME_STATE.IDLE || this.state === GAME_STATE.VICTORY || this.state === GAME_STATE.GAME_OVER) {
          this.startWithCountdown();
        } else if (this.state === GAME_STATE.PLAYING) {
          this.pause();
        } else if (this.state === GAME_STATE.PAUSED) {
          this.resume();
        }
      });
    }

    // 2. 모달 내 '다시 도전하기' 버튼
    if (this.modalRestartBtn) {
      this.modalRestartBtn.addEventListener('click', () => {
        this.sound.init();
        this.hideResultModal();
        this.startWithCountdown();
      });
    }

    // 3. 모달 내 '결과 닫기' 버튼
    if (this.modalCloseBtn) {
      this.modalCloseBtn.addEventListener('click', () => {
        this.hideResultModal();
        this.reset();
      });
    }

    // 4. 시작 도움말 닫기 버튼
    if (this.guideCloseBtn && this.guideOverlay) {
      this.guideCloseBtn.addEventListener('click', () => {
        this.guideOverlay.classList.add('hidden');
      });
    }

    // 5. 사운드 온/오프 버튼을 SoundEngine과 자동 바인딩
    if (this.toggleSoundBtn && this.sound) {
      this.sound.bindUI({
        button: this.toggleSoundBtn,
        icon: this.soundIcon,
        text: this.soundText
      });
    }
  }

  /**
   * --------------------------------------------------------------------------
   * 2. 화면 해상도 동기화 및 거울 모드 감지
   * --------------------------------------------------------------------------
   */

  /**
   * 창 크기가 바뀌거나 카메라 해상도가 설정될 때 캔버스의 내부 렌더링 버퍼 크기를
   * 부모 스테이지 크기와 1:1로 정확하게 일치시킵니다.
   */
  resize(width, height) {
    if (!this.canvas) return;

    const parent = this.canvas.parentElement;
    const targetWidth = width || (parent ? parent.clientWidth : 1280) || 1280;
    const targetHeight = height || (parent ? parent.clientHeight : 720) || 720;

    // 캔버스 버퍼 해상도 설정
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
      console.log(`📐 [게임 엔진] 캔버스 해상도 조정: ${targetWidth}x${targetHeight}`);
    }
  }

  /**
   * 브라우저 창 리사이즈 이벤트 리스너
   * @private
   */
  _resizeHandler() {
    this.resize();
  }

  /**
   * 현재 거울 모드(Mirror Mode - 좌우 반전)가 켜져 있는지 확인합니다.
   * styles.css에 의해 .mirror-active일 때 canvas에 transform: scaleX(-1)이 적용되어 있습니다.
   * @returns {boolean}
   */
  isMirrored() {
    return this.appContainer ? this.appContainer.classList.contains('mirror-active') : true;
  }

  /**
   * --------------------------------------------------------------------------
   * 3. 게임 라이프사이클 제어 (시작, 카운트다운, 일시정지, 종료)
   * --------------------------------------------------------------------------
   */

  /**
   * 3초 카운트다운(3, 2, 1, GO!)을 진행한 후 게임을 본격 시작합니다.
   */
  startWithCountdown() {
    this.reset();
    this.setState(GAME_STATE.COUNTDOWN);

    // 도움말 창이 떠 있다면 닫기
    if (this.guideOverlay) {
      this.guideOverlay.classList.add('hidden');
    }

    // 모달 닫기
    this.hideResultModal();

    this.countdownSeconds = 3;
    this._runCountdownStep();
  }

  /**
   * 카운트다운 1초 단위 재귀 실행
   * @private
   */
  _runCountdownStep() {
    if (this.state !== GAME_STATE.COUNTDOWN) return;

    if (this.countdownSeconds > 0) {
      // 3, 2, 1 일반 비프음
      this.sound.playBeep(false);
      this.showNotification(`${this.countdownSeconds}초 후 시작됩니다! 양손을 들어 준비하세요!`, '⏳', 900);

      if (this.gameStartText) {
        this.gameStartText.textContent = `준비: ${this.countdownSeconds}...`;
      }

      this.countdownSeconds--;
      this.countdownTimerId = setTimeout(() => this._runCountdownStep(), 1000);
    } else {
      // GO! 높은 시작 비프음
      this.sound.playBeep(true);
      this.showNotification('🚀 게임 시작! 북극곰의 빙하를 지켜주세요!', '❄️', 2000);

      this.setState(GAME_STATE.PLAYING);
      this.lastFrameTime = performance.now();

      if (this.gameStartText) {
        this.gameStartText.textContent = '일시 정지';
      }
      if (this.gameStartBtn) {
        this.gameStartBtn.classList.remove('btn-primary');
        this.gameStartBtn.classList.add('btn-secondary');
      }
    }
  }

  /**
   * 게임 즉시 시작 (카운트다운 건너뛰기)
   */
  start() {
    this.reset();
    this.setState(GAME_STATE.PLAYING);
    this.lastFrameTime = performance.now();
    if (this.gameStartText) this.gameStartText.textContent = '일시 정지';
  }

  /**
   * 게임 일시 정지
   */
  pause() {
    if (this.state !== GAME_STATE.PLAYING) return;
    this.setState(GAME_STATE.PAUSED);
    this.showNotification('게임을 일시정지했습니다.', '⏸️', 2000);
    if (this.gameStartText) this.gameStartText.textContent = '계속 하기';
    if (this.gameStartBtn) {
      this.gameStartBtn.classList.remove('btn-secondary');
      this.gameStartBtn.classList.add('btn-primary');
    }
  }

  /**
   * 일시 정지된 게임 재개
   */
  resume() {
    if (this.state !== GAME_STATE.PAUSED) return;
    this.setState(GAME_STATE.PLAYING);
    this.lastFrameTime = performance.now();
    this.showNotification('게임을 다시 시작합니다!', '▶️', 1500);
    if (this.gameStartText) this.gameStartText.textContent = '일시 정지';
    if (this.gameStartBtn) {
      this.gameStartBtn.classList.remove('btn-primary');
      this.gameStartBtn.classList.add('btn-secondary');
    }
  }

  /**
   * 게임 상태를 초기화하고 모든 방울과 이펙트를 청소합니다.
   */
  reset() {
    if (this.countdownTimerId) {
      clearTimeout(this.countdownTimerId);
      this.countdownTimerId = null;
    }

    this.timeLeft = this.gameDuration;
    this.glacierHealth = 100;
    this.carbonScore = 0;
    this.bubbles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.glacierMeltEffects = [];
    this.shakeIntensity = 0;
    this.spawnTimer = 0;
    this.spawnInterval = 1100;

    this.setState(GAME_STATE.IDLE);
    this.updateHUD();

    if (this.gameStartText) this.gameStartText.textContent = '게임 시작';
    if (this.gameStartBtn) {
      this.gameStartBtn.classList.remove('btn-secondary');
      this.gameStartBtn.classList.add('btn-primary');
    }
  }

  /**
   * 게임을 종료하고 결과 화면을 엽니다.
   * @param {boolean} isVictory - 60초 생존 승리 여부
   */
  endGame(isVictory) {
    if (this.state === GAME_STATE.VICTORY || this.state === GAME_STATE.GAME_OVER) return;

    if (isVictory) {
      this.setState(GAME_STATE.VICTORY);
      this.sound.playVictory();
      this.showNotification('🎉 축하합니다! 북극 빙하를 지켜냈습니다!', '🏆', 3000);
    } else {
      this.setState(GAME_STATE.GAME_OVER);
      this.sound.playGameOver();
      this.showNotification('⚠️ 빙하가 모두 녹아내렸습니다... 다시 도전해 북극곰을 지켜주세요!', '😭', 3000);
    }

    if (this.gameStartText) this.gameStartText.textContent = '다시 도전';
    if (this.gameStartBtn) {
      this.gameStartBtn.classList.remove('btn-secondary');
      this.gameStartBtn.classList.add('btn-primary');
    }

    // 결과 성적표 모달 팝업 띄우기
    setTimeout(() => {
      this.showResultModal(isVictory);
    }, 600);
  }

  /**
   * 상태 변경 처리 및 콜백 호출
   * @param {string} newState 
   */
  setState(newState) {
    this.state = newState;
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.state);
    }
  }

  /**
   * --------------------------------------------------------------------------
   * 4. 모션 트래커 손끝 좌표 수신 및 충돌 검사
   * --------------------------------------------------------------------------
   */

  /**
   * motion.js에서 매 프레임 감지된 손 데이터 배열을 게임 엔진에 전달합니다.
   * @param {Array<Object>} hands - MotionTracker의 latestHands 배열
   */
  processHands(hands) {
    if (!hands || !Array.isArray(hands) || hands.length === 0) {
      this.trackedFingerPoints = [];
      return;
    }

    const width = this.canvas.width;
    const height = this.canvas.height;
    const isMirrored = this.isMirrored();

    const points = [];

    hands.forEach(hand => {
      // 1. 검지 손끝(Index Tip - 주 공격 포인트)
      if (hand.indexTip) {
        // [중요 거울 좌표계 일치 공식]
        // canvas가 CSS scaleX(-1)되어 있으므로 원본 rawX 좌표를 픽셀로 변환해야
        // 브라우저 렌더링 단계에서 반전되어 손끝 위치와 완벽하게 일치합니다.
        const px = (isMirrored ? hand.indexTip.rawX : hand.indexTip.x) * width;
        const py = hand.indexTip.y * height;
        points.push({
          x: px,
          y: py,
          radius: hand.isPinching ? 38 : 26, // 핀치 시 판정 반경 확장
          isPinching: hand.isPinching,
          type: 'INDEX'
        });
      }

      // 2. 엄지 손끝(Thumb Tip - 핀치 시 보조 충돌 판정)
      if (hand.thumbTip && hand.isPinching) {
        const px = (isMirrored ? hand.thumbTip.rawX : hand.thumbTip.x) * width;
        const py = hand.thumbTip.y * height;
        points.push({
          x: px,
          y: py,
          radius: 24,
          isPinching: true,
          type: 'THUMB'
        });
      }
    });

    this.trackedFingerPoints = points;

    // 게임 플레이 중일 때 즉시 충돌 판정 수행
    if (this.state === GAME_STATE.PLAYING) {
      this.checkCollisions(points);
    }
  }

  /**
   * 손끝 터치 포인트들과 떨어지는 방울들의 물리 충돌을 판정합니다.
   * @param {Array<{x: number, y: number, radius: number}>} fingerPoints 
   */
  checkCollisions(fingerPoints) {
    if (!fingerPoints || fingerPoints.length === 0 || this.bubbles.length === 0) return;

    // 역순 순회하여 충돌한 방울 안전하게 제거
    for (let bIdx = this.bubbles.length - 1; bIdx >= 0; bIdx--) {
      const bubble = this.bubbles[bIdx];

      for (let fIdx = 0; fIdx < fingerPoints.length; fIdx++) {
        const finger = fingerPoints[fIdx];

        // 유클리드 거리 공식: d = sqrt((x2 - x1)^2 + (y2 - y1)^2)
        const dx = bubble.x - finger.x;
        const dy = bubble.y - finger.y;
        const distance = Math.hypot(dx, dy);

        // 충돌 판정 거리 = 방울 반지름 + 손끝 감지 반경
        const hitThreshold = bubble.radius + finger.radius;

        if (distance < hitThreshold) {
          // 💥 충돌 발생! 방울 유형별 인터랙션 실행
          this._handleBubbleHit(bubble, bIdx);
          break; // 해당 방울은 이미 터졌으므로 다음 방울로 넘어감
        }
      }
    }
  }

  /**
   * 방울이 손끝에 닿았을 때의 효과음, 점수, 회복, 폭탄 폭발 처리
   * @private
   * @param {Object} bubble 
   * @param {number} bubbleIndex 
   */
  _handleBubbleHit(bubble, bubbleIndex) {
    // 1. 방울 배열에서 제거
    this.bubbles.splice(bubbleIndex, 1);

    // 2. 방울 종류별 분기 처리
    switch (bubble.type) {
      case 'CO2':
        // 탄소 감축 점수 증가
        this.carbonScore += bubble.score;
        this.sound.playPop();
        // 상쾌한 파편 파티클 및 플로팅 텍스트
        this._createExplosionParticles(bubble.x, bubble.y, bubble.borderColor, 22);
        this._addFloatingText(`+${bubble.score}kg CO₂`, bubble.x, bubble.y - 10, '#00ffcc');
        break;

      case 'CH4':
        // 메탄가스 높은 점수 증가
        this.carbonScore += bubble.score;
        this.sound.playPop();
        this._createExplosionParticles(bubble.x, bubble.y, '#4ade80', 28);
        this._addFloatingText(`+${bubble.score}kg CH₄!`, bubble.x, bubble.y - 10, '#4ade80');
        break;

      case 'ICE':
        // 빙하 체력 회복
        this.glacierHealth = Math.min(100, this.glacierHealth + bubble.heal);
        this.sound.playIceChime();
        // 크리스탈 눈꽃 반짝이 별가루 파티클
        this._createIceSparkleParticles(bubble.x, bubble.y, 25);
        this._addFloatingText(`빙하 +${bubble.heal}% 회복! ❄️`, bubble.x, bubble.y - 10, '#00f2fe');
        break;

      case 'BOMB':
        // ☠️ 유독 매연 폭탄 폭발! 대폭 감점 및 화면 흔들림
        this.glacierHealth = Math.max(0, this.glacierHealth - bubble.damage);
        this.sound.playExplosion();
        // 강한 화면 흔들림 트리거
        this.shakeIntensity = 18;
        // 거대한 화염/연기 파티클
        this._createBombExplosionParticles(bubble.x, bubble.y, 45);
        this._addFloatingText(`위험! -${bubble.damage}% ⚠️`, bubble.x, bubble.y - 10, '#ef4444');
        this.showNotification('☠️ 매연 폭탄 피격! 빙하가 크게 파괴되었습니다!', '💥', 1500);

        // 체력이 0이 되었는지 즉시 점검
        if (this.glacierHealth <= 0) {
          this.endGame(false);
        }
        break;
    }

    // 3. HUD 동기화
    this.updateHUD();

    if (typeof this.onScoreUpdate === 'function') {
      this.onScoreUpdate({
        score: this.carbonScore,
        health: this.glacierHealth,
        hitType: bubble.type
      });
    }
  }

  /**
   * --------------------------------------------------------------------------
   * 5. 오브젝트 스폰 및 물리 모션 갱신
   * --------------------------------------------------------------------------
   */

  /**
   * 확률 가중치에 따라 새로운 방울 1개를 화면 상단에서 스폰합니다.
   * @private
   */
  _spawnBubble() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width <= 0 || height <= 0) return;

    // 1. 가중치 기반 무작위 방울 선택
    const types = Object.values(BUBBLE_TYPES);
    const totalWeight = types.reduce((sum, item) => sum + item.spawnWeight, 0);
    let randomNum = Math.random() * totalWeight;
    let selectedType = types[0];

    for (let i = 0; i < types.length; i++) {
      if (randomNum < types[i].spawnWeight) {
        selectedType = types[i];
        break;
      }
      randomNum -= types[i].spawnWeight;
    }

    // 2. 스폰 위치 및 물리 속성 계산
    const margin = selectedType.radius + 30;
    const spawnX = margin + Math.random() * (width - margin * 2);
    const spawnY = -selectedType.radius - 10; // 화면 바로 위에서 부드럽게 등장

    // 게임 경과 시간에 따른 미세한 속도 보정 (후반부로 갈수록 조금 빨라짐)
    const timeFactor = (60 - this.timeLeft) / 60; // 0.0 ~ 1.0
    const speed = selectedType.speedMin + Math.random() * (selectedType.speedMax - selectedType.speedMin) + (timeFactor * 0.8);

    // 좌우 살랑살랑 부유 모션을 위한 사인파 파라미터
    const floatSpeed = 0.002 + Math.random() * 0.003;
    const floatAmplitude = 18 + Math.random() * 22; // 좌우 진폭 (px)
    const phaseOffset = Math.random() * Math.PI * 2;

    this.bubbles.push({
      ...selectedType,
      x: spawnX,
      y: spawnY,
      baseX: spawnX,
      speedY: speed,
      floatSpeed: floatSpeed,
      floatAmplitude: floatAmplitude,
      phase: phaseOffset,
      createdAt: performance.now(),
      pulsePhase: Math.random() * Math.PI * 2
    });
  }

  /**
   * 매 프레임마다 방울들의 위치, 부유 진동, 바닥 충돌을 갱신합니다.
   * @private
   * @param {number} deltaTime - 이전 프레임과의 시간 차이 (초 단위)
   * @param {number} currentTime - 현재 타임스탬프
   */
  _updatePhysics(deltaTime, currentTime) {
    const width = this.canvas.width;
    const height = this.canvas.height;

    // 바닥 빙하의 상단 높이선 (체력에 따라 변함)
    const glacierTopY = this._getGlacierSurfaceY();

    // 1. 방울 위치 및 부유 모션 갱신
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];

      // Y축: 중력 낙하
      b.y += b.speedY * (deltaTime * 60);

      // X축: 부유 모션 (x = baseX + sin(time * speed + phase) * amp)
      const elapsed = currentTime - b.createdAt;
      b.x = b.baseX + Math.sin(elapsed * b.floatSpeed + b.phase) * b.floatAmplitude;

      // 화면 좌우 이탈 방지 클램핑
      b.x = Math.max(b.radius, Math.min(width - b.radius, b.x));

      // 펄스 애니메이션 위상 증가
      b.pulsePhase += 0.05;

      // ------------------------------------------------------------------------
      // 2. 바닥 빙하 충돌 검사
      // ------------------------------------------------------------------------
      if (b.y + b.radius >= glacierTopY) {
        // 온실가스(CO2, CH4)가 빙하에 닿으면 체력 감소 및 녹는 소리/이펙트
        if (b.type === 'CO2' || b.type === 'CH4') {
          this.glacierHealth = Math.max(0, this.glacierHealth - b.damage);
          this.sound.playGlacierMelt();

          // 바닥에서 뜨거운 증기/연기 파티클 생성
          this._createGlacierMeltSmoke(b.x, glacierTopY, 15);
          this._addFloatingText(`빙하 -${b.damage}%! 💧`, b.x, glacierTopY - 20, '#ef4444');

          // 체력이 0%가 되면 게임 오버 패배
          if (this.glacierHealth <= 0) {
            this.endGame(false);
          }
        } else if (b.type === 'BOMB') {
          // 폭탄이 바닥에 닿으면 불발되어 그냥 지직~ 소멸 (안도감 피드백)
          this._createExplosionParticles(b.x, glacierTopY, '#64748b', 12);
        } else if (b.type === 'ICE') {
          // 눈꽃은 바닥에 사뿐히 닿아 빙하를 부드럽게 감싸고 소멸
          this._createIceSparkleParticles(b.x, glacierTopY, 10);
        }

        // 방울 제거
        this.bubbles.splice(i, 1);
        this.updateHUD();
      }
    }

    // 2. 파편 파티클 물리 갱신
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * (deltaTime * 60);
      p.y += p.vy * (deltaTime * 60);
      p.vy += p.gravity * (deltaTime * 60); // 중력 가속도
      p.alpha -= p.decay * (deltaTime * 60);
      p.rotation += p.rotSpeed;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 3. 빙하 녹는 증기 파티클 갱신
    for (let i = this.glacierMeltEffects.length - 1; i >= 0; i--) {
      const s = this.glacierMeltEffects[i];
      s.x += s.vx * (deltaTime * 60);
      s.y += s.vy * (deltaTime * 60);
      s.size += s.growth;
      s.alpha -= s.decay * (deltaTime * 60);

      if (s.alpha <= 0) {
        this.glacierMeltEffects.splice(i, 1);
      }
    }

    // 4. 플로팅 텍스트 갱신
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= ft.speedY * (deltaTime * 60);
      ft.alpha -= ft.decay * (deltaTime * 60);

      if (ft.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 5. 화면 흔들림 감쇄
    if (this.shakeIntensity > 0.1) {
      this.shakeIntensity *= 0.88;
    } else {
      this.shakeIntensity = 0;
    }

    // 6. 빙하 파도 애니메이션 시간 증가
    this.glacierWaveTime += deltaTime * 2.2;
  }

  /**
   * 현재 빙하 체력에 따른 바닥 빙하 표면의 Y 좌표를 계산합니다.
   * 체력이 100%일 때 약 90px 두께, 체력이 0%로 갈수록 25px 두께로 낮아집니다.
   * @private
   * @returns {number} 캔버스 Y 좌표
   */
  _getGlacierSurfaceY() {
    const height = this.canvas.height;
    const maxGlacierHeight = 105;
    const minGlacierHeight = 25;
    const currentHeight = minGlacierHeight + (this.glacierHealth / 100) * (maxGlacierHeight - minGlacierHeight);
    return height - currentHeight;
  }

  /**
   * --------------------------------------------------------------------------
   * 6. 파티클 및 시각 효과 생성 헬퍼
   * --------------------------------------------------------------------------
   */

  /**
   * 방울 폭발 시 사방으로 튀는 파편 파티클 생성
   * @private
   */
  _createExplosionParticles(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        gravity: 0.15,
        size: 3 + Math.random() * 5,
        color: color,
        alpha: 1.0,
        decay: 0.02 + Math.random() * 0.025,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        type: 'shard'
      });
    }
  }

  /**
   * 얼음 회복 시 영롱하게 반짝이는 별가루 파티클 생성
   * @private
   */
  _createIceSparkleParticles(x, y, count = 25) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.0,
        gravity: 0.06, // 눈송이처럼 천천히 떨어짐
        size: 4 + Math.random() * 6,
        color: Math.random() > 0.5 ? '#00f2fe' : '#ffffff',
        alpha: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.15,
        type: 'sparkle'
      });
    }
  }

  /**
   * 매연 폭탄 폭발 시 묵직한 화염 및 연기 파티클 생성
   * @private
   */
  _createBombExplosionParticles(x, y, count = 45) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 9;
      const isSmoke = Math.random() > 0.4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5,
        gravity: isSmoke ? -0.05 : 0.22, // 연기는 위로 뜨고 파편은 아래로
        size: isSmoke ? 8 + Math.random() * 12 : 4 + Math.random() * 6,
        color: isSmoke ? 'rgba(50, 50, 50, 0.8)' : '#ef4444',
        alpha: 1.0,
        decay: isSmoke ? 0.012 : 0.025,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        type: isSmoke ? 'smoke' : 'shard'
      });
    }
  }

  /**
   * 빙하가 녹아내릴 때 피어오르는 뜨거운 수증기 생성
   * @private
   */
  _createGlacierMeltSmoke(x, y, count = 12) {
    for (let i = 0; i < count; i++) {
      this.glacierMeltEffects.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y,
        vx: (Math.random() - 0.5) * 1.5,
        vy: -1.2 - Math.random() * 2.2, // 위로 솟아오름
        size: 6 + Math.random() * 8,
        growth: 0.25,
        color: 'rgba(239, 68, 68, 0.65)',
        alpha: 0.85,
        decay: 0.03 + Math.random() * 0.02
      });
    }
  }

  /**
   * 화면에 떠오르는 숫자/메시지 플로팅 텍스트 등록
   * @private
   */
  _addFloatingText(text, x, y, color = '#ffffff') {
    this.floatingTexts.push({
      text,
      x,
      y,
      speedY: 1.6,
      color,
      alpha: 1.0,
      decay: 0.02
    });
  }

  /**
   * --------------------------------------------------------------------------
   * 7. 메인 게임 루프 및 캔버스 렌더링
   * --------------------------------------------------------------------------
   */

  /**
   * 브라우저 화면 주사율에 맞춰 실행되는 60fps 메인 루프
   * @private
   * @param {number} currentTime 
   */
  _gameLoop(currentTime) {
    const deltaTime = Math.min(0.1, (currentTime - this.lastFrameTime) / 1000);
    this.lastFrameTime = currentTime;

    // 1. 게임 진행 중일 때 타이머 및 스폰 처리
    if (this.state === GAME_STATE.PLAYING) {
      // 60초 타이머 카운트다운
      this.timeLeft -= deltaTime;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.updateHUD();
        this.endGame(true); // 60초 생존 승리!
      } else {
        // 방울 스폰 타이머 누적
        this.spawnTimer += deltaTime * 1000;
        // 시간이 흐를수록 스폰 주기 단축 (1.1초 -> 0.7초)
        const currentInterval = Math.max(650, this.spawnInterval - ((60 - this.timeLeft) * 8));
        if (this.spawnTimer >= currentInterval) {
          this.spawnTimer = 0;
          this._spawnBubble();
        }

        // 물리 시뮬레이션 및 충돌 갱신
        this._updatePhysics(deltaTime, currentTime);
        this.updateHUD();
      }
    } else {
      // 대기/일시정지 중이어도 파티클과 바닥 물결은 자연스럽게 갱신
      this._updatePhysics(deltaTime, currentTime);
    }

    // 2. 화면 전체 렌더링
    this.render();

    // 3. 다음 프레임 요청
    this.animationFrameId = requestAnimationFrame(this._gameLoop);
  }

  /**
   * 캔버스에 모든 그래픽을 그리는 메인 렌더 함수
   */
  render() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    if (width <= 0 || height <= 0) return;

    ctx.save();

    // 1. 이전 프레임 투명 클리어 (웹캠 영상이 뒤에 보여야 하므로 clearRect 사용)
    ctx.clearRect(0, 0, width, height);

    // 2. 화면 흔들림(Camera Shake) 변환 적용
    if (this.shakeIntensity > 0) {
      const shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      const shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      ctx.translate(shakeX, shakeY);
    }

    // 3. 바닥 북극 빙하 및 찰랑이는 물결 렌더링
    this._renderGlacier(ctx, width, height);

    // 4. 떨어지는 방울(CO2, CH4, ICE, BOMB) 렌더링
    this._renderBubbles(ctx);

    // 5. 폭발 파편 및 눈꽃 별가루 파티클 렌더링
    this._renderParticles(ctx);

    // 6. 빙하 증기 파티클 렌더링
    this._renderGlacierSmoke(ctx);

    // 7. 플로팅 텍스트 렌더링
    this._renderFloatingTexts(ctx);

    // 8. 외부 오버레이 렌더링 훅 (얼음빛 수호 링, 손동작 네온 파티클 등)
    if (typeof this.onPostRender === 'function') {
      this.onPostRender(ctx, width, height);
    }

    ctx.restore();
  }

  /**
   * 외부 통합 렌더 루프(app.js의 renderLoop)에서 매 프레임 손동작 포인트와 함께
   * 물리 시뮬레이션 및 그래픽 렌더링을 일괄 구동합니다.
   * @param {Array<Object>} fingerPointsOrHands - 검지/엄지 손끝 포인트 목록 또는 MotionTracker hands 배열
   * @param {number} [timestamp] - 현재 타임스탬프 (ms)
   */
  updateAndRender(fingerPointsOrHands = [], timestamp = performance.now()) {
    // 1. 손동작 좌표 버퍼 및 충돌 판정
    if (fingerPointsOrHands && Array.isArray(fingerPointsOrHands)) {
      if (fingerPointsOrHands.length > 0 && fingerPointsOrHands[0].indexTip !== undefined) {
        // MotionTracker 정제 hands 형식인 경우
        this.processHands(fingerPointsOrHands);
      } else {
        // 이미 픽셀화된 fingerPoints 배열인 경우
        this.trackedFingerPoints = fingerPointsOrHands;
        if (this.state === GAME_STATE.PLAYING) {
          this.checkCollisions(fingerPointsOrHands);
        }
      }
    }

    // 2. 물리 및 상태 갱신
    const currentTime = timestamp;
    const deltaTime = Math.min(0.1, (currentTime - this.lastFrameTime) / 1000);
    this.lastFrameTime = currentTime;

    if (this.state === GAME_STATE.PLAYING) {
      this.timeLeft -= deltaTime;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.updateHUD();
        this.endGame(true);
      } else {
        this.spawnTimer += deltaTime * 1000;
        const currentInterval = Math.max(650, this.spawnInterval - ((60 - this.timeLeft) * 8));
        if (this.spawnTimer >= currentInterval) {
          this.spawnTimer = 0;
          this._spawnBubble();
        }
        this._updatePhysics(deltaTime, currentTime);
        this.updateHUD();
      }
    } else {
      this._updatePhysics(deltaTime, currentTime);
    }

    // 3. 화면 렌더링 (빙하, 방울, 파티클 + onPostRender 훅)
    this.render();
  }

  /**
   * 바닥에 위치한 북극 빙하와 다층 물결, 균열(크랙) 라인을 그립니다.
   * @private
   */
  _renderGlacier(ctx, width, height) {
    const surfaceY = this._getGlacierSurfaceY();
    const time = this.glacierWaveTime;
    const isMirrored = this.isMirrored();

    ctx.save();

    // --------------------------------------------------------------------------
    // A. 북극해 깊은 바닷물 배경 레이어 (다크 블루 그라데이션)
    // --------------------------------------------------------------------------
    const oceanGrad = ctx.createLinearGradient(0, surfaceY, 0, height);
    oceanGrad.addColorStop(0, 'rgba(6, 25, 48, 0.75)');
    oceanGrad.addColorStop(1, 'rgba(3, 12, 26, 0.95)');

    ctx.fillStyle = oceanGrad;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, surfaceY);

    // 첫 번째 완만한 파도 곡선 (사인파)
    const step = 20;
    for (let x = 0; x <= width; x += step) {
      const wave = Math.sin(x * 0.012 + time) * 4 + Math.cos(x * 0.02 - time * 0.7) * 3;
      ctx.lineTo(x, surfaceY + wave);
    }

    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // --------------------------------------------------------------------------
    // B. 얼어붙은 빙하 얼음 덩어리 본체 (아이스 블루 네온 그라데이션)
    // --------------------------------------------------------------------------
    const iceGrad = ctx.createLinearGradient(0, surfaceY - 10, 0, height);
    // 체력이 낮아질수록 얼음 색상이 불안정하게(탁한 회청색으로) 변색
    const healthRatio = this.glacierHealth / 100;
    const topIceColor = healthRatio > 0.5 ? 'rgba(0, 242, 254, 0.85)' : 'rgba(239, 68, 68, 0.7)';
    const bottomIceColor = 'rgba(10, 40, 80, 0.9)';

    iceGrad.addColorStop(0, topIceColor);
    iceGrad.addColorStop(0.2, 'rgba(79, 172, 254, 0.6)');
    iceGrad.addColorStop(1, bottomIceColor);

    ctx.fillStyle = iceGrad;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, surfaceY + 4);

    // 두 번째 날카로운 빙하 능선 곡선
    for (let x = 0; x <= width; x += step) {
      const wave = Math.sin(x * 0.02 + time * 1.4) * 6 + Math.sin(x * 0.005 - time) * 5;
      ctx.lineTo(x, surfaceY + wave + 4);
    }

    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

    // --------------------------------------------------------------------------
    // C. 빙하 윗면을 따라 흐르는 빛나는 눈부신 크리스탈 엣지 라인
    // --------------------------------------------------------------------------
    ctx.strokeStyle = healthRatio > 0.3 ? '#ffffff' : '#fca5a5';
    ctx.lineWidth = 3.5;
    ctx.shadowBlur = 12;
    ctx.shadowColor = healthRatio > 0.5 ? '#00f2fe' : '#ef4444';

    ctx.beginPath();
    for (let x = 0; x <= width; x += step) {
      const wave = Math.sin(x * 0.02 + time * 1.4) * 6 + Math.sin(x * 0.005 - time) * 5;
      const y = surfaceY + wave + 4;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // --------------------------------------------------------------------------
    // D. 빙하 체력이 50% 미만일 때 발생하는 위험 균열(Crack) 시각 효과
    // --------------------------------------------------------------------------
    if (this.glacierHealth < 50) {
      ctx.strokeStyle = this.glacierHealth < 25 ? 'rgba(239, 68, 68, 0.9)' : 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = this.glacierHealth < 25 ? 3 : 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ef4444';

      // 3군데의 톱니모양 균열선 그리기
      const crackPositions = [width * 0.25, width * 0.5, width * 0.75];
      crackPositions.forEach((cx, idx) => {
        ctx.beginPath();
        let cy = surfaceY + 10;
        ctx.moveTo(cx, cy);

        // 지그재그 균열
        const segments = 5;
        const crackDepth = (height - surfaceY) * (this.glacierHealth < 25 ? 0.8 : 0.5);
        const dy = crackDepth / segments;

        for (let s = 1; s <= segments; s++) {
          const offsetX = (s % 2 === 0 ? 1 : -1) * (8 + idx * 2);
          cy += dy;
          ctx.lineTo(cx + offsetX, cy);
        }
        ctx.stroke();
      });
    }

    ctx.restore();
  }

  /**
   * 떨어지는 4종의 방울 오브젝트를 아름다운 입체 구체로 렌더링합니다.
   * @private
   */
  _renderBubbles(ctx) {
    const isMirrored = this.isMirrored();

    this.bubbles.forEach(b => {
      ctx.save();

      // 1. 방울 외곽 빛나는 네온 글로우(Glow) 효과
      ctx.shadowBlur = 16;
      ctx.shadowColor = b.glowColor;

      // 2. 3D 입체 구체 그라데이션 (하이라이트 빛 반사 느낌)
      const grad = ctx.createRadialGradient(
        b.x - b.radius * 0.35,
        b.y - b.radius * 0.35,
        b.radius * 0.1,
        b.x,
        b.y,
        b.radius
      );
      grad.addColorStop(0, '#ffffff'); // 왼쪽 위 하얀 반사광
      grad.addColorStop(0.35, b.baseColor);
      grad.addColorStop(1, b.borderColor);

      ctx.fillStyle = grad;
      ctx.strokeStyle = b.borderColor;
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      // 살짝 숨쉬듯 박동하는 미세 펄스
      const pulse = Math.sin(b.pulsePhase) * 1.5;
      const currentRadius = b.radius + pulse;
      ctx.arc(b.x, b.y, currentRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 3. 투명 비눗방울 반사광 호(Arc) 추가
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = 2.0;
      ctx.shadowBlur = 0; // 텍스트를 위해 글로우 끄기
      ctx.beginPath();
      ctx.arc(b.x, b.y, currentRadius * 0.72, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();

      // 4. [거울 모드 텍스트 반전 보정 핵심 로직]
      // 캔버스 전체가 CSS scaleX(-1)되어 있으므로 글자를 그냥 쓰면 거울처럼 뒤집힙니다!
      // 따라서 방울 중심에서 scale(-1, 1)을 한 번 더 적용하여 글자가 똑바로 보이게 만듭니다!
      ctx.save();
      ctx.translate(b.x, b.y);
      if (isMirrored) {
        ctx.scale(-1, 1);
      }

      // 방울 중앙 라벨 (CO2, CH4, ❄️, ☠️)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (b.type === 'ICE' || b.type === 'BOMB') {
        // 이모지 라벨
        ctx.font = 'bold 22px "Noto Sans KR", sans-serif';
        ctx.fillText(b.label, 0, -2);
      } else {
        // 영문 가스 라벨
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 15px "Rajdhani", "Noto Sans KR", sans-serif';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(b.label, 0, -3);

        // 아래쪽 작은 서브라벨 (+10kg 등)
        ctx.font = 'bold 10px "Rajdhani", sans-serif';
        ctx.fillStyle = b.type === 'CH4' ? '#86efac' : '#cbd5e1';
        ctx.fillText(b.subLabel, 0, 11);
      }

      ctx.restore(); // 텍스트 반전 복원
      ctx.restore(); // 방울 상태 복원
    });
  }

  /**
   * 폭발 파편 및 반짝이 별가루 파티클 렌더링
   * @private
   */
  _renderParticles(ctx) {
    this.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      if (p.type === 'sparkle') {
        // 다이아몬드 별가루
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        const s = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.35, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.35, 0);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'smoke') {
        // 부유하는 연기 덩어리
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // 일반 튀는 방울 파편 원형
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }

  /**
   * 바닥에서 피어오르는 빙하 증기 파티클 렌더링
   * @private
   */
  _renderGlacierSmoke(ctx) {
    this.glacierMeltEffects.forEach(s => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, s.alpha);
      ctx.fillStyle = s.color;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ef4444';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  /**
   * 위로 떠오르는 플로팅 점수 텍스트 렌더링
   * @private
   */
  _renderFloatingTexts(ctx) {
    const isMirrored = this.isMirrored();

    this.floatingTexts.forEach(ft => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.translate(ft.x, ft.y);

      // 거울 모드 시 글자 뒤집힘 보정
      if (isMirrored) {
        ctx.scale(-1, 1);
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 16px "Rajdhani", "Noto Sans KR", sans-serif';
      ctx.fillStyle = ft.color;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, 0, 0);

      ctx.restore();
    });
  }

  /**
   * --------------------------------------------------------------------------
   * 8. 상단 HUD 게이지 및 알림 배너 동기화
   * --------------------------------------------------------------------------
   */

  /**
   * 화면 상단 HUD(남은 시간, 빙하 체력, 북극곰 이모지, 탄소 감축량)를 동기화합니다.
   */
  updateHUD() {
    // 1. 남은 시간 타이머 (정수로 올림)
    if (this.timerDisplay) {
      this.timerDisplay.textContent = Math.ceil(this.timeLeft);
    }

    // 2. 탄소 감축량
    if (this.carbonScoreDisplay) {
      this.carbonScoreDisplay.textContent = this.carbonScore;
    }

    // 3. 빙하 체력 퍼센트 및 게이지 바
    const roundedHealth = Math.max(0, Math.min(100, Math.round(this.glacierHealth)));
    if (this.glacierHealthText) {
      this.glacierHealthText.textContent = `${roundedHealth}%`;
    }

    if (this.glacierHealthBar) {
      this.glacierHealthBar.style.width = `${roundedHealth}%`;

      // 체력 구간별 게이지 바 색상 변경 (스타일 변수 조작)
      if (roundedHealth >= 70) {
        this.glacierHealthBar.style.background = 'linear-gradient(90deg, #00f2fe 0%, #4facfe 100%)';
      } else if (roundedHealth >= 30) {
        this.glacierHealthBar.style.background = 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)';
      } else {
        this.glacierHealthBar.style.background = 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)';
      }
    }

    // 4. 북극곰 상태 이모지 자동 전환
    if (this.bearStatusIcon) {
      if (roundedHealth >= 70) {
        this.bearStatusIcon.textContent = '🐻‍❄️'; // 70% 이상: 행복한 북극곰
        this.bearStatusIcon.title = '북극곰이 살기 좋은 건강한 빙하입니다!';
      } else if (roundedHealth >= 30) {
        this.bearStatusIcon.textContent = '🥺';   // 30%~69%: 불안해하는 북극곰
        this.bearStatusIcon.title = '빙하가 녹고 있어 북극곰이 불안해합니다!';
      } else {
        this.bearStatusIcon.textContent = '😭';   // 30% 미만: 울고 있는 북극곰
        this.bearStatusIcon.title = '빙하가 거의 남아있지 않습니다! 서둘러 온실가스를 막아주세요!';
      }
    }
  }

  /**
   * 화면 중앙 상단에 알림 토스트 배너를 띄웁니다.
   * @param {string} text - 안내 메시지
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
   * --------------------------------------------------------------------------
   * 9. 게임 결과 모달 (성적표: 지구 환경 수호자 인증서)
   * --------------------------------------------------------------------------
   */

  /**
   * 승리 또는 패배 시 결과 모달 창을 구성하고 엽니다.
   * @param {boolean} isVictory 
   */
  showResultModal(isVictory) {
    if (!this.resultModal) return;

    const roundedHealth = Math.max(0, Math.round(this.glacierHealth));
    const score = this.carbonScore;

    // 성적 평가 및 등급(RANK) 산정
    let rank = 'RANK B';
    let title = '희망의 북극 지킴이 🌱';
    let bearMsg = '무사히 구조되어 안정을 취함 🐾';
    let emblem = '🌍';
    let educate = '';

    if (isVictory) {
      if (roundedHealth >= 75 && score >= 180) {
        rank = 'RANK S';
        title = '최고의 북극 수호신 🎖️';
        bearMsg = '행복하고 안전하게 번영 중 🐻‍❄️✨';
        emblem = '👑';
        educate = `"놀라운 집중력으로 ${score}kg의 탄소를 감축하고 빙하를 ${roundedHealth}%나 지켜냈습니다! 여러분은 진정한 지구 환경의 수호신입니다. 일상 속에서도 에너지 절약과 대중교통 이용으로 지구를 지켜주세요!"`;
      } else if (roundedHealth >= 50) {
        rank = 'RANK A';
        title = '위대한 환경 지킴이 🌟';
        bearMsg = '충분한 터전에서 건강하게 생활 중 ❄️';
        emblem = '🌍';
        educate = `"60초 동안 흔들림 없이 ${score}kg의 온실가스를 감축했습니다. 작은 손동작 하나가 모여 북극 생태계에 커다란 희망을 선물했습니다!"`;
      } else {
        rank = 'RANK B';
        title = '용감한 북극 수호자 🛡️';
        bearMsg = '다소 지쳤지만 안전한 빙하에 머묾 🥺';
        emblem = '🌱';
        educate = `"위기의 순간에도 끝까지 포기하지 않고 빙하를 지켜냈습니다! 온실가스 배출을 줄이는 작은 습관이 지구 온난화를 막는 가장 큰 힘입니다."`;
      }
    } else {
      rank = 'RANK C';
      title = '도전하는 환경 연구원 💧';
      bearMsg = '빙하가 모두 녹아 구조가 시급함 😭';
      emblem = '⚠️';
      educate = `"아쉽게도 온실가스의 증가로 북극 빙하가 모두 녹아내렸습니다. 하지만 실패는 새로운 시작입니다! 다시 한 번 양손을 힘차게 움직여 북극곰 가족을 지켜주세요!"`;
    }

    // 모달 DOM에 결과 반영
    if (this.resultEmblem) this.resultEmblem.textContent = emblem;
    if (this.resultRankBadge) this.resultRankBadge.textContent = rank;
    if (this.modalTitle) this.modalTitle.textContent = isVictory ? '지구 환경 수호자 인증서' : '북극 빙하 긴급 구조 보고서';
    if (this.modalSubtitle) this.modalSubtitle.textContent = isVictory ? '북극의 빙하와 생태계를 훌륭하게 지켜냈습니다!' : '빙하가 모두 녹아내려 북극곰이 위기에 처했습니다.';
    if (this.finalScore) this.finalScore.textContent = score;
    if (this.finalHealth) this.finalHealth.textContent = roundedHealth;
    if (this.finalBearStatus) this.finalBearStatus.textContent = bearMsg;
    if (this.finalTitle) this.finalTitle.textContent = title;
    if (this.finalEducateMessage) this.finalEducateMessage.textContent = educate;

    // 모달 표시
    this.resultModal.classList.remove('hidden');
  }

  /**
   * 결과 모달 창 닫기
   */
  hideResultModal() {
    if (this.resultModal) {
      this.resultModal.classList.add('hidden');
    }
  }

  /**
   * --------------------------------------------------------------------------
   * 10. 자원 해제 및 메모리 정리
   * --------------------------------------------------------------------------
   */
  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.countdownTimerId) {
      clearTimeout(this.countdownTimerId);
    }
    window.removeEventListener('resize', this._resizeHandler);
    this.bubbles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.glacierMeltEffects = [];
    console.log('🧹 [게임 엔진] GameEngine 자원이 완전히 해제되었습니다.');
  }
}

// ES 모듈 기본 내보내기 제공
export default GameEngine;
