import { readBands, type Bands } from '../anim/beat';
import { BASE_BPM, baseTrackUrl } from './baseTrack';

/** Один плеер на приложение: аудио-элемент можно подключить к анализатору лишь однажды. */
class Player {
  readonly el: HTMLAudioElement;
  name = '';
  kind: 'none' | 'base' | 'file' = 'none';
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private fileUrl: string | null = null;

  constructor() {
    this.el = new Audio();
    this.el.controls = true;
    this.el.loop = true;
    this.el.preload = 'auto';
    // аудиоконтекст можно запускать только после жеста пользователя — им служит «плей»
    this.el.addEventListener('play', () => this.wake());
  }

  private wake(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaElementSource(this.el);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.55;
      src.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
    }
    void this.ctx.resume();
  }

  get playing(): boolean {
    return !this.el.paused && !this.el.ended;
  }

  /** Текущий спектр по полосам; null, пока музыка не играет. */
  bands(): Bands | null {
    if (!this.ctx || !this.analyser || !this.data || !this.playing) return null;
    this.analyser.getByteFrequencyData(this.data);
    return readBands(this.data, this.ctx.sampleRate, this.analyser.fftSize);
  }

  private load(url: string): void {
    const was = this.playing;
    this.el.src = url;
    if (was) void this.el.play().catch(() => undefined);
  }

  async useBase(): Promise<void> {
    const url = await baseTrackUrl();
    this.kind = 'base';
    this.name = `Базовый трек · ${BASE_BPM} уд/мин`;
    this.load(url);
  }

  useFile(file: File): void {
    if (this.fileUrl) URL.revokeObjectURL(this.fileUrl);
    this.fileUrl = URL.createObjectURL(file);
    this.kind = 'file';
    this.name = file.name;
    this.load(this.fileUrl);
  }
}

let instance: Player | null = null;
export const getPlayer = (): Player => (instance ??= new Player());
