/** Streaming 24 kHz signed little-endian PCM, with immediate owned-node cancellation. */
export class PcmPlayer {
  private sources = new Set<AudioBufferSourceNode>();
  private nextStart = 0;
  private generation = 0;
  private carry: number | undefined;
  private complete = false;
  private resolve: (() => void) | undefined;
  private started = false;
  private onStart: (() => void) | undefined;
  readonly analyser: AnalyserNode;
  readonly context: AudioContext;

  constructor(context: AudioContext) {
    this.context = context;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(context.destination);
  }

  begin(onStart: () => void): Promise<void> {
    this.stop();
    this.complete = false;
    this.started = false;
    this.onStart = onStart;
    return new Promise(resolve => { this.resolve = resolve; });
  }

  append(chunk: ArrayBuffer) {
    if (this.complete || !chunk.byteLength) return;
    if (this.context.state !== "running") throw new Error("Select Replay response to enable audio playback.");
    const bytes = new Uint8Array(chunk);
    const joined = this.carry === undefined ? bytes : Uint8Array.from([this.carry, ...bytes]);
    this.carry = joined.length % 2 ? joined[joined.length - 1] : undefined;
    const frames = Math.floor(joined.length / 2);
    if (!frames) return;
    const buffer = this.context.createBuffer(1, frames, 24_000);
    const samples = buffer.getChannelData(0);
    const view = new DataView(joined.buffer, joined.byteOffset, frames * 2);
    for (let i = 0; i < frames; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);
    this.sources.add(source);
    const generation = this.generation;
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      if (generation === this.generation && this.complete && !this.sources.size) this.finish();
    };
    const start = Math.max(this.context.currentTime, this.nextStart);
    // Cap buffered provider audio so a long reply cannot allocate unbounded nodes.
    if (start - this.context.currentTime > 180) { source.disconnect(); this.sources.delete(source); throw new Error("This spoken response is too long. Continue with its text version."); }
    source.start(start);
    this.nextStart = start + buffer.duration;
    if (!this.started) { this.started = true; this.onStart?.(); }
  }

  end() {
    if (!this.started) {
      this.stop();
      throw new Error("The speech provider returned no playable audio. Select Replay response to try again.");
    }
    this.complete = true;
    this.carry = undefined;
    if (!this.sources.size) this.finish();
  }

  stop() {
    this.generation++;
    this.complete = true;
    for (const source of this.sources) { source.onended = null; try { source.stop(); } catch { /* already ended */ } source.disconnect(); }
    this.sources.clear();
    this.nextStart = 0;
    this.carry = undefined;
    this.finish();
  }

  private finish() { const resolve = this.resolve; this.resolve = undefined; resolve?.(); }
  dispose() { this.stop(); this.analyser.disconnect(); }
}
