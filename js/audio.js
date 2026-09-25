/**
 * ==============================================================================
 * [북극 빙하 지킴이] Web Audio API 기반 사운드 신디사이저 엔진 (SoundEngine)
 * ==============================================================================
 * 파일명: js/audio.js
 * 
 * 💡 [교육자 및 개발자를 위한 안내]
 *   - 본 모듈은 외부 mp3, wav 같은 별도의 오디오 파일 없이, 브라우저에 내장된
 *     "Web Audio API(오디오 신디사이저)"를 100% 활용하여 모든 효과음을 수학적 파형으로 직접 합성합니다.
 *   - 파일 다운로드 지연(레이턴시)이나 오디오 파일 누락(404 에러) 위험이 전혀 없으며,
 *     손끝이 닿는 즉시 0.001초의 지연도 없이 상쾌한 피드백 사운드를 재생합니다.
 *   - 최신 웹 브라우저의 '자동재생 정책(Autoplay Policy)'을 준수하여, 사용자가 화면을
 *     처음 클릭하거나 터치할 때 안전하게 오디오 컨텍스트가 활성화되도록 설계되었습니다.
 * ==============================================================================
 */

export class SoundEngine {
  /**
   * 사운드 엔진 생성자
   * 음향 시스템의 기본 볼륨과 마스터 게인 노드를 준비합니다.
   */
  constructor() {
    // Web Audio API의 심장인 AudioContext (브라우저 호환성을 위해 webkit 접두사 지원)
    this.AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = null;              // 실제 오디오 컨텍스트 인스턴스 (최초 사용자 동작 시 생성/활성화)
    this.masterGain = null;       // 전체 볼륨을 총괄하는 마스터 게인 노드

    // 사운드 설정 상태 변수
    this.isMuted = false;         // 음소거 여부 (기본: 소리 켬)
    this.masterVolume = 0.75;     // 기본 마스터 볼륨 (0.0 ~ 1.0, 너무 크지 않은 편안한 75%)
    this.isInitialized = false;   // 오디오 엔진 초기화 완료 플래그

    // 백색 소음(폭발음, 바람소리 등에 사용) 생성을 위한 오디오 버퍼 캐시
    this.noiseBuffer = null;

    // 브라우저의 오디오 자동재생 차단을 해제하기 위한 사용자 첫 인터랙션 감지 바인딩
    this._handleFirstUserGesture = this._handleFirstUserGesture.bind(this);
    this._attachGestureListeners();
  }

  /**
   * --------------------------------------------------------------------------
   * 1. 브라우저 오디오 컨텍스트 초기화 및 자동재생 정책 대응
   * --------------------------------------------------------------------------
   */

  /**
   * 화면 클릭, 터치, 키보드 입력 등 첫 인터랙션 시 호출되어 오디오 컨텍스트를 즉시 활성화합니다.
   * @private
   */
  _handleFirstUserGesture() {
    this.init();
    // 한 번 활성화된 후에는 이벤트 리스너를 깨끗하게 제거하여 메모리 누수를 방지합니다.
    const gestureEvents = ['click', 'touchstart', 'keydown', 'mousedown'];
    gestureEvents.forEach(evt => {
      document.removeEventListener(evt, this._handleFirstUserGesture);
    });
  }

  /**
   * 사용자의 첫 입력(클릭, 터치 등)을 감지하기 위한 이벤트 리스너를 등록합니다.
   * @private
   */
  _attachGestureListeners() {
    const gestureEvents = ['click', 'touchstart', 'keydown', 'mousedown'];
    gestureEvents.forEach(evt => {
      document.addEventListener(evt, this._handleFirstUserGesture, { once: true, passive: true });
    });
  }

