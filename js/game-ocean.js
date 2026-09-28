/**
 * ============================================================================
 * [푸른 바다 지킴이 (Ocean Trash Cleaner) - 게임 엔진 모듈]
 * 파일명: js/game-ocean.js
 * 
 * [주요 기능]
 * 1. 5단계 레벨 시스템:
 *    - 1단계(새싹 바다 수호자: 초등 1학년 맞춤, 왕방울 쓰레기, 폭탄 없음)부터
 *    - 5단계(지구 바다의 영웅: 스릴 넘치는 빠른 조류)까지 완벽 제어
 * 2. 해양 쓰레기 오브젝트 5종:
 *    - 플라스틱 컵/빨대(🥤), 페트병(🧴), 비닐봉지(🛍️), 찌그러진 캔(🥫), 폐그물(🪢)
 * 3. 스페셜 아이템 & 장애물:
 *    - 맑은 산소 방울(🫧), 진주 조개(🦪): 바다 청정도 대폭 회복!
 *    - 바다청소로봇(🤖): 바다를 스스로 정화하는 청소로봇! 건드려 방해하면 고장나서 화면 흔들림 및 바다 청정도 -25% 대폭 하락!
 * 4. 🌟 거울 모드 텍스트 반전 자동 역보정 (글자가 뒤집히지 않고 항상 정방향 유지)
 * 5. 3배 대형 바다거북이(🐢) 실시간 5대 감정 동기화:
 *    - dancing(춤추기), cheering(응원), worried(당황), crying(울음), superhero(영웅)
 * 6. 바닷속 유영 물리 & 상쾌한 물방울 파티클 시스템
 * ============================================================================
 */

export class OceanGameEngine {
  /**
   * @param {HTMLCanvasElement} canvas - 게임 화면이 렌더링될 메인 캔버스
   * @param {SoundEngine} soundEngine - 효과음 및 배경음을 재생할 사운드 엔진
   */
  constructor(canvas, soundEngine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.soundEngine = soundEngine;

    // ------------------------------------------------------------------------
    // [1. 게임 상태 머신 (State Machine)]
    // ------------------------------------------------------------------------
    this.STATE = {
      IDLE: 'IDLE',           // 게임 시작 전 대기 상태
      PLAYING: 'PLAYING',     // 60초 게임 진행 중
      PAUSED: 'PAUSED',       // 일시정지 상태
      VICTORY: 'VICTORY',     // 60초 생존 및 바다 정화 성공
      GAME_OVER: 'GAME_OVER'  // 바다 청정도가 0%가 되어 게임 오버
    };
    this.currentState = this.STATE.IDLE;

    // ------------------------------------------------------------------------
    // [2. 5단계 난이도별 상세 파라미터 테이블]
    // ------------------------------------------------------------------------
    this.LEVEL_CONFIGS = {
      1: {
        levelName: '새싹 바다 수호자 🐣',
        spawnIntervalMs: 1350,   // 쓰레기가 느리게 하나씩 나옴
        minSpeed: 1.1,           // 아주 천천히 떠다님
        maxSpeed: 1.7,
        sizeScale: 1.5,          // 초등 1학년 맞춤형 왕 크기 (70% 최적화 적용)
        robotChance: 0.0,        // 1단계에는 청소로봇이 없음 (안심 수거)
        oilChance: 0.0,
        oxygenChance: 0.22,      // 넉넉한 산소 방울 선물 (22%)
        damageMultiplier: 0.7    // 바닥에 떨어져도 피해가 적음
      },
      2: {
        levelName: '초보 바다 친구 🐠',
        spawnIntervalMs: 1100,
        minSpeed: 1.5,
        maxSpeed: 2.3,
        sizeScale: 1.35,
        robotChance: 0.05,       // 가끔 등장하는 바다청소로봇 (건드리면 고장! 주의 5%)
        oilChance: 0.05,
        oxygenChance: 0.18,
        damageMultiplier: 0.85
      },
      3: {
        levelName: '푸른 파도 지킴이 🌊',
        spawnIntervalMs: 880,
        minSpeed: 2.0,
        maxSpeed: 3.1,
        sizeScale: 1.2,
        robotChance: 0.10,       // 청소로봇 10%
        oilChance: 0.10,
        oxygenChance: 0.15,
        damageMultiplier: 1.0
      },
      4: {
        levelName: '해양 생태 수호자 🐬',
        spawnIntervalMs: 700,
        minSpeed: 2.6,
        maxSpeed: 4.0,
        sizeScale: 1.1,
        robotChance: 0.14,       // 청소로봇 14%
        oilChance: 0.14,
        oxygenChance: 0.12,
        damageMultiplier: 1.2
      },
      5: {
        levelName: '지구 바다의 영웅 👑',
        spawnIntervalMs: 530,    // 쏟아지는 바다쓰레기
        minSpeed: 3.2,
        maxSpeed: 5.2,
        sizeScale: 1.0,
        robotChance: 0.18,       // 청소로봇 18%
        oilChance: 0.18,
        oxygenChance: 0.10,
        damageMultiplier: 1.4
      }
    };
    this.currentLevel = 1;

    // ------------------------------------------------------------------------
    // [3. 핵심 게임 수치 변수]
    // ------------------------------------------------------------------------
    this.maxTime = 60;                    // 기본 60초 타임어택
    this.remainingTime = this.maxTime;
    this.oceanHealth = 100;               // 바다 청정도 (100% 시작, 0% 패배)
    this.trashScore = 0;                  // 수거한 쓰레기 무게 (kg)
    this.lastSpawnTime = 0;
    this.lastTimerTickTime = 0;

    // ------------------------------------------------------------------------
    // [4. 오브젝트 및 파티클 배열]
    // ------------------------------------------------------------------------
    this.trashObjects = [];               // 떠다니는 쓰레기 및 아이템 목록
    this.splashParticles = [];            // 수거 시 튀는 물방울/별가루 파티클
    this.ambientBubbles = [];             // 바닷속에 은은히 올라오는 배경 기포들

    // ------------------------------------------------------------------------
    // [5. 화면 연출 효과]
    // ------------------------------------------------------------------------
    this.screenShakeTime = 0;             // 청소로봇 충돌/고장 시 화면 흔들림 잔여 시간
    this.screenShakeIntensity = 0;

    // ------------------------------------------------------------------------
    // [6. 바다거북이 감정 상태]
    // ------------------------------------------------------------------------
    this.turtleMood = 'cheering';         // 'dancing', 'cheering', 'worried', 'crying', 'superhero'
    this.turtleMoodTimer = 0;             // 특정 표정 유지 타이머

    // ------------------------------------------------------------------------
    // [7. DOM UI 엘리먼트 캐싱]
    // ------------------------------------------------------------------------
    this.cacheDomElements();
    this.initAmbientBubbles();
  }

