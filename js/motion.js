/**
 * ==============================================================================
 * [북극 빙하 지킴이] 모션 인식 및 컴퓨터 비전 모듈 (MotionTracker)
 * ==============================================================================
 * 파일명: js/motion.js
 * 역할:
 *   - Google MediaPipe Tasks Vision (@mediapipe/tasks-vision) 최신 공식 CDN을 통해
 *     브라우저 내부 WebGL(GPU 가속) 기반으로 60fps 실시간 손동작을 추적합니다.
 *   - 사용자의 검지 손끝(8번), 엄지 손끝(4번), 손바닥 중심 등의 2D/3D 위치를 실시간 추출합니다.
 *   - 거울 모드(mirror-active) 상태를 감지하여 캔버스 및 물리 게임 좌표계와 일치하도록
 *     X축 좌표를 자동으로 반전 보정(x = 1.0 - x)합니다.
 *   - 손끝을 따라다니는 빛나는 '얼음빛 수호 링'(이중 회전 원형 궤적)과
 *     흩날리는 눈꽃/얼음 파티클 시각 효과를 캔버스에 화려하게 렌더링합니다.
 * ==============================================================================
 */

// Google MediaPipe Tasks Vision 최신 공식 브라우저 모듈 불러오기
import {
  HandLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";

/**
 * 손가락 랜드마크 인덱스 상수 정의
 * MediaPipe HandLandmarker는 손 하나당 총 21개의 관절 랜드마크(0~20)를 제공합니다.
 */
export const HAND_LANDMARKS = {
  WRIST: 0,              // 손목
  THUMB_CMC: 1,          // 엄지손가락 뿌리 관절
  THUMB_MCP: 2,          // 엄지손가락 첫째 관절
  THUMB_IP: 3,           // 엄지손가락 둘째 관절
  THUMB_TIP: 4,          // 엄지 손끝 (핀치 제스처 측정용)
  INDEX_FINGER_MCP: 5,   // 검지 뿌리 관절
  INDEX_FINGER_PIP: 6,   // 검지 첫째 마디
  INDEX_FINGER_DIP: 7,   // 검지 둘째 마디
  INDEX_FINGER_TIP: 8,   // 검지 손끝 (주 인터랙션 포인트: 온실가스 터뜨리기!)
  MIDDLE_FINGER_MCP: 9,  // 중지 뿌리 관절
  MIDDLE_FINGER_PIP: 10, // 중지 첫째 마디
  MIDDLE_FINGER_DIP: 11, // 중지 둘째 마디
  MIDDLE_FINGER_TIP: 12, // 중지 손끝
  RING_FINGER_MCP: 13,   // 약지 뿌리 관절
  RING_FINGER_PIP: 14,   // 약지 첫째 마디
  RING_FINGER_DIP: 15,   // 약지 둘째 마디
  RING_FINGER_TIP: 16,   // 약지 손끝
  PINKY_MCP: 17,         // 새끼손가락 뿌리 관절
  PINKY_PIP: 18,         // 새끼손가락 첫째 마디
  PINKY_DIP: 19,         // 새끼손가락 둘째 마디
  PINKY_TIP: 20          // 새끼 손끝
};

/**
 * 모션 인식 및 비전 처리를 전담하는 MotionTracker 클래스
 */
export class MotionTracker {
  /**
   * 모션 트래커 생성자
   * @param {Object} [options={}] 설정 옵션
   * @param {number} [options.maxNumHands=2] - 동시 추적 가능한 최대 손 개수 (양손 2개 기본)
   * @param {number} [options.minDetectionConfidence=0.5] - 손 인식 최소 신뢰도 (0.0 ~ 1.0)
   * @param {number} [options.minTrackingConfidence=0.5] - 연속 추적 최소 신뢰도 (0.0 ~ 1.0)
   * @param {boolean} [options.useGpu=true] - GPU(WebGL) 가속 사용 여부 (M2 Mac, iPad 최적화)
   */
  constructor(options = {}) {
    this.maxNumHands = options.maxNumHands || 2;
    this.minDetectionConfidence = options.minDetectionConfidence || 0.5;
    this.minTrackingConfidence = options.minTrackingConfidence || 0.5;
    this.useGpu = options.useGpu !== false;

    // MediaPipe 관련 인스턴스
    this.handLandmarker = null;
    this.isModelLoaded = false;
    this.isLoading = false;

    // 추적 루프 상태 변수
    this.isRunning = false;
    this.animationFrameId = null;
    this.videoElement = null;
    this.lastVideoTime = -1;

    // 모션 추적 콜백 함수
    this.onResultsCallback = null;

    // 거울 모드 감지용 타깃 컨테이너 (기본: #appContainer)
    this.appContainer = document.getElementById('appContainer');

    // 시각 효과용: 얼음 가루/눈꽃 파티클 보관 배열
    this.particles = [];
    this.maxParticles = 80;

    // 얼음빛 수호 링 애니메이션 회전 각도
    this.ringRotationAngle = 0;

    // 마지막으로 감지된 정제된 손 데이터 배열
    this.latestHands = [];

    // 바인딩
    this._trackingLoop = this._trackingLoop.bind(this);
  }

  /**
   * MediaPipe Tasks Vision WASM 런타임 및 HandLandmarker AI 모델을 비동기로 로드합니다.
   * @param {Function} [onProgress] - 로딩 상태 알림 콜백 (예: 'wasm 로드 중...', 'AI 모델 준비 완료')
   * @returns {Promise<boolean>} 로드 성공 여부
   */
  async init(onProgress = null) {
    if (this.isModelLoaded) {
      console.log('⚡ [모션인식] 이미 HandLandmarker 모델이 로드되어 있습니다.');
      return true;
    }

    if (this.isLoading) {
      console.warn('⏳ [모션인식] 모델 로딩이 이미 진행 중입니다.');
      return false;
    }

    this.isLoading = true;

    try {
      if (onProgress) onProgress('초경량 WebAssembly 비전 엔진 로딩 중...');
      console.log('📦 [모션인식] 1단계: MediaPipe Tasks Vision WASM 리졸버 준비 중...');

      // 1. WASM 바이너리 파일 경로 로드 (jsdelivr 공식 최신 CDN)
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      if (onProgress) onProgress('북극 수호자 손동작 AI 신경망 모델 로딩 중...');
      console.log('🤖 [모션인식] 2단계: HandLandmarker float16 경량화 모델 다운로드 중...');

      // 2. HandLandmarker 인스턴스 생성 (Google Cloud Storage 공식 호스팅 모델)
      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          // M2 Mac, iPhone, iPad, 고성능 PC에서 60fps를 유지하기 위해 GPU 위임자 지정
          delegate: this.useGpu ? 'GPU' : 'CPU'
        },
        runningMode: 'VIDEO', // 웹캠 실시간 비디오 스트림 전용 모드
        numHands: this.maxNumHands,
        minHandDetectionConfidence: this.minDetectionConfidence,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: this.minTrackingConfidence
      });

      this.isModelLoaded = true;
      console.log('✅ [모션인식] HandLandmarker 60fps AI 엔진이 성공적으로 준비되었습니다!');
      if (onProgress) onProgress('AI 모션 트래커 준비 완료!');
      return true;
    } catch (error) {
      console.error('❌ [모션인식] 모델 로딩 실패:', error);

      // 만약 WebGL/GPU 가속 실패 시 CPU 모드로 한 번 더 안전하게 재시도
      if (this.useGpu) {
        console.warn('⚠️ [모션인식] GPU 모드 실패. CPU 호환 모드로 재시도합니다...');
        this.useGpu = false;
        this.isLoading = false;
        return this.init(onProgress);
      }

      throw new Error(`MediaPipe 비전 엔진 로드 실패: ${error.message}`);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 단일 비디오 프레임에 대해 실시간 손동작을 즉시 감지합니다.
   * 통합 렌더 루프(app.js의 renderLoop 등)에서 매 프레임 직접 호출할 수 있습니다.
   * @param {HTMLVideoElement} [videoElement] - 분석할 비디오 엘리먼트 (생략 시 기존 참조 사용)
   * @param {number} [timestamp] - 현재 타임스탬프 (생략 시 performance.now())
   * @returns {Array<Object>} 감지 및 가공된 손 정보 배열
   */
  detect(videoElement = null, timestamp = null) {
    if (!this.isModelLoaded || !this.handLandmarker) {
      return this.latestHands;
    }

    const video = videoElement || this.videoElement;
    if (!video || video.readyState < 2 || video.paused) {
      return this.latestHands;
    }

    const timeMs = timestamp !== null ? timestamp : performance.now();

    // 새 프레임이 도착했을 때만 AI 추론 실행
    if (video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime;

      try {
        const detectionResult = this.handLandmarker.detectForVideo(video, timeMs);
        const processedHands = this._processDetectionResult(detectionResult);
        this.latestHands = processedHands;

        // 파티클 및 링 회전 갱신
        this._updateParticles(processedHands);
        this.ringRotationAngle = (this.ringRotationAngle + 0.04) % (Math.PI * 2);

        if (typeof this.onResultsCallback === 'function') {
          this.onResultsCallback({
            hands: processedHands,
            rawResult: detectionResult,
            timestamp: timeMs,
            isMirrored: this.isMirrored()
          });
        }
      } catch (err) {
        console.warn('⚠️ [모션인식] 단일 프레임 감지 중 오류:', err);
      }
    }

    return this.latestHands;
  }

  /**
   * 현재 감지된 손들의 인터랙션 포인트(검지/엄지 손끝) 목록을 픽셀 좌표로 환산하여 반환합니다.
   * @param {number} canvasWidth - 캔버스 너비
   * @param {number} canvasHeight - 캔버스 높이
   * @returns {Array<{x: number, y: number, radius: number, isPinching: boolean, type: string}>}
   */
  getFingerPoints(canvasWidth, canvasHeight) {
    const isMirrored = this.isMirrored();
    const points = [];

    this.latestHands.forEach(hand => {
      if (hand.indexTip) {
        const px = (isMirrored ? hand.indexTip.rawX : hand.indexTip.x) * canvasWidth;
        const py = hand.indexTip.y * canvasHeight;
        points.push({
          x: px,
          y: py,
          radius: hand.isPinching ? 38 : 26,
          isPinching: hand.isPinching,
          type: 'INDEX'
        });
      }

      if (hand.thumbTip && hand.isPinching) {
        const px = (isMirrored ? hand.thumbTip.rawX : hand.thumbTip.x) * canvasWidth;
        const py = hand.thumbTip.y * canvasHeight;
        points.push({
          x: px,
          y: py,
          radius: 24,
          isPinching: true,
          type: 'THUMB'
        });
      }
    });

    return points;
  }

  /**
   * 실시간 손동작 추적 루프를 시작합니다.
   * @param {HTMLVideoElement} videoElement - 웹캠 영상이 재생되고 있는 비디오 엘리먼트
   * @param {Function} onResults - 매 프레임마다 분석된 손 좌표 데이터를 전달받을 콜백 함수
   */
  start(videoElement, onResults = null) {
    if (!this.isModelLoaded) {
      throw new Error('모션 트래커가 아직 초기화되지 않았습니다. init()을 먼저 호출해 주세요.');
    }

    if (!videoElement) {
      throw new Error('유효한 웹캠 비디오 엘리먼트가 제공되지 않았습니다.');
    }

    this.videoElement = videoElement;
    this.onResultsCallback = onResults;
    this.isRunning = true;
    this.lastVideoTime = -1;

    console.log('🚀 [모션인식] 60fps 실시간 모션 추적 루프를 시작합니다.');
    // requestAnimationFrame을 활용하여 브라우저 화면 주사율(60~120Hz)에 맞춰 비동기 루프 실행
    this.animationFrameId = requestAnimationFrame(this._trackingLoop);
  }

  /**
   * 추적 루프를 일시정지 또는 중지합니다.
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.latestHands = [];
    console.log('⏹️ [모션인식] 모션 추적 루프가 중지되었습니다.');
  }

  /**
   * 매 화면 프레임마다 실행되는 내부 추적 루프
   * @private
   */
  _trackingLoop() {
    if (!this.isRunning) return;

    const video = this.videoElement;

    // 비디오가 정상적으로 재생 중이고 새로운 프레임이 도착했을 때만 AI 추론 실행
    // (동일 프레임을 불필요하게 중복 분석하지 않아 배터리와 CPU를 크게 절약합니다)
    if (
      video &&
      video.readyState >= 2 &&
      !video.paused &&
      video.currentTime !== this.lastVideoTime
    ) {
      this.lastVideoTime = video.currentTime;
      const startTimeMs = performance.now();

      try {
        // MediaPipe Tasks Vision의 핵심 API: detectForVideo
        const detectionResult = this.handLandmarker.detectForVideo(video, startTimeMs);

        // 결과 데이터를 게임 및 캔버스에서 다루기 편하도록 가공/정제
        const processedHands = this._processDetectionResult(detectionResult);
        this.latestHands = processedHands;

        // 파티클 시스템 업데이트 (손끝의 움직임에 따라 눈꽃 파티클 생성)
        this._updateParticles(processedHands);

        // 수호 링 회전 애니메이션 각도 증가
        this.ringRotationAngle = (this.ringRotationAngle + 0.04) % (Math.PI * 2);

        // 등록된 콜백 함수가 있으면 결과 전송
        if (typeof this.onResultsCallback === 'function') {
          this.onResultsCallback({
            hands: processedHands,
            rawResult: detectionResult,
            timestamp: startTimeMs,
            isMirrored: this.isMirrored()
          });
        }
      } catch (err) {
        console.warn('⚠️ [모션인식] 프레임 감지 중 일시적 오류:', err);
      }
    }

    // 다음 화면 갱신 주기에 맞춰 자기 자신을 다시 호출
    this.animationFrameId = requestAnimationFrame(this._trackingLoop);
  }

  /**
   * 현재 거울 모드(좌우 반전)가 활성화되어 있는지 여부를 판별합니다.
   * #appContainer 클래스에 'mirror-active'가 포함되어 있는지 확인합니다.
   * @returns {boolean} 거울 모드 여부
   */
  isMirrored() {
    if (this.appContainer) {
      return this.appContainer.classList.contains('mirror-active');
    }
    return false;
  }

  /**
   * MediaPipe의 날것(Raw) 결과를 게임과 상호작용하기 쉬운 친절한 구조체로 변환합니다.
   * 특히 거울 모드 시 X축 좌표 반전 보정(x = 1.0 - x)을 정밀하게 적용합니다.
   * @private
   * @param {Object} result - MediaPipe HandLandmarker 감지 결과
   * @returns {Array<Object>} 정제된 손 정보 배열
   */
  _processDetectionResult(result) {
    if (!result || !result.landmarks || result.landmarks.length === 0) {
      return [];
    }

    const isMirrored = this.isMirrored();

    return result.landmarks.map((landmarks, handIndex) => {
      // 1. 손잡이 정보 (왼손인지 오른손인지)
      let handedness = 'Unknown';
      let handScore = 1.0;
      if (result.handednesses && result.handednesses[handIndex] && result.handednesses[handIndex][0]) {
        handedness = result.handednesses[handIndex][0].categoryName; // 'Left' or 'Right'
        handScore = result.handednesses[handIndex][0].score;
      }

      // 2. 주요 랜드마크 포인트 안전 추출 함수
      const getPoint = (index) => {
        const raw = landmarks[index];
        if (!raw) return { x: 0, y: 0, z: 0, rawX: 0, rawY: 0, rawZ: 0 };

        // [거울 모드 X축 좌표 보정 핵심 로직]
        // 카메라 영상이 CSS scaleX(-1)로 거울 반전되어 표시되고 있을 때,
        // 사용자가 보는 화면 상의 위치(사용자 손이 있는 위치)와 게임 좌표를 정확히 일치시키려면
        // x좌표를 (1.0 - raw.x)로 뒤집어 주어야 합니다.
        const correctedX = isMirrored ? (1.0 - raw.x) : raw.x;

        return {
          x: correctedX,            // 화면 및 게임 로직 기준 정규화 좌표 (0.0 ~ 1.0)
          y: raw.y,                 // 정규화 Y 좌표 (0.0 ~ 1.0)
          z: raw.z,                 // 카메라와의 상대적 깊이값 (작을수록 카메라와 가까움)
          rawX: raw.x,              // 미디어파이프 원본 정규화 X (반전되지 않은 원본 센서 좌표)
          rawY: raw.y,
          rawZ: raw.z
        };
      };

      // 3. 주요 관심 관절 포인트 추출
      const indexTip = getPoint(HAND_LANDMARKS.INDEX_FINGER_TIP); // 8번: 검지 손끝
      const thumbTip = getPoint(HAND_LANDMARKS.THUMB_TIP);        // 4번: 엄지 손끝
      const middleTip = getPoint(HAND_LANDMARKS.MIDDLE_FINGER_TIP); // 12번: 중지 손끝
      const wrist = getPoint(HAND_LANDMARKS.WRIST);               // 0번: 손목

      // 4. 손바닥 중심(Palm Center) 계산: 손목과 손가락 뿌리 관절들의 기하학적 평균값
      const mcp5 = getPoint(HAND_LANDMARKS.INDEX_FINGER_MCP);
      const mcp9 = getPoint(HAND_LANDMARKS.MIDDLE_FINGER_MCP);
      const mcp13 = getPoint(HAND_LANDMARKS.RING_FINGER_MCP);
      const mcp17 = getPoint(HAND_LANDMARKS.PINKY_MCP);

      const palmCenter = {
        x: (wrist.x + mcp5.x + mcp9.x + mcp13.x + mcp17.x) / 5,
        y: (wrist.y + mcp5.y + mcp9.y + mcp13.y + mcp17.y) / 5,
        z: (wrist.z + mcp5.z + mcp9.z + mcp13.z + mcp17.z) / 5,
        rawX: (wrist.rawX + mcp5.rawX + mcp9.rawX + mcp13.rawX + mcp17.rawX) / 5,
        rawY: (wrist.rawY + mcp5.rawY + mcp9.rawY + mcp13.rawY + mcp17.rawY) / 5,
        rawZ: (wrist.rawZ + mcp5.rawZ + mcp9.rawZ + mcp13.rawZ + mcp17.rawZ) / 5
      };

      // 5. 엄지와 검지 손끝 사이의 거리 계산 (핀치 제스처 판정용)
      const dx = indexTip.x - thumbTip.x;
      const dy = indexTip.y - thumbTip.y;
      const pinchDistance = Math.sqrt(dx * dx + dy * dy);
      // 거리가 약 0.08 미만이면 손가락을 맞댄 '핀치(Pinch)' 상태로 판정
      const isPinching = pinchDistance < 0.08;

      // 6. 모든 21개 랜드마크를 보정 좌표가 포함된 형태로 매핑
      const allLandmarks = landmarks.map((_, i) => getPoint(i));

      return {
        handIndex,
        handedness,
        handScore,
        indexTip,
        thumbTip,
        middleTip,
        wrist,
        palmCenter,
        pinchDistance,
        isPinching,
        landmarks: allLandmarks
      };
    });
  }

  /**
   * 손끝의 움직임에 반응하여 반짝이는 얼음 가루/눈꽃 파티클을 생성하고 갱신합니다.
   * @private
   * @param {Array<Object>} hands 
   */
  _updateParticles(hands) {
    // 1. 각 손의 검지 손끝 위치에서 무작위 파티클 생성
    hands.forEach(hand => {
      if (this.particles.length < this.maxParticles) {
        // 손가락이 핀치 상태이면 더 많은 파티클 방출 (얼음 결계 활성화 연출)
        const spawnCount = hand.isPinching ? 3 : 1;

        for (let i = 0; i < spawnCount; i++) {
          this.particles.push({
            x: hand.indexTip.x,
            y: hand.indexTip.y,
            rawX: hand.indexTip.rawX,
            rawY: hand.indexTip.rawY,
            // 흩날리는 속도 (무작위 미세 속도)
            vx: (Math.random() - 0.5) * 0.006,
            vy: (Math.random() - 0.5) * 0.006 - 0.002, // 살짝 위로 떠오름
            size: Math.random() * 5 + 3,               // 파티클 크기
            alpha: 1.0,                                // 투명도 (서서히 사라짐)
            decay: Math.random() * 0.03 + 0.02,        // 감소율
            color: Math.random() > 0.4 ? '#00f2fe' : '#00ffcc', // 빙하 시안 or 오로라 민트
            rotation: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.1
          });
        }
      }
    });

    // 2. 기존 파티클 위치 이동 및 수명 차감
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      p.rotation += p.rotSpeed;

      // 수명이 다한 파티클은 배열에서 제거
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  /**
   * ============================================================================
   * [시각 효과 렌더링 헬퍼 함수]
   * 캔버스 위에 손끝을 따라다니는 찬란한 '얼음빛 수호 링'과 눈꽃 파티클을 그립니다.
   * ============================================================================
   * @param {CanvasRenderingContext2D} ctx - 렌더링할 2D 캔버스 컨텍스트
   * @param {number} canvasWidth - 캔버스 가로 픽셀 크기
   * @param {number} canvasHeight - 캔버스 세로 픽셀 크기
   * @param {Object} [options={}] 추가 스타일 옵션
   */
  renderGuardianOverlay(ctx, canvasWidth, canvasHeight, options = {}) {
    if (!ctx || canvasWidth <= 0 || canvasHeight <= 0) return;

    // 옵션 기본값
    const showSkeleton = options.showSkeleton !== false; // 손가락 뼈대 연결선 표시 여부
    const showRing = options.showRing !== false;         // 얼음빛 수호 링 표시 여부
    const showParticles = options.showParticles !== false; // 파티클 표시 여부

    const hands = this.latestHands;
    const isMirrored = this.isMirrored();

    ctx.save();

    // --------------------------------------------------------------------------
    // 1. 손가락 관절을 잇는 얼음 수정 뼈대선(Skeleton) 렌더링
    // --------------------------------------------------------------------------
    if (showSkeleton && hands.length > 0) {
      this._drawHandSkeletons(ctx, hands, canvasWidth, canvasHeight, isMirrored);
    }

    // --------------------------------------------------------------------------
    // 2. 흩날리는 얼음 가루 & 눈꽃 파티클 렌더링
    // --------------------------------------------------------------------------
    if (showParticles && this.particles.length > 0) {
      this._drawParticles(ctx, canvasWidth, canvasHeight, isMirrored);
    }

    // --------------------------------------------------------------------------
    // 3. 검지 손끝 주위에 펼쳐지는 '얼음빛 수호 링' (이중 회전 결계 궤적) 렌더링
    // --------------------------------------------------------------------------
    if (showRing && hands.length > 0) {
      hands.forEach(hand => {
        this._drawGuardianRing(ctx, hand, canvasWidth, canvasHeight, isMirrored);
      });
    }

    ctx.restore();
  }

  /**
   * 손가락 관절들을 반투명 네온 선으로 연결하는 뼈대 그리기
   * @private
   */
  _drawHandSkeletons(ctx, hands, width, height, isMirrored) {
    // MediaPipe 손가락 관절 연결 구조 정의 (5개 손가락 체인)
    const CONNECTIONS = [
      // 엄지
      [0, 1], [1, 2], [2, 3], [3, 4],
      // 검지
      [0, 5], [5, 6], [6, 7], [7, 8],
      // 중지
      [0, 9], [9, 10], [10, 11], [11, 12],
      // 약지
      [0, 13], [13, 14], [14, 15], [15, 16],
      // 새끼
      [0, 17], [17, 18], [18, 19], [19, 20],
      // 손바닥 가로 연결선
      [5, 9], [9, 13], [13, 17]
    ];

    hands.forEach(hand => {
      // 연결선 그리기 (은은한 북극 오로라 블루)
      ctx.strokeStyle = 'rgba(79, 172, 254, 0.45)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      CONNECTIONS.forEach(([startIndex, endIndex]) => {
        const startPoint = hand.landmarks[startIndex];
        const endPoint = hand.landmarks[endIndex];
        if (!startPoint || !endPoint) return;

        // 화면 픽셀 좌표 계산
        const x1 = (isMirrored ? startPoint.rawX : startPoint.x) * width;
        const y1 = startPoint.y * height;
        const x2 = (isMirrored ? endPoint.rawX : endPoint.x) * width;
        const y2 = endPoint.y * height;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      // 주요 관절 마디마다 작은 얼음 보석 점 찍기
      hand.landmarks.forEach((point, idx) => {
        // 손끝(Tip)은 수호 링에서 더 크게 강조하므로 작은 점은 제외
        if ([4, 8, 12, 16, 20].includes(idx)) return;

        const px = (isMirrored ? point.rawX : point.x) * width;
        const py = point.y * height;

        ctx.fillStyle = 'rgba(0, 242, 254, 0.65)';
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  /**
   * 얼음 가루 파티클 렌더링
   * @private
   */
  _drawParticles(ctx, width, height, isMirrored) {
    this.particles.forEach(p => {
      const px = (isMirrored ? p.rawX : p.x) * width;
      const py = p.y * height;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(px, py);
      ctx.rotate(p.rotation);

      // 다이아몬드/십자 모양의 반짝이는 눈꽃 결정 그리기
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.color;

      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.4, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.4, 0);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    });
  }

  /**
   * 검지 손끝 주변에 빛나는 '얼음빛 수호 링' 그리기
   * @private
   */
  _drawGuardianRing(ctx, hand, width, height, isMirrored) {
    const tip = hand.indexTip;
    if (!tip) return;

    // 캔버스 상의 픽셀 좌표
    // ※ CSS에 scaleX(-1)이 걸려 있는 환경에서는 원본 rawX 좌표를 써야
    // 브라우저 렌더링 단계에서 반전되어 제자리에 나타납니다.
    const cx = (isMirrored ? tip.rawX : tip.x) * width;
    const cy = tip.y * height;

    const angle = this.ringRotationAngle;
    const isPinching = hand.isPinching;

    // 핀치(엄지+검지 맞댐) 상태이면 수호 링이 크게 확장되며 강력한 실드 효과 발생
    const baseRadius = isPinching ? 38 : 26;
    const pulse = Math.sin(angle * 4) * 2.5; // 살짝 숨쉬듯 뛰는 박동 효과
    const radius = baseRadius + pulse;

    ctx.save();
    ctx.translate(cx, cy);

    // 1. 중앙 얼음빛 광채 코어 (손끝 발광 효과)
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.5);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    gradient.addColorStop(0.3, isPinching ? 'rgba(0, 255, 204, 0.7)' : 'rgba(0, 242, 254, 0.6)');
    gradient.addColorStop(0.7, 'rgba(79, 172, 254, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 242, 254, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 2. 바깥쪽 회전 링 (시계 방향 회전, 점선 아크 결계)
    ctx.save();
    ctx.rotate(angle);
    ctx.strokeStyle = isPinching ? '#00ffcc' : '#00f2fe';
    ctx.lineWidth = isPinching ? 3.5 : 2.5;
    ctx.shadowBlur = 12;
    ctx.shadowColor = ctx.strokeStyle;

    // 3분할 네온 아크 그리기
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const startAngle = (i * (Math.PI * 2) / 3);
      const arcLength = (Math.PI * 2 / 3) * 0.65;
      ctx.arc(0, 0, radius, startAngle, startAngle + arcLength);
      ctx.stroke();
    }
    ctx.restore();

    // 3. 안쪽 회전 링 (반시계 방향 회전, 작은 수호 얼음 룬 점 4개)
    ctx.save();
    ctx.rotate(-angle * 1.4);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.65, 0, Math.PI * 2);
    ctx.stroke();

    // 4방향 룬 보석 포인트
    for (let i = 0; i < 4; i++) {
      const runeAngle = (i * Math.PI / 2);
      const rx = Math.cos(runeAngle) * radius * 0.65;
      const ry = Math.sin(runeAngle) * radius * 0.65;

      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#00ffcc';
      ctx.beginPath();
      ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 4. 손끝 정중앙에 선명한 북극성 십자 하이라이트
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#ffffff';

    const crossSize = isPinching ? 7 : 4;
    ctx.beginPath();
    ctx.moveTo(-crossSize, 0);
    ctx.lineTo(crossSize, 0);
    ctx.moveTo(0, -crossSize);
    ctx.lineTo(0, crossSize);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 현재 감지된 가장 최근 손 목록 반환
   * @returns {Array<Object>}
   */
  getHands() {
    return this.latestHands;
  }

  /**
   * 주 상호작용 손의 검지 손끝 좌표 간편 취득
   * 손이 1개 이상 감지되었을 때 첫 번째 손의 검지 손끝을 반환합니다.
   * @returns {{x: number, y: number, rawX: number, rawY: number}|null}
   */
  getPrimaryTouchPoint() {
    if (this.latestHands.length === 0) return null;
    return this.latestHands[0].indexTip;
  }

  /**
   * 메모리 정리 및 자원 해제
   */
  destroy() {
    this.stop();
    if (this.handLandmarker) {
      try {
        this.handLandmarker.close();
      } catch (e) {
        console.warn('HandLandmarker close error:', e);
      }
      this.handLandmarker = null;
    }
    this.particles = [];
    this.latestHands = [];
    this.isModelLoaded = false;
    console.log('🧹 [모션인식] MotionTracker 자원이 완전히 해제되었습니다.');
  }
}

// 기본 익스포트 제공
export default MotionTracker;