  /**
   * 사운드 엔진을 초기화하고 AudioContext를 활성화합니다.
   * 게임 시작 버튼 클릭 시 명시적으로 호출할 수도 있습니다.
   * @returns {boolean} 초기화 성공 여부
   */
  init() {
    if (!this.AudioContextClass) {
      console.warn('⚠️ [사운드 엔진] 현재 브라우저는 Web Audio API를 지원하지 않습니다.');
      return false;
    }

    try {
      if (!this.ctx) {
        // 새 오디오 컨텍스트 생성
        this.ctx = new this.AudioContextClass();

        // 1. 마스터 볼륨 조절 노드 생성 및 최종 출력단(스피커)에 연결
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);

        // 2. 폭발음 및 얼음 녹는 소리에 사용할 백색 소음(White Noise) 버퍼 미리 합성
        this._createNoiseBuffer();

        this.isInitialized = true;
        console.log('🔊 [사운드 엔진] Web Audio API 신디사이저가 활성화되었습니다.');
      }

      // 오디오 컨텍스트가 일시정지(suspended) 상태인 경우 깨우기
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      return true;
    } catch (error) {
      console.error('❌ [사운드 엔진] 오디오 컨텍스트 초기화 실패:', error);
      return false;
    }
  }

  /**
   * 오디오 컨텍스트가 정상 작동 중인지 확인하고 준비하는 안전장치
   * @private
   * @returns {boolean}
   */
  _ensureReady() {
    if (!this.ctx) {
      this.init();
    } else if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx && !this.isMuted;
  }

  /**
   * 폭발음 및 스팀 효과음에 재사용할 2초 분량의 백색 소음(White Noise) 버퍼를 사전 합성합니다.
   * 매번 연산하지 않고 메모리에 캐싱하여 초고속 무지연 출력을 실현합니다.
   * @private
   */
  _createNoiseBuffer() {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 2; // 2초 분량
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    // -1.0 ~ 1.0 사이의 무작위 값으로 노이즈 데이터 채우기
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  /**
   * --------------------------------------------------------------------------
   * 2. 필수 신디사이저 사운드 합성 메서드
   * --------------------------------------------------------------------------
   */

  /**
   * [사운드 1] playPop()
   * 온실가스(CO2, CH4) 방울을 터뜨렸을 때 나는 상쾌하고 찰진 '뽁!' 소리입니다.
   * 
   * [신디사이저 원리]
   * - 사인파(Sine Wave)를 사용하고, 주파수를 약 750Hz에서 80Hz로 0.09초 동안
   *   아주 빠르게 지수 감쇄(Pitch Drop)시켜 통통 튀는 비눗방울 파열음을 만듭니다.
   */
  playPop() {
    if (!this._ensureReady()) return;

    try {
      const now = this.ctx.currentTime;

      // 1. 오실레이터(발진기) 생성: 순수하고 맑은 사인파
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';

      // 2. 순간 볼륨 조절을 위한 엔벨로프 게인 노드
      const gain = this.ctx.createGain();

      // 3. 주파수 급하강 (Pitch Drop Envelope): 750Hz -> 80Hz (0.09초)
      // 사람 귀에 경쾌한 '뽁!' 느낌을 주는 최적의 곡선
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.09);

      // 4. 볼륨 엔벨로프 (빠른 어택과 지수형 디케이)
      gain.gain.setValueAtTime(0.7, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      // 5. 오디오 그래프 연결: osc -> gain -> masterGain -> 스피커
      osc.connect(gain);
      gain.connect(this.masterGain);

      // 6. 소리 시작 및 종료 (메모리 누수 방지 자동 stop)
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {
      console.warn('playPop 사운드 합성 오류:', e);
    }
  }

  /**
   * [사운드 2] playIceChime()
   * 눈꽃/얼음(ICE) 방울을 터치하여 빙하를 회복시켰을 때 울리는
   * '샤랑~' 하는 맑고 영롱한 크리스탈 수정 벨 화음입니다.
   * 
   * [신디사이저 원리]
   * - 4개의 고음 옥타브 화음(C6, E6, G6, C7)을 미세한 시간차(아르페지오)로
   *   연이어 울려 퍼지게 하여 신비로운 얼음 요정의 마법 같은 사운드를 합성합니다.
   */
  playIceChime() {
    if (!this._ensureReady()) return;

    try {
      const now = this.ctx.currentTime;
      // 맑고 찬란한 C 메이저 아르페지오 주파수 (Hz): C6(1046Hz), E6(1318Hz), G6(1568Hz), C7(2093Hz)
      const notes = [1046.5, 1318.5, 1568.0, 2093.0];

      notes.forEach((freq, index) => {
        // 각 음마다 0.045초씩 시간차를 두어 흩뿌려지는 종소리 연출
        const noteStartTime = now + (index * 0.045);
        const duration = 0.5; // 은은하게 퍼지는 여운 길이

        // 오실레이터: 부드러운 사인파 + 맑은 고주파
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, noteStartTime);

        // 벨 특유의 금속성 뉘앙스를 위해 아주 미세한 피치 상승 효과
        osc.frequency.exponentialRampToValueAtTime(freq * 1.01, noteStartTime + duration);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, noteStartTime);
        // 즉각적인 어택
        gain.gain.linearRampToValueAtTime(0.35, noteStartTime + 0.015);
        // 부드럽고 맑은 지수 감쇄 (Ring Decay)
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStartTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(noteStartTime);
        osc.stop(noteStartTime + duration + 0.05);
      });
    } catch (e) {
      console.warn('playIceChime 사운드 합성 오류:', e);
    }
  }

  /**
   * [사운드 3] playExplosion()
   * 유독 매연 폭탄(BOMB)이 폭발했을 때 터져 나오는
   * '쾅-!' 하는 묵직하고 파괴적인 저음 폭발음입니다.
   * 
   * [신디사이저 원리]
   * - 강력한 백색 소음(White Noise)을 로우패스 필터로 깎아 불길의 파열음을 만들고,
   * - 동시에 서브 베이스(Sub-bass) 럼블 오실레이터를 180Hz에서 35Hz로 떨어뜨려
   *   가슴을 울리는 진동 타격감을 함께 블렌딩합니다.
   */
  playExplosion() {
    if (!this._ensureReady()) return;

    try {
      const now = this.ctx.currentTime;
      const duration = 0.65;

      // ------------------------------------------------------------------------
      // A. 서브 베이스 럼블 (지진처럼 묵직한 충격파 진동음)
      // ------------------------------------------------------------------------
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();

      subOsc.type = 'triangle'; // 펀치감이 있는 삼각파
      subOsc.frequency.setValueAtTime(180, now);
      subOsc.frequency.exponentialRampToValueAtTime(32, now + duration);

      subGain.gain.setValueAtTime(0.9, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      subOsc.connect(subGain);
      subGain.connect(this.masterGain);

      subOsc.start(now);
      subOsc.stop(now + duration + 0.05);

      // ------------------------------------------------------------------------
      // B. 필터링된 백색 소음 (화염과 파편이 튀는 파열음)
      // ------------------------------------------------------------------------
      if (this.noiseBuffer) {
        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = this.noiseBuffer;

        // 소음의 고주파를 깎아 폭탄 터지는 소리로 변환하는 저역 통과 필터(Low-pass)
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + duration);
        filter.Q.setValueAtTime(3.5, now); // 공명감 추가

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.85, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noiseNode.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.masterGain);

        noiseNode.start(now);
        noiseNode.stop(now + duration + 0.05);
      }
    } catch (e) {
      console.warn('playExplosion 사운드 합성 오류:', e);
    }
  }

  /**
   * [사운드 4] playGlacierMelt()
   * 온실가스가 바닥 빙하에 닿아 빙하가 녹아내릴 때의
   * 뜨거운 스팀 증기 소리와 경고 '쉬이익~' 사운드입니다.
   * 
   * [신디사이저 원리]
   * - 밴드패스(Band-pass) 필터를 거친 노이즈를 부드럽게 페이드인/아웃시켜
   *   얼음이 뜨거운 열기에 닿아 김이 피어오르는 듯한 소리를 합성합니다.
   */
  playGlacierMelt() {
    if (!this._ensureReady()) return;

    try {
      const now = this.ctx.currentTime;
      const duration = 0.38;

      if (this.noiseBuffer) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        // 특정 주파수 대역만 통과시키는 밴드패스 필터 (스팀 소리 효과)
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1400, now);
        filter.frequency.linearRampToValueAtTime(600, now + duration);
        filter.Q.setValueAtTime(1.8, now);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.45, now + 0.05); // 서서히 쉭~ 피어오름
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);

        noise.start(now);
        noise.stop(now + duration + 0.05);
      }

      // 차가운 얼음이 깨지는 듯한 미세한 고음 사인파 틱(Tick) 추가
      const tickOsc = this.ctx.createOscillator();
      const tickGain = this.ctx.createGain();
      tickOsc.type = 'sine';
      tickOsc.frequency.setValueAtTime(420, now);
      tickOsc.frequency.exponentialRampToValueAtTime(120, now + 0.15);

      tickGain.gain.setValueAtTime(0.2, now);
      tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      tickOsc.connect(tickGain);
      tickGain.connect(this.masterGain);

      tickOsc.start(now);
      tickOsc.stop(now + 0.16);
    } catch (e) {
      console.warn('playGlacierMelt 사운드 합성 오류:', e);
    }
  }

  /**
   * [사운드 5] playVictory()
   * 60초 동안 생존하여 빙하를 지켜냈을 때 울리는
   * 찬란하고 웅장한 '지구 환경 영웅 승리 팡파레'입니다!
   * 
   * [신디사이저 원리]
   * - 도-미-솔-도(C4 -> E4 -> G4 -> C5)로 상승하는 밝고 힘찬 아르페지오 후,
   *   마지막 고음 C5에서 화려하고 풍성한 화음이 길게 울려 퍼집니다.
   */
  playVictory() {
    if (!this._ensureReady()) return;

    try {
      const now = this.ctx.currentTime;

      // 팡파레 멜로디 구성 [주파수, 시작 딜레이, 지속시간, 볼륨]
      const notes = [
        { freq: 523.25, time: 0.00, dur: 0.18, vol: 0.4 },  // C5 (도)
        { freq: 659.25, time: 0.16, dur: 0.18, vol: 0.45 }, // E5 (미)
        { freq: 783.99, time: 0.32, dur: 0.22, vol: 0.5 },  // G5 (솔)
        { freq: 1046.50, time: 0.52, dur: 0.90, vol: 0.65 } // C6 (높은 도 - 길고 웅장한 마무리)
      ];

      notes.forEach(note => {
        const startTime = now + note.time;

        // 메인 리드 신스 (브라스 느낌의 톱니파 + 삼각파 블렌딩)
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, startTime);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(note.vol, startTime + 0.03); // 경쾌한 어택
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur); // 서스테인 & 디케이

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + note.dur + 0.05);
      });

      // 마지막 웅장한 마무리를 받쳐주는 따뜻한 화음 베이스 (C5 + G5 동시 발현)
      const chordDelay = 0.52;
      [523.25, 783.99].forEach(freq => {
        const chordOsc = this.ctx.createOscillator();
        chordOsc.type = 'sine';
        chordOsc.frequency.setValueAtTime(freq, now + chordDelay);

        const chordGain = this.ctx.createGain();
        chordGain.gain.setValueAtTime(0.001, now + chordDelay);
        chordGain.gain.linearRampToValueAtTime(0.3, now + chordDelay + 0.04);
        chordGain.gain.exponentialRampToValueAtTime(0.0001, now + chordDelay + 0.85);

        chordOsc.connect(chordGain);
        chordGain.connect(this.masterGain);

        chordOsc.start(now + chordDelay);
        chordOsc.stop(now + chordDelay + 0.9);
      });
    } catch (e) {
      console.warn('playVictory 사운드 합성 오류:', e);
    }
  }

  /**
   * [사운드 6] playGameOver()
   * 빙하 체력이 0이 되어 게임 오버되었을 때 나오는
   * 서글프고 아쉬운 단조(마이너) 하강 징글입니다.
   * 
   * [신디사이저 원리]
   * - 슬픈 감정을 자아내는 마이너 하강 음계(Eb4 -> D4 -> C4)로
   *   빙하가 녹아내려 울고 있는 북극곰의 안타까운 심정을 표현합니다.
   */
  playGameOver() {
    if (!this._ensureReady()) return;

    try {
      const now = this.ctx.currentTime;

      // 단조 하강 멜로디 [Eb4, D4, C4, Low Ab3]
      const notes = [
        { freq: 311.13, time: 0.00, dur: 0.32 }, // Eb4
        { freq: 293.66, time: 0.28, dur: 0.35 }, // D4
        { freq: 261.63, time: 0.58, dur: 0.40 }, // C4
        { freq: 207.65, time: 0.92, dur: 0.85 }  // Ab3 (쓸쓸한 저음 마무리)
      ];

      notes.forEach(note => {
        const startTime = now + note.time;

        const osc = this.ctx.createOscillator();
        osc.type = 'sine'; // 애잔한 휘파람 느낌의 사인파
        osc.frequency.setValueAtTime(note.freq, startTime);
        // 약간의 비브라토/슬라이드 다운
        osc.frequency.exponentialRampToValueAtTime(note.freq * 0.97, startTime + note.dur);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(0.4, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.dur);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(startTime);
        osc.stop(startTime + note.dur + 0.05);
      });
    } catch (e) {
      console.warn('playGameOver 사운드 합성 오류:', e);
    }
  }

  /**
   * [사운드 7] playBeep(isHigh)
   * 게임 시작 전 카운트다운(3, 2, 1)과 시작 신호음(GO!)을 울립니다.
   * 
   * @param {boolean} [isHigh=false] - true면 높은 시작음(880Hz), false면 일반 카운트다운(440Hz)
   */
  playBeep(isHigh = false) {
    if (!this._ensureReady()) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      // 일반 카운트다운: 440Hz (A4, 맑은 단음)
      // 게임 스타트: 880Hz (A5, 높은 옥타브의 상쾌한 시작음)
      const freq = isHigh ? 880 : 440;
      const duration = isHigh ? 0.22 : 0.12;

      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(isHigh ? 0.5 : 0.35, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + duration + 0.03);
    } catch (e) {
      console.warn('playBeep 사운드 합성 오류:', e);
    }
  }

  /**
   * --------------------------------------------------------------------------
   * 3. 볼륨 조절 및 음소거(Mute) 제어 메서드
   * --------------------------------------------------------------------------
   */

  /**
   * 사운드 음소거 상태를 켜거나 끕니다. (토글)
   * @returns {boolean} 변경된 음소거 상태 (true면 음소거 됨)
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    this._applyVolume();
    console.log(`🔊 [사운드 엔진] 음소거 상태 변경: ${this.isMuted ? '음소거 됨 (MUTE)' : '소리 켬 (UNMUTE)'}`);
    return this.isMuted;
  }

  /**
   * 명시적으로 음소거 여부를 설정합니다.
   * @param {boolean} muted - true면 음소거
   */
  setMute(muted) {
    this.isMuted = Boolean(muted);
    this._applyVolume();
  }

  /**
   * 마스터 볼륨을 설정합니다 (0.0 ~ 1.0)
   * @param {number} volume - 0.0(무음) ~ 1.0(최대)
   */
  setVolume(volume) {
    this.masterVolume = Math.max(0.0, Math.min(1.0, volume));
    this._applyVolume();
  }

  /**
   * 현재 설정된 마스터 볼륨 값을 반환합니다.
   * @returns {number} 0.0 ~ 1.0
   */
  getVolume() {
    return this.masterVolume;
  }

  /**
   * 오디오 그래프의 마스터 게인 노드에 볼륨을 즉각 반영합니다.
   * @private
   */
  _applyVolume() {
    if (this.masterGain && this.ctx) {
      const targetGain = this.isMuted ? 0 : this.masterVolume;
      // 갑작스러운 팝핑 노이즈(클릭음)를 방지하기 위해 0.02초 동안 부드럽게 전환
      this.masterGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.02);
    }
  }

  /**
   * UI 버튼 엘리먼트와 사운드 엔진을 자동으로 바인딩해 주는 편리한 헬퍼 함수
   * @param {Object} elements 
   * @param {HTMLElement|string} elements.button - 사운드 토글 버튼 (#toggleSoundBtn)
   * @param {HTMLElement|string} [elements.icon] - 사운드 아이콘 (#soundIcon)
   * @param {HTMLElement|string} [elements.text] - 사운드 텍스트 (#soundText)
   */
  bindUI({ button, icon, text } = {}) {
    const btnEl = typeof button === 'string' ? document.querySelector(button) : button;
    const iconEl = typeof icon === 'string' ? document.querySelector(icon) : icon;
    const textEl = typeof text === 'string' ? document.querySelector(text) : text;

    if (!btnEl) return;

    // UI 상태 갱신 함수
    const updateUIState = () => {
      if (this.isMuted) {
        if (iconEl) iconEl.textContent = '🔇';
        if (textEl) textEl.textContent = '사운드 OFF';
        btnEl.classList.remove('active');
        btnEl.setAttribute('aria-pressed', 'false');
      } else {
        if (iconEl) iconEl.textContent = '🔊';
        if (textEl) textEl.textContent = '사운드 ON';
        btnEl.classList.add('active');
        btnEl.setAttribute('aria-pressed', 'true');
      }
    };

    // 초기 UI 동기화
    updateUIState();

    // 클릭 시 토글 실행
    btnEl.addEventListener('click', (e) => {
      e.preventDefault();
      this.init(); // 사용자 클릭 시 오디오 컨텍스트 보장
      this.toggleMute();
      updateUIState();
      // 음소거 해제 시 기분 좋은 삐- 소리로 피드백 제공
      if (!this.isMuted) {
        this.playPop();
      }
    });
  }
}

// ES 모듈 기본 내보내기 제공
export default SoundEngine;