  /**
   * DOM 엘리먼트들을 미리 찾아서 변수에 저장해 둡니다.
   */
  cacheDomElements() {
    this.appContainer = document.getElementById('appContainer');
    this.timerDisplay = document.getElementById('timerDisplay');
    this.oceanHealthBar = document.getElementById('oceanHealthBar');
    this.oceanHealthText = document.getElementById('oceanHealthText');
    this.trashScoreDisplay = document.getElementById('trashScore');
    this.levelDisplay = document.getElementById('levelDisplay');
    this.levelSubTitle = document.getElementById('levelSubTitle');
    this.levelSelect = document.getElementById('levelSelect');
    this.turtleStatusIcon = document.getElementById('turtleStatusIcon');
    this.notificationBanner = document.getElementById('notificationBanner');
    this.notificationText = document.getElementById('notificationText');
    this.notificationIcon = document.getElementById('notificationIcon');
    this.gameStartBtn = document.getElementById('gameStartBtn');
    this.gameStartText = document.getElementById('gameStartText');

    // 거북이 캐릭터 DOM
    this.seaTurtleHero = document.getElementById('seaTurtleHero');
    this.turtleAvatar = document.getElementById('turtleAvatar');
    this.turtleMoodFx = document.getElementById('turtleMoodFx');
    this.turtleMoodTitle = document.getElementById('turtleMoodTitle');
    this.turtleSpeechText = document.getElementById('turtleSpeechText');

    // 결과 모달 DOM
    this.resultModal = document.getElementById('resultModal');
    this.modalTitle = document.getElementById('modalTitle');
    this.modalSubtitle = document.getElementById('modalSubtitle');
    this.resultEmblem = document.getElementById('resultEmblem');
    this.resultRankBadge = document.getElementById('resultRankBadge');
    this.finalScore = document.getElementById('finalScore');
    this.finalHealth = document.getElementById('finalHealth');
    this.finalTurtleStatus = document.getElementById('finalTurtleStatus');
    this.finalTitle = document.getElementById('finalTitle');
    this.finalEducateMessage = document.getElementById('finalEducateMessage');
    this.modalRestartBtn = document.getElementById('modalRestartBtn');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');
  }

  /**
   * 현재 거울 모드가 켜져 있는지 확인합니다.
   * @returns {boolean}
   */
  isMirrored() {
    return this.appContainer ? this.appContainer.classList.contains('mirror-active') : true;
  }

