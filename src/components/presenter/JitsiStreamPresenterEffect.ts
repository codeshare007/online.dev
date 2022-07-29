import { CLEAR_INTERVAL, INTERVAL_TIMEOUT, SET_INTERVAL, timerWorkerScript } from './TimeWorker';

/**
 * Represents a modified MediaStream that adds video as pip on a desktop stream.
 * <tt>JitsiStreamPresenterEffect</tt> does the processing of the original
 * desktop stream.
 */
export default class JitsiStreamPresenterEffect {
  _canvas: HTMLCanvasElement;
  _ctx: CanvasRenderingContext2D | null;
  _desktopElement: HTMLVideoElement;
  _desktopStream: any;
  _frameRate: number;
  _videoFrameTimerWorker!: Worker;
  _videoElement: any;

  /**
   * Represents a modified MediaStream that adds a camera track at the
   * bottom right corner of the desktop track using a HTML canvas.
   * <tt>JitsiStreamPresenterEffect</tt> does the processing of the original
   * video stream.
   *
   * @param {MediaStream} videoStream - The video stream which is user for
   * creating the canvas.
   */
  constructor(videoStream: MediaStream) {
    const videoDiv = document.createElement('div');
    videoDiv.classList.add('screenVideoWraper');
    const firstVideoTrack = videoStream.getVideoTracks()[0];
    const { height, width, frameRate } =
      firstVideoTrack.getSettings() ?? firstVideoTrack.getConstraints();

    this._canvas = document.createElement('canvas');
    this._ctx = this._canvas.getContext('2d');

    this._desktopElement = document.createElement('video');
    this._videoElement = document.createElement('video');
    videoDiv.appendChild(this._videoElement);
    videoDiv.appendChild(this._desktopElement);
    if (document.body !== null) {
      document.body.appendChild(videoDiv);
    }

    // Set the video element properties
    // @ts-expect-error fix frameRate type
    this._frameRate = parseInt(frameRate, 10);
    // @ts-expect-error fix frameRate type
    this._videoElement.width = parseInt(width, 10);
    // @ts-expect-error fix frameRate type
    this._videoElement.height = parseInt(height, 10);
    this._videoElement.autoplay = true;
    this._videoElement.srcObject = videoStream;

    // set the style attribute of the div to make it invisible
    videoDiv.style.display = 'none';

    // Bind event handler so it is only bound once for every instance.
    this._onVideoFrameTimer = this._onVideoFrameTimer.bind(this);
  }

  /**
   * EventHandler onmessage for the videoFrameTimerWorker WebWorker.
   *
   * @private
   * @param {EventHandler} response - The onmessage EventHandler parameter.
   * @returns {void}
   */
  _onVideoFrameTimer(response: any) {
    if (response.data.id === INTERVAL_TIMEOUT) {
      this._renderVideo();
    }
  }

  /**
   * Loop function to render the video frame input and draw presenter effect.
   *
   * @private
   * @returns {void}
   */
  _renderVideo() {
    // adjust the canvas width/height on every frame incase the window has been resized.
    const [track] = this._desktopStream.getVideoTracks();
    const { height, width } = track.getSettings() ?? track.getConstraints();

    this._canvas.width = parseInt(width, 10);
    this._canvas.height = parseInt(height, 10);
    if (this._ctx) {
      this._ctx.drawImage(this._desktopElement, 0, 0, this._canvas.width, this._canvas.height);
      this._ctx.drawImage(
        this._videoElement,
        this._canvas.width - this._videoElement.width,
        this._canvas.height - this._videoElement.height,
        this._videoElement.width,
        this._videoElement.height,
      );

      // draw a border around the video element.
      this._ctx.beginPath();
      this._ctx.lineWidth = 2;
      this._ctx.strokeStyle = '#A9A9A9'; // dark grey
      this._ctx.rect(
        this._canvas.width - this._videoElement.width,
        this._canvas.height - this._videoElement.height,
        this._videoElement.width,
        this._videoElement.height,
      );
      this._ctx.stroke();
    }
  }

  /**
   * Checks if the local track supports this effect.
   *
   * @param {JitsiLocalTrack} jitsiLocalTrack - Track to apply effect.
   * @returns {boolean} - Returns true if this effect can run on the
   * specified track, false otherwise.
   */
  isEnabled(jitsiLocalTrack: any) {
    // return jitsiLocalTrack.isVideoTrack() && jitsiLocalTrack.videoType === 'desktop';
    return jitsiLocalTrack.isVideoTrack();
  }

  /**
   * Starts loop to capture video frame and render presenter effect.
   *
   * @param {MediaStream} desktopStream - Stream to be used for processing.
   * @returns {MediaStream} - The stream with the applied effect.
   */
  startEffect(desktopStream: MediaStream) {
    const firstVideoTrack = desktopStream.getVideoTracks()[0];
    const { height, width } = firstVideoTrack.getSettings() ?? firstVideoTrack.getConstraints();

    // set the desktop element properties.
    this._desktopStream = desktopStream;
    if (width && height) {
      this._desktopElement.width = parseInt(width.toString(), 10);
      this._desktopElement.height = parseInt(height.toString(), 10);
      this._desktopElement.autoplay = true;
      this._desktopElement.srcObject = desktopStream;
      this._canvas.width = parseInt(width.toString(), 10);
      this._canvas.height = parseInt(height.toString(), 10);
    }
    this._videoFrameTimerWorker = new Worker(timerWorkerScript, {
      name: 'Presenter effect worker',
    });
    this._videoFrameTimerWorker.onmessage = this._onVideoFrameTimer;
    this._videoFrameTimerWorker.postMessage({
      id: SET_INTERVAL,
      timeMs: 1000 / this._frameRate,
    });

    return this._canvas.captureStream(this._frameRate);
  }

  /**
   * Stops the capture and render loop.
   *
   * @returns {void}
   */
  stopEffect() {
    this._videoFrameTimerWorker.postMessage({
      id: CLEAR_INTERVAL,
    });
    this._videoFrameTimerWorker.terminate();
    // Remove the track of the camera element
    let videoTracks;
    if (typeof this._videoElement.mozCaptureStream === 'function') {
      videoTracks = this._videoElement.mozCaptureStream();
    } else {
      videoTracks = this._videoElement.captureStream();
    }
    const mediaTracks = videoTracks.getVideoTracks();
    if (mediaTracks && mediaTracks.length > 0) {
      for (let i = 0; i < mediaTracks.length; i++) {
        mediaTracks[i].stop();
      }
    }
  }
}
