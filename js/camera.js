/**
 * ==============================================================================
 * [북극 빙하 지킴이] 카메라 관리 모듈 (CameraManager)
 * ==============================================================================
 * 파일명: js/camera.js
 * 역할:
 *   - 사용자의 웹캠(FaceTime 카메라, iPhone 연속성 카메라, 외장 USB 웹캠 등)을 안전하게 연결합니다.
 *   - 시스템에 연결된 카메라 장치들을 자동으로 검색하여 드롭다운 선택 메뉴에 채워 넣습니다.
 *   - 사용자가 카메라를 바꿀 때 기존 비디오 스트림을 안전하게 정리(메모리 누수 방지)하고
 *     새로운 카메라로 매끄럽게 전환합니다.
 *   - M2 Mac, iPad Safari, Windows Chrome 등 다양한 브라우저 및 기기 환경에서
 *     권한 거부나 장치 충돌 시 친절한 한글 오류 메시지를 사용자에게 제공합니다.
 * ==============================================================================
 */

export class CameraManager {
  /**
   * 카메라 매니저 생성자
   * @param {Object} options 설정 옵션
   * @param {HTMLVideoElement|string} options.videoElement - 웹캠 영상을 보여줄 video 엘리먼트 또는 선택자
   * @param {HTMLSelectElement|string} [options.selectElement] - 카메라 목록을 표시할 select 엘리먼트 또는 선택자
   * @param {Function} [options.onStreamReady] - 카메라 스트림이 성공적으로 준비되었을 때 호출되는 콜백 함수
   * @param {Function} [options.onError] - 카메라 연결 중 오류 발생 시 호출되는 콜백 함수
   * @param {number} [options.preferredWidth=1280] - 기본 선호 가로 해상도 (HD 720p 기본 권장)
   * @param {number} [options.preferredHeight=720] - 기본 선호 세로 해상도
   */
  constructor(options = {}) {
    // 1. 비디오 엘리먼트 참조 가져오기
    if (typeof options.videoElement === 'string') {
      this.video = document.querySelector(options.videoElement);
    } else {
      this.video = options.videoElement || document.getElementById('webcam');
    }

    // 2. 카메라 선택 셀렉트 박스 참조 가져오기
    if (typeof options.selectElement === 'string') {
      this.select = document.querySelector(options.selectElement);
    } else {
      this.select = options.selectElement || document.getElementById('cameraSelect');
    }

    // 3. 콜백 함수 설정
    this.onStreamReady = options.onStreamReady || null;
    this.onError = options.onError || null;

    // 4. 선호 해상도 (720p HD 기준: 성능과 AI 인식률의 최적 균형점)
    this.preferredWidth = options.preferredWidth || 1280;
    this.preferredHeight = options.preferredHeight || 720;

    // 5. 내부 상태 변수 초기화
    this.currentStream = null;          // 현재 재생 중인 MediaStream 객체
    this.currentDeviceId = null;        // 현재 선택된 카메라의 고유 ID
    this.availableCameras = [];         // 사용 가능한 비디오 입력 장치 목록
    this.isInitializing = false;        // 카메라 초기화 진행 중 중복 요청 방지 플래그

    // 6. 이벤트 리스너 바인딩
    this._handleDeviceChange = this._handleDeviceChange.bind(this);
    this._handleSelectChange = this._handleSelectChange.bind(this);

    // 셀렉트 박스가 존재하면 체인지 이벤트 연결
    if (this.select) {
      this.select.addEventListener('change', this._handleSelectChange);
    }

    // USB 카메라가 새로 꽂히거나 iPhone 연속성 카메라가 연결/해제될 때 자동 감지
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', this._handleDeviceChange);
    }
  }

  /**
   * 카메라를 시작하고 초기화하는 메인 함수
   * @param {string} [requestedDeviceId] - 특정 카메라 ID를 강제로 지정하고 싶을 때 사용
   * @returns {Promise<MediaStream>} 연결된 미디어 스트림
   */
  async start(requestedDeviceId = null) {
    // 이미 카메라를 켜는 중이라면 중복 요청을 방지합니다.
    if (this.isInitializing) {
      console.warn('⚠️ [카메라] 이미 카메라 초기화가 진행 중입니다.');
      return this.currentStream;
    }

    this.isInitializing = true;

    try {
      // 1. 브라우저가 카메라 API(navigator.mediaDevices)를 지원하는지 점검
      this._checkBrowserSupport();

      // 2. 이전에 켜져 있던 카메라 스트림이 있다면 깨끗하게 종료(메모리 및 배터리 절약)
      this.stop();

      // 3. 카메라에 요청할 제약 조건(Constraints) 구성
      // 모바일 및 M2 Mac의 고성능 카메라를 안정적으로 활용하기 위한 설정입니다.
      const constraints = {
        audio: false, // 게임에는 마이크가 필요 없으므로 음성은 끕니다.
        video: {
          width: { ideal: this.preferredWidth },
          height: { ideal: this.preferredHeight },
          frameRate: { ideal: 60, min: 30 } // 60fps 부드러운 손동작 추적 지향
        }
      };

      // 만약 특정 카메라 ID가 지정되어 있다면 해당 장치로 고정
      if (requestedDeviceId) {
        constraints.video.deviceId = { exact: requestedDeviceId };
      } else if (this.currentDeviceId) {
        constraints.video.deviceId = { exact: this.currentDeviceId };
      } else {
        // 기본값: 사용자 방향(전면 카메라) 우선 요청 (FaceTime 카메라, 셀카 모드)
        constraints.video.facingMode = 'user';
      }

      console.log('🎥 [카메라] 카메라 연결을 시도합니다:', constraints);

      // 4. 브라우저에 카메라 권한 요청 및 비디오 스트림 획득
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // 혹시 exact deviceId 제약 조건 때문에 실패한 경우(예: 장치가 갑자기 뽑힘),
        // 기본 카메라로 한 번 더 유연하게 재시도합니다.
        if (err.name === 'OverconstrainedError' && (requestedDeviceId || this.currentDeviceId)) {
          console.warn('⚠️ [카메라] 지정된 카메라 장치 연결 실패. 기본 카메라로 재시도합니다.');
          delete constraints.video.deviceId;
          constraints.video.facingMode = 'user';
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } else {
          throw err; // 다른 에러는 그대로 에러 처리기로 전달
        }
      }

      this.currentStream = stream;

      // 5. 현재 활성화된 비디오 트랙 정보 확인
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        this.currentDeviceId = settings.deviceId || requestedDeviceId;
        console.log(`✅ [카메라] 연결 성공! 장치명: "${videoTrack.label}", 해상도: ${settings.width}x${settings.height}`);
      }

      // 6. <video> 엘리먼트에 스트림 연결 및 재생 준비
      if (this.video) {
        this.video.srcObject = stream;
        // iOS Safari 및 iPad에서 인라인 재생을 보장하기 위한 필수 속성 적용
        this.video.setAttribute('playsinline', 'true');
        this.video.setAttribute('webkit-playsinline', 'true');
        this.video.muted = true; // 브라우저 자동 재생 정책 만족을 위한 음소거

        // 비디오가 재생 가능한 상태가 될 때까지 기다립니다.
        await this._waitForVideoReady(this.video);

        // 비디오 재생 시작
        await this.video.play().catch(playErr => {
          console.warn('⚠️ [카메라] 비디오 자동 재생 차단됨 (사용자 상호작용 필요):', playErr);
        });
      }

      // 7. 사용 가능한 카메라 장치 목록을 새로고침하여 셀렉트 메뉴 채우기
      // 권한을 허가받은 이후에야 정확한 장치 이름(label)을 읽을 수 있습니다.
      await this.updateDeviceList();

      // 8. 성공 콜백 호출
      const resolution = this.getResolution();
      if (typeof this.onStreamReady === 'function') {
        this.onStreamReady({
          stream: this.currentStream,
          video: this.video,
          deviceId: this.currentDeviceId,
          width: resolution.width,
          height: resolution.height
        });
      }

      return stream;
    } catch (error) {
      // 발생한 에러를 친절한 한글 메시지로 가공하여 사용자에게 안내합니다.
      const friendlyMessage = this._getFriendlyErrorMessage(error);
      console.error('❌ [카메라 오류]', friendlyMessage, error);

      if (typeof this.onError === 'function') {
        this.onError({
          error,
          message: friendlyMessage
        });
      }

      throw new Error(friendlyMessage);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * 카메라를 초기화하고 연결을 시작합니다. (start 메서드의 별칭)
   * @param {string} [requestedDeviceId] - 특정 카메라 ID
   * @returns {Promise<MediaStream>} 연결된 미디어 스트림
   */
  async init(requestedDeviceId = null) {
    return this.start(requestedDeviceId);
  }

  /**
   * 현재 연결된 모든 카메라 장치를 탐색하여 드롭다운 UI에 반영합니다.
   * iPhone 연속성 카메라, FaceTime HD, USB 웹캠 등 장치 유형을 알기 쉽게 표시합니다.
   * @returns {Promise<MediaDeviceInfo[]>} 발견된 비디오 입력 장치 배열
   */
  async updateDeviceList() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      // 오디오 장치를 제외하고 오직 '비디오 입력 장치(카메라)'만 필터링합니다.
      this.availableCameras = devices.filter(device => device.kind === 'videoinput');

      // 셀렉트 박스 엘리먼트가 연결되어 있다면 옵션 갱신
      if (this.select) {
        // 기존 옵션 목록 비우기
        this.select.innerHTML = '';

        if (this.availableCameras.length === 0) {
          const defaultOpt = document.createElement('option');
          defaultOpt.value = '';
          defaultOpt.textContent = '연결된 카메라가 없습니다';
          this.select.appendChild(defaultOpt);
          return [];
        }

        // 각 카메라 장치를 드롭다운 항목으로 추가
        this.availableCameras.forEach((camera, index) => {
          const option = document.createElement('option');
          option.value = camera.deviceId;

          // 사용자가 알아보기 쉬운 친절한 이름 부여
          let label = camera.label || `카메라 ${index + 1}`;
          
          // M2 Mac FaceTime 및 iPhone 연속성 카메라 등을 직관적으로 식별할 수 있는 아이콘 추가
          if (/facetime/i.test(label)) {
            label = `💻 FaceTime 내장 카메라`;
          } else if (/iphone/i.test(label) || /continuity/i.test(label)) {
            label = `📱 iPhone 연속성 카메라`;
          } else if (/usb/i.test(label) || /external/i.test(label)) {
            label = `🔌 외장 웹캠 (${camera.label})`;
          } else if (/back/i.test(label) || /후면/i.test(label)) {
            label = `📷 후면 카메라`;
          } else if (/front/i.test(label) || /전면/i.test(label)) {
            label = `🤳 전면 카메라`;
          }

          option.textContent = label;

          // 현재 활성화된 카메라가 이 옵션이면 선택 상태로 표시
          if (camera.deviceId === this.currentDeviceId) {
            option.selected = true;
          }

          this.select.appendChild(option);
        });

        // 만약 선택된 값이 없고 사용 가능한 카메라가 있다면 첫 번째 카메라를 기본 선택
        if (!this.select.value && this.availableCameras.length > 0) {
          this.select.value = this.availableCameras[0].deviceId;
        }
      }

      return this.availableCameras;
    } catch (err) {
      console.warn('⚠️ [카메라] 장치 목록 탐색 중 오류:', err);
      return [];
    }
  }

  /**
   * 사용자가 드롭다운에서 다른 카메라를 선택했을 때의 이벤트 핸들러
   * @private
   */
  async _handleSelectChange(event) {
    const selectedDeviceId = event.target.value;
    if (!selectedDeviceId || selectedDeviceId === this.currentDeviceId) {
      return;
    }

    console.log(`🔄 [카메라] 사용자가 카메라를 전환합니다. 장치 ID: ${selectedDeviceId}`);
    try {
      await this.start(selectedDeviceId);
    } catch (err) {
      console.error('❌ [카메라] 카메라 전환 실패:', err);
      // 실패 시 기존 카메라 ID로 셀렉트 박스 원복
      if (this.currentDeviceId && this.select) {
        this.select.value = this.currentDeviceId;
      }
    }
  }

  /**
   * 새로운 웹캠이 연결되거나 분리되었을 때 자동 감지 핸들러
   * @private
   */
  async _handleDeviceChange() {
    console.log('🔌 [카메라] 카메라 연결 장치 변경 감지됨. 장치 목록을 갱신합니다.');
    await this.updateDeviceList();
  }

  /**
   * 비디오 엘리먼트가 실제로 영상 프레임을 받아와 재생 가능한 상태인지 대기하는 헬퍼
   * @private
   * @param {HTMLVideoElement} video 
   * @returns {Promise<void>}
   */
  _waitForVideoReady(video) {
    return new Promise((resolve) => {
      // 이미 준비된 상태라면 즉시 완료
      if (video.readyState >= 2 && video.videoWidth > 0) {
        resolve();
        return;
      }

      // 비디오 데이터가 로드되었을 때 이벤트 수신
      const onLoaded = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('canplay', onLoaded);
          resolve();
        }
      };

      video.addEventListener('loadeddata', onLoaded);
      video.addEventListener('canplay', onLoaded);

      // 혹시 이벤트가 누락되는 경우를 대비한 3초 타임아웃 안전장치
      setTimeout(() => {
        video.removeEventListener('loadeddata', onLoaded);
        video.removeEventListener('canplay', onLoaded);
        resolve();
      }, 3000);
    });
  }

  /**
   * 브라우저의 웹캠 지원 여부 사전 점검
   * @private
   */
  _checkBrowserSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        '현재 브라우저는 카메라(웹캠) 기능을 지원하지 않습니다.\n' +
        '최신 버전의 Chrome, Safari, Edge 브라우저를 사용해 주세요.'
      );
    }

    // HTTPS 또는 localhost 환경이 아닌 경우(보안 정책상 카메라 차단)
    const isSecureOrigin =
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (!isSecureOrigin) {
      console.warn('⚠️ [카메라] 보안 프로토콜(HTTPS)이 아닙니다. 일부 브라우저에서 카메라 접근이 차단될 수 있습니다.');
    }
  }

  /**
   * 브라우저 에러 객체를 친절한 한국어 도움말로 변환
   * @private
   * @param {Error} error 
   * @returns {string} 친절한 한글 에러 메시지
   */
  _getFriendlyErrorMessage(error) {
    const errorName = error.name || error.constructor.name || '';

    switch (errorName) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return (
          '🚫 카메라 접근 권한이 거부되었습니다.\n' +
          '브라우저 주소창 왼쪽의 자물쇠/카메라 아이콘을 클릭하여 "카메라 허용"으로 변경한 후 새로고침해 주세요.'
        );

      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return (
          '🔍 연결된 카메라 장치를 찾을 수 없습니다.\n' +
          '웹캠이 컴퓨터에 올바르게 연결되어 있는지 확인해 주세요.'
        );

      case 'NotReadableError':
      case 'TrackStartError':
        return (
          '🔒 카메라를 다른 프로그램이 이미 사용 중입니다.\n' +
          'FaceTime, Zoom, OBS Studio, 카카오톡 등 카메라를 사용 중인 다른 앱을 종료한 뒤 다시 시도해 주세요.'
        );

      case 'OverconstrainedError':
        return (
          '⚙️ 요청한 카메라 해상도나 화면 비율을 현재 장치가 지원하지 않습니다.\n' +
          '기본 설정으로 다시 연결을 시도합니다.'
        );

      case 'SecurityError':
        return (
          '🛡️ 보안 정책으로 인해 카메라에 접근할 수 없습니다.\n' +
          '카메라는 안전한 보안 연결(HTTPS 또는 localhost)에서만 작동합니다.'
        );

      default:
        return (
          `⚠️ 카메라를 시작할 수 없습니다: ${error.message || '알 수 없는 오류가 발생했습니다.'}\n` +
          '카메라 케이블 연결 상태와 브라우저 설정을 확인해 주세요.'
        );
    }
  }

  /**
   * 현재 카메라의 실제 해상도(너비, 높이)를 반환합니다.
   * @returns {{width: number, height: number}}
   */
  getResolution() {
    if (this.video && this.video.videoWidth > 0) {
      return {
        width: this.video.videoWidth,
        height: this.video.videoHeight
      };
    }

    if (this.currentStream) {
      const track = this.currentStream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings();
        if (settings.width && settings.height) {
          return {
            width: settings.width,
            height: settings.height
          };
        }
      }
    }

    // 아직 비디오가 완전히 로드되지 않은 경우 선호 해상도 기본값 반환
    return {
      width: this.preferredWidth,
      height: this.preferredHeight
    };
  }

  /**
   * 현재 재생 중인 MediaStream 객체 반환
   * @returns {MediaStream|null}
   */
  getStream() {
    return this.currentStream;
  }

  /**
   * 비디오 엘리먼트 반환
   * @returns {HTMLVideoElement}
   */
  getVideoElement() {
    return this.video;
  }

  /**
   * 현재 활성화된 카메라 장치 ID 반환
   * @returns {string|null}
   */
  getCurrentDeviceId() {
    return this.currentDeviceId;
  }

  /**
   * 현재 카메라가 활성화되어 정상 스트리밍 중인지 여부
   * @returns {boolean}
   */
  isActive() {
    return !!(
      this.currentStream &&
      this.currentStream.active &&
      this.video &&
      !this.video.paused &&
      this.video.readyState >= 2
    );
  }

  /**
   * 카메라 스트림을 완전히 정지하고 자원을 해제합니다.
   * 메모리 누수를 방지하고 배터리 소모를 줄입니다.
   */
  stop() {
    if (this.currentStream) {
      console.log('⏹️ [카메라] 기존 카메라 스트림을 안전하게 중지합니다.');
      // 모든 비디오 트랙을 정지시켜 웹캠 불(LED)을 끕니다.
      this.currentStream.getTracks().forEach(track => {
        track.stop();
      });
      this.currentStream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
    }
  }

  /**
   * 인스턴스 파괴 및 이벤트 리스너 정리
   */
  destroy() {
    this.stop();

    if (this.select) {
      this.select.removeEventListener('change', this._handleSelectChange);
    }

    if (navigator.mediaDevices && navigator.mediaDevices.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this._handleDeviceChange);
    }

    console.log('🧹 [카메라] CameraManager 인스턴스가 완전히 정리되었습니다.');
  }
}

// 기본 익스포트 제공
export default CameraManager;