  /**
   * 바닷속 분위기를 살리는 배경 기포들을 초기화합니다.
   */
  initAmbientBubbles() {
    this.ambientBubbles = [];
    for (let i = 0; i < 25; i++) {
      this.ambientBubbles.push({
        x: Math.random() * (this.canvas.width || 1280),
        y: Math.random() * (this.canvas.height || 720),
        radius: 2 + Math.random() * 5,
        speedY: 0.5 + Math.random() * 1.5,
        wobbleSpeed: 0.02 + Math.random() * 0.03,
        wobbleOffset: Math.random() * Math.PI * 2,
        opacity: 0.15 + Math.random() * 0.35
      });
    }
  }

  /**
   * 5단계 난이도를 설정합니다.
   * @param {number} level - 1부터 5까지의 단계 번호
   */
  setLevel(level) {
    const parsedLevel = parseInt(level, 10);
    if (this.LEVEL_CONFIGS[parsedLevel]) {
      this.currentLevel = parsedLevel;
      const config = this.LEVEL_CONFIGS[parsedLevel];

      if (this.levelDisplay) this.levelDisplay.textContent = `${parsedLevel}단계`;
      if (this.levelSubTitle) this.levelSubTitle.textContent = config.levelName;

      this.showNotification(`🎯 ${parsedLevel}단계 [${config.levelName}]가 선택되었습니다!`, '⭐', 2500);
      this.updateTurtleMood('cheering', `친구야! ${parsedLevel}단계 바다를 깨끗하게 청소하자! 🐢🌊`);
    }
  }

  /**
   * 바다거북이 캐릭터의 표정과 말풍선을 갱신합니다.
   * @param {string} mood - 'dancing', 'cheering', 'worried', 'crying', 'superhero'
   * @param {string} speechText - 말풍선에 띄울 한글 대사
   */
  updateTurtleMood(mood, speechText = null) {
    this.turtleMood = mood;

    if (this.seaTurtleHero) {
      this.seaTurtleHero.className = `sea-turtle-hero mood-${mood}`;
    }

    if (this.turtleAvatar) {
      if (mood === 'dancing') this.turtleAvatar.textContent = '🐢';
      else if (mood === 'cheering') this.turtleAvatar.textContent = '🐢';
      else if (mood === 'worried') this.turtleAvatar.textContent = '🐢';
      else if (mood === 'crying') this.turtleAvatar.textContent = '😭';
      else if (mood === 'superhero') this.turtleAvatar.textContent = '🐢';
    }

    if (this.turtleMoodFx) {
      if (mood === 'dancing') this.turtleMoodFx.textContent = '💖';
      else if (mood === 'cheering') this.turtleMoodFx.textContent = '✨';
      else if (mood === 'worried') this.turtleMoodFx.textContent = '💦';
      else if (mood === 'crying') this.turtleMoodFx.textContent = '💧';
      else if (mood === 'superhero') this.turtleMoodFx.textContent = '👑';
    }

    if (this.turtleMoodTitle) {
      if (mood === 'dancing') this.turtleMoodTitle.textContent = '신난 바다거북 춤';
      else if (mood === 'cheering') this.turtleMoodTitle.textContent = '응원하는 바다거북';
      else if (mood === 'worried') this.turtleMoodTitle.textContent = '깜짝 놀란 바다거북';
      else if (mood === 'crying') this.turtleMoodTitle.textContent = '울고 있는 바다거북';
      else if (mood === 'superhero') this.turtleMoodTitle.textContent = '지구 바다의 영웅!';
    }

    if (this.turtleSpeechText && speechText) {
      this.turtleSpeechText.textContent = speechText;
    }
  }

  /**
   * 게임을 처음부터 새로 시작합니다.
   */
  startGame() {
    this.currentState = this.STATE.PLAYING;
    this.remainingTime = this.maxTime;
    this.oceanHealth = 100;
    this.trashScore = 0;
    this.trashObjects = [];
    this.splashParticles = [];
    this.lastSpawnTime = performance.now();
    this.lastTimerTickTime = performance.now();

    this.updateHUD();
    this.updateTurtleMood('cheering', '바다쓰레기 수거 시작! 손을 번쩍 움직여줘! 🐢🌊');
    this.showNotification('🚀 게임 시작! 손을 움직여 바다를 깨끗하게 청소하세요!', '🌊', 2500);

    if (this.gameStartBtn) {
      this.gameStartBtn.classList.remove('btn-primary');
      this.gameStartBtn.classList.add('btn-tool');
      if (this.gameStartText) this.gameStartText.textContent = '다시 시작';
    }

    if (this.soundEngine) {
      this.soundEngine.playBeep(true);
    }

    if (this.resultModal) {
      this.resultModal.classList.add('hidden');
    }
  }

  /**
   * 화면 중앙 상단에 알림 메시지를 띄웁니다.
   */
  showNotification(text, icon = '✨', durationMs = 2500) {
    if (!this.notificationBanner) return;
    if (this.notificationText) this.notificationText.textContent = text;
    if (this.notificationIcon) this.notificationIcon.textContent = icon;

    this.notificationBanner.classList.remove('hidden');
    clearTimeout(this._notiTimer);
    this._notiTimer = setTimeout(() => {
      this.notificationBanner.classList.add('hidden');
    }, durationMs);
  }

  /**
   * 상단 HUD의 게이지, 타이머, 점수판을 갱신합니다.
   */
  updateHUD() {
    if (this.timerDisplay) {
      this.timerDisplay.textContent = Math.max(0, Math.ceil(this.remainingTime));
    }

    if (this.oceanHealthBar) {
      const clampedHealth = Math.max(0, Math.min(100, this.oceanHealth));
      this.oceanHealthBar.style.width = `${clampedHealth}%`;

      const statusContainer = this.oceanHealthBar.closest('.ocean-status-container');
      if (statusContainer) {
        if (clampedHealth <= 30) {
          statusContainer.classList.add('danger');
        } else {
          statusContainer.classList.remove('danger');
        }
      }
    }

    if (this.oceanHealthText) {
      this.oceanHealthText.textContent = `${Math.round(this.oceanHealth)}%`;
    }

    if (this.trashScoreDisplay) {
      this.trashScoreDisplay.textContent = this.trashScore;
    }

    // 거북이 미니 아이콘 동기화
    if (this.turtleStatusIcon) {
      if (this.oceanHealth >= 70) {
        this.turtleStatusIcon.textContent = '🐢';
      } else if (this.oceanHealth >= 35) {
        this.turtleStatusIcon.textContent = '🥺';
      } else {
        this.turtleStatusIcon.textContent = '😭';
      }
    }
  }

  /**
   * 새로운 바다쓰레기 또는 아이템을 스폰합니다.
   */
  spawnTrashObject(timestamp) {
    const config = this.LEVEL_CONFIGS[this.currentLevel] || this.LEVEL_CONFIGS[1];
    const rand = Math.random();

    let type = 'CUP';
    let label = '플라스틱';
    let icon = '🥤';
    let points = 10;
    let baseDamage = 4;
    let color = '#00f2fe';

    const robotChance = config.robotChance !== undefined ? config.robotChance : (config.oilChance || 0);

    if (rand < robotChance) {
      // 🤖 바다를 스스로 정화 중인 바다청소로봇 (건드리면 방해되어 고장 발생!)
      type = 'ROBOT';
      label = '바다청소로봇 🤖';
      icon = '🤖';
      points = 0;
      baseDamage = 25; // 건드리면 고장나며 청정도 -25% 대폭 하락
      color = '#ff9f1c'; // 주의를 환기하는 밝은 오렌지 네온 로봇 컬러
    } else if (rand < robotChance + config.oxygenChance) {
      // 🫧 산소 방울 회복 아이템
      type = 'OXYGEN';
      label = '산소방울 🫧';
      icon = '🫧';
      points = 0;
      baseDamage = -15; // 체력 회복
      color = '#00f5d4';
    } else {
      // 일반 해양 쓰레기 5종 무작위
      const trashTypes = [
        { type: 'CUP', label: '플라스틱 컵', icon: '🥤', points: 10, damage: 4, color: '#00f2fe' },
        { type: 'BOTTLE', label: '페트병', icon: '🧴', points: 15, damage: 6, color: '#4facfe' },
        { type: 'BAG', label: '비닐봉지', icon: '🛍️', points: 20, damage: 7, color: '#b388ff' },
        { type: 'CAN', label: '찌그러진 캔', icon: '🥫', points: 25, damage: 8, color: '#ffb703' },
        { type: 'NET', label: '위험한 폐그물', icon: '🪢', points: 50, damage: 15, color: '#fb8500' }
      ];
      const selected = trashTypes[Math.floor(Math.random() * trashTypes.length)];
      type = selected.type;
      label = selected.label;
      icon = selected.icon;
      points = selected.points;
      baseDamage = selected.damage;
      color = selected.color;
    }

    // 🌟 기본 반경: 전체적으로 70% 최적화 적용 (기존 60~85px -> 약 42~60px)
    const baseRadius = (60 + Math.random() * 25) * config.sizeScale * 0.7;
    const speed = (config.minSpeed + Math.random() * (config.maxSpeed - config.minSpeed));

    // 화면 상단 무작위 X 좌표
    const padding = baseRadius + 40;
    const x = padding + Math.random() * (Math.max(300, this.canvas.width - padding * 2));
    const y = -baseRadius - 10;

    this.trashObjects.push({
      id: Math.random().toString(36).substring(2, 9),
      type,
      label,
      icon,
      points,
      damage: Math.round(baseDamage * config.damageMultiplier),
      x,
      y,
      radius: baseRadius,
      speed,
      wobbleSpeed: 0.025 + Math.random() * 0.03,
      wobbleAmplitude: 25 + Math.random() * 20,
      wobbleOffset: Math.random() * Math.PI * 2,
      createdAt: timestamp,
      color
    });
  }

  /**
   * 손끝 터치 충돌 판정 및 수거 처리
   * @param {Array<{x: number, y: number}>} fingerPoints - 검지/엄지 손끝 픽셀 좌표
   */
  checkCollisions(fingerPoints) {
    if (!fingerPoints || fingerPoints.length === 0 || this.currentState !== this.STATE.PLAYING) {
      return;
    }

    const touchRadius = 45; // 어린이 손끝 판정 여유 반경

    for (let i = this.trashObjects.length - 1; i >= 0; i--) {
      const obj = this.trashObjects[i];
      let collided = false;

      for (const pt of fingerPoints) {
        const dx = pt.x - obj.x;
        const dy = pt.y - obj.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= obj.radius + touchRadius) {
          collided = true;
          break;
        }
      }

      if (collided) {
        this.handleObjectCollected(obj);
        this.trashObjects.splice(i, 1);
      }
    }
  }

  /**
   * 쓰레기 또는 아이템 수거 이벤트 처리
   */
  handleObjectCollected(obj) {
    if (obj.type === 'ROBOT' || obj.type === 'OIL') {
      // 🤖 바다청소로봇 터치: 청소 방해로 로봇 오작동/고장 발생! 바다 청정도 -25% 대폭 하락
      this.oceanHealth = Math.max(0, this.oceanHealth - obj.damage);
      this.triggerScreenShake(450, 16);
      this.createExplosionParticles(obj.x, obj.y, '#ff9f1c', 35);
      this.updateTurtleMood('worried', '앗! 청소로봇을 건드려 고장 났어! 조심해 🤖💦');

      if (this.soundEngine) {
        this.soundEngine.playExplosion();
      }
      this.showNotification('⚠️ 주의! 바다청소로봇을 방해하여 고장 났습니다! (-25%)', '🤖', 2000);
    } else if (obj.type === 'OXYGEN') {
      // 🫧 산소 방울 터치: 바다 청정도 회복!
      this.oceanHealth = Math.min(100, this.oceanHealth + Math.abs(obj.damage));
      this.createSparkleParticles(obj.x, obj.y, '#00f5d4', 30);
      this.updateTurtleMood('dancing', '우와! 맑은 산소 방울 덕분에 힘이 나! 🫧✨');

      if (this.soundEngine) {
        this.soundEngine.playIceChime();
      }
      this.showNotification('🫧 맑은 산소 방울 획득! 바다 청정도 회복 (+15%)', '💎', 2000);
    } else {
      // 🥤 일반 해양 쓰레기 수거 성공!
      this.trashScore += obj.points;
      this.createSplashParticles(obj.x, obj.y, obj.color, 25);

      if (this.soundEngine) {
        this.soundEngine.playPop();
      }

      // 거북이 칭찬 리액션
      if (Math.random() < 0.35) {
        const praises = [
          '나이스 캐치! 쓰레기를 쏙 건져냈어! 🐢👍',
          '대단해! 바다가 점점 맑아지고 있어! 🌊✨',
          '최고야 친구야! 물고기들도 기뻐해! 🐠💖',
          '깨끗한 바다 만들기 성공 중! 파이팅! 🐢🔥'
        ];
        const pick = praises[Math.floor(Math.random() * praises.length)];
        this.updateTurtleMood('dancing', pick);
      }
    }

    this.updateHUD();

    // 청정도가 0%가 되면 게임 오버
    if (this.oceanHealth <= 0) {
      this.endGame(false);
    }
  }

  /**
   * 화면 흔들림 효과 트리거
   */
  triggerScreenShake(durationMs, intensity) {
    this.screenShakeTime = durationMs;
    this.screenShakeIntensity = intensity;
  }

  /**
   * 수거 시 터지는 상쾌한 물방울 파티클 생성
   */
  createSplashParticles(x, y, color, count = 20) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 8;
      this.splashParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        radius: 3 + Math.random() * 6,
        color: color || '#00f2fe',
        alpha: 1,
        life: 0.6 + Math.random() * 0.4
      });
    }
  }

  /**
   * 산소 방울 터치 시 반짝이는 크리스탈 별가루 파티클
   */
  createSparkleParticles(x, y, color, count = 25) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      this.splashParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        radius: 2 + Math.random() * 5,
        color: color || '#00f5d4',
        alpha: 1,
        life: 0.8 + Math.random() * 0.5,
        isSparkle: true
      });
    }
  }

  /**
   * 바다청소로봇 충돌/고장 시 전기 스파크 및 주황/노랑 파편 파티클
   */
  createExplosionParticles(x, y, color, count = 30) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 10;
      this.splashParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 5 + Math.random() * 9,
        color: Math.random() > 0.5 ? (color || '#ff9f1c') : '#ffd166',
        alpha: 1,
        life: 0.7 + Math.random() * 0.5
      });
    }
  }

  /**
   * 실시간 업데이트 및 렌더링 (메인 게임 루프에서 매 프레임 호출)
   * @param {Array<{x: number, y: number}>} fingerPoints - 손끝 좌표
   * @param {number} timestamp - 현재 시간 (ms)
   */
  updateAndRender(fingerPoints, timestamp) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // ------------------------------------------------------------------------
    // 1. 화면 흔들림 연출 처리
    // ------------------------------------------------------------------------
    if (this.screenShakeTime > 0) {
      const offsetX = (Math.random() - 0.5) * this.screenShakeIntensity;
      const offsetY = (Math.random() - 0.5) * this.screenShakeIntensity;
      ctx.translate(offsetX, offsetY);
      this.screenShakeTime -= 16.6; // 약 60fps 한 프레임
    }

    // ------------------------------------------------------------------------
    // 2. 바닷속 은은한 배경 기포 렌더링
    // ------------------------------------------------------------------------
    this.updateAndRenderBubbles(ctx, width, height);

    // ------------------------------------------------------------------------
    // 3. 게임 플레이 중일 때의 타이머 및 스폰 처리
    // ------------------------------------------------------------------------
    if (this.currentState === this.STATE.PLAYING) {
      // 1초 단위 타이머 감소
      const deltaMs = timestamp - this.lastTimerTickTime;
      if (deltaMs >= 1000) {
        this.remainingTime -= deltaMs / 1000;
        this.lastTimerTickTime = timestamp;
        this.updateHUD();

        // 10초 남았을 때 카운트다운 경고
        if (this.remainingTime <= 10 && this.remainingTime > 0) {
          if (this.soundEngine) this.soundEngine.playBeep(false);
        }

        // 60초 생존 성공 시 승리
        if (this.remainingTime <= 0) {
          this.endGame(true);
        }
      }

      // 새 쓰레기 오브젝트 스폰
      const config = this.LEVEL_CONFIGS[this.currentLevel] || this.LEVEL_CONFIGS[1];
      if (timestamp - this.lastSpawnTime >= config.spawnIntervalMs) {
        this.spawnTrashObject(timestamp);
        this.lastSpawnTime = timestamp;
      }

      // 손끝 충돌 판정
      this.checkCollisions(fingerPoints);
    }

    // ------------------------------------------------------------------------
    // 4. 쓰레기 오브젝트 물리 이동 및 렌더링
    // ------------------------------------------------------------------------
    this.updateAndRenderTrash(ctx, width, height, timestamp);

    // ------------------------------------------------------------------------
    // 5. 물방울/별가루 파티클 이동 및 렌더링
    // ------------------------------------------------------------------------
    this.updateAndRenderParticles(ctx);

    // ------------------------------------------------------------------------
    // 6. 손끝 위치에 빛나는 '물빛 수호 링' 오버레이
    // ------------------------------------------------------------------------
    this.renderFingerGlow(ctx, fingerPoints, timestamp);

    ctx.restore();
  }

  /**
   * 바닷속 기포들을 위로 올려보내는 렌더링
   */
  updateAndRenderBubbles(ctx, width, height) {
    for (const b of this.ambientBubbles) {
      b.y -= b.speedY;
      b.x += Math.sin(b.y * b.wobbleSpeed + b.wobbleOffset) * 0.6;

      if (b.y < -20) {
        b.y = height + 20;
        b.x = Math.random() * width;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 245, 212, ${b.opacity})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${b.opacity * 1.5})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * 바다쓰레기 오브젝트들의 하강 및 렌더링
   */
  updateAndRenderTrash(ctx, width, height, timestamp) {
    const bottomOceanFloor = height - 60; // 바닥 해저면

    for (let i = this.trashObjects.length - 1; i >= 0; i--) {
      const obj = this.trashObjects[i];

      if (this.currentState === this.STATE.PLAYING) {
        // 아래로 하강
        obj.y += obj.speed;
        // 좌우 조류 물결 모션
        obj.x += Math.sin(timestamp * 0.002 + obj.wobbleOffset) * (obj.wobbleAmplitude * 0.035);

        // 바닥 해저면에 닿았을 때
        if (obj.y + obj.radius >= bottomOceanFloor) {
          if (obj.type !== 'ROBOT' && obj.type !== 'OIL' && obj.type !== 'OXYGEN') {
            // 바다 청정도 감소
            this.oceanHealth = Math.max(0, this.oceanHealth - obj.damage);
            this.updateHUD();
            this.createSplashParticles(obj.x, bottomOceanFloor, '#ff3366', 15);

            if (this.soundEngine) {
              this.soundEngine.playGlacierMelt();
            }

            // 거북이 걱정 반응
            this.updateTurtleMood('worried', '앗! 쓰레기가 바닥에 쌓이고 있어! 어서 치워줘 💦');

            if (this.oceanHealth <= 0) {
              this.trashObjects.splice(i, 1);
              this.endGame(false);
              continue;
            }
          }
          this.trashObjects.splice(i, 1);
          continue;
        }
      }

      // 렌더링
      this.renderTrashBubble(ctx, obj);
    }
  }

  /**
   * 개별 바다쓰레기 방울을 만화풍의 반투명 원형 버블로 렌더링
   * 🌟 거울 모드(mirror-active) 상태를 감지하여 텍스트와 이모지를 scale(-1, 1)로 역반전합니다!
   */
  renderTrashBubble(ctx, obj) {
    const isMirrored = this.isMirrored();

    ctx.save();

    // 1. 방울 외곽 발광 효과
    ctx.shadowColor = obj.color;
    ctx.shadowBlur = 20;

    // 2. 반투명 버블 구체 배경
    const grad = ctx.createRadialGradient(
      obj.x - obj.radius * 0.3,
      obj.y - obj.radius * 0.3,
      obj.radius * 0.1,
      obj.x,
      obj.y,
      obj.radius
    );
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.35, `${obj.color}66`);
    grad.addColorStop(0.85, `${obj.color}22`);
    grad.addColorStop(1, `${obj.color}99`);

    ctx.beginPath();
    ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // 3. 버블 테두리 선
    ctx.strokeStyle = obj.color;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 4. 버블 상단 하이라이트 광택
    ctx.beginPath();
    ctx.arc(obj.x - obj.radius * 0.35, obj.y - obj.radius * 0.35, obj.radius * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fill();

    // ------------------------------------------------------------------------
    // 🌟 5. [거울 모드 텍스트 & 이모지 반전 보정 렌더링]
    // 캔버스 전체가 CSS transform: scaleX(-1) 되어 있으므로,
    // 방울 중심 좌표에서 scale(-1, 1)을 한 번 더 적용하여 글자가 똑바로 보이게 만듭니다!
    // ------------------------------------------------------------------------
    ctx.save();
    ctx.translate(obj.x, obj.y);
    if (isMirrored) {
      ctx.scale(-1, 1);
    }

    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // (A) 중앙 큼직한 이모지 아이콘 (1학년 맞춤형 대형 폰트)
    ctx.font = `${Math.round(obj.radius * 0.88)}px sans-serif`;
    ctx.fillText(obj.icon, 0, -obj.radius * 0.15);

    // (B) 하단 텍스트 라벨 (선명한 한글 이름)
    ctx.font = `900 ${Math.round(obj.radius * 0.28)}px 'Noto Sans KR', sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(2, 26, 54, 0.95)';
    ctx.lineWidth = 4;
    ctx.strokeText(obj.label, 0, obj.radius * 0.52);
    ctx.fillText(obj.label, 0, obj.radius * 0.52);

    ctx.restore(); // 텍스트 역반전 복원
    ctx.restore(); // 방울 상태 복원
  }

  /**
   * 파티클 시스템 업데이트 및 렌더링
   */
  updateAndRenderParticles(ctx) {
    for (let i = this.splashParticles.length - 1; i >= 0; i--) {
      const p = this.splashParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18; // 중력
      p.alpha -= 0.022;

      if (p.alpha <= 0) {
        this.splashParticles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * 사용자의 손끝에 빛나는 물빛 수호 링 렌더링
   */
  renderFingerGlow(ctx, fingerPoints, timestamp) {
    if (!fingerPoints || fingerPoints.length === 0) return;

    for (const pt of fingerPoints) {
      ctx.save();

      // 바깥쪽 펄스 링
      const pulse = 1 + Math.sin(timestamp * 0.008) * 0.2;
      const ringRadius = 28 * pulse;

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ringRadius, 0, Math.PI * 2);
      ctx.strokeStyle = '#00f5d4';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#00f5d4';
      ctx.shadowBlur = 18;
      ctx.stroke();

      // 안쪽 에메랄드 코어
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 14;
      ctx.fill();

      ctx.restore();
    }
  }

  /**
   * 게임 종료 (승리 또는 패배) 처리 및 성적표 모달 오픈
   * @param {boolean} isVictory - 승리 여부
   */
  endGame(isVictory) {
    this.currentState = isVictory ? this.STATE.VICTORY : this.STATE.GAME_OVER;

    if (this.gameStartBtn) {
      this.gameStartBtn.classList.add('btn-primary');
      this.gameStartBtn.classList.remove('btn-tool');
      if (this.gameStartText) this.gameStartText.textContent = '다시 도전!';
    }

    if (isVictory) {
      this.updateTurtleMood('superhero', '우리가 바다를 완벽히 구했어! 바다거북 영웅 만세! 👑🌊');
      if (this.soundEngine) this.soundEngine.playVictory();
      this.showNotification('🎉 축하합니다! 푸른 바다를 지켜냈습니다!', '👑', 4000);
    } else {
      this.updateTurtleMood('crying', '바다가 쓰레기로 가득 찼어... 한 번 더 도와줘! 😭');
      if (this.soundEngine) this.soundEngine.playGameOver();
      this.showNotification('😢 바다 청정도가 모두 떨어졌습니다. 다시 도전해 보세요!', '🌊', 4000);
    }

    // 결과 성적표 모달 채우기
    this.showResultModal(isVictory);
  }

  /**
   * 결과 모달(해양 생태계 수호자 인증서) 데이터 바인딩 및 표시
   */
  showResultModal(isVictory) {
    if (!this.resultModal) return;

    if (this.modalTitle) {
      this.modalTitle.textContent = isVictory ? '해양 생태계 수호자 인증서' : '바다 지킴이 도전 결과';
    }

    if (this.modalSubtitle) {
      this.modalSubtitle.textContent = isVictory
        ? '푸른 바다의 해양 쓰레기를 수거하여 바다 생물들을 훌륭하게 구했습니다!'
        : '아쉽게 바다 청정도가 떨어졌지만, 거북이와 물고기들을 위해 다시 도전해 보세요!';
    }

    if (this.resultEmblem) {
      this.resultEmblem.textContent = isVictory ? '🌊' : '🐢';
    }

    // 등급 산출
    let rank = 'RANK B';
    let title = '새싹 바다 친구 🌱';
    if (this.trashScore >= 250 && this.oceanHealth >= 70) {
      rank = 'RANK S';
      title = '최고의 바다 수호신 🎖️';
    } else if (this.trashScore >= 150) {
      rank = 'RANK A';
      title = '푸른 바다 영웅 🐬';
    } else if (this.trashScore >= 80) {
      rank = 'RANK B';
      title = '용감한 바다 지킴이 🐢';
    } else {
      rank = 'RANK C';
      title = '성장하는 바다 친구 🐣';
    }

    if (this.resultRankBadge) this.resultRankBadge.textContent = rank;
    if (this.finalScore) this.finalScore.textContent = this.trashScore;
    if (this.finalHealth) this.finalHealth.textContent = Math.round(this.oceanHealth);
    if (this.finalTitle) this.finalTitle.textContent = title;

    if (this.finalTurtleStatus) {
      this.finalTurtleStatus.textContent = isVictory
        ? '맑은 바다에서 신나게 헤엄치는 중 🐢✨'
        : '친구의 재도전을 간절히 기다리는 중 🥺';
    }

    if (this.finalEducateMessage) {
      this.finalEducateMessage.textContent = isVictory
        ? `여러분의 눈부신 활약으로 ${this.trashScore}kg의 해양 쓰레기를 수거하여 바다거북과 아기 물고기들이 평화롭게 숨 쉴 수 있게 되었습니다! 일상 속에서도 플라스틱 빨대 줄이기와 분리수거에 동참해 주세요!`
        : `바다에 버려진 쓰레기는 썩는 데 수백 년이 걸립니다. 다시 도전하여 거북이의 맑은 바다를 되찾아 주세요!`;
    }

    this.resultModal.classList.remove('hidden');
  }
}
