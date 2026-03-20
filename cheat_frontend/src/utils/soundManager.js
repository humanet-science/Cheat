export class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
    this.defaultVolume = 0.7;
    this.audioContext = null;
  }

  async initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      // Unlock audio on first user interaction (handles browsers that require a gesture)
      const unlock = () => {
        this.audioContext.resume().then(() => {
          document.removeEventListener('click',     unlock, true);
          document.removeEventListener('keydown',   unlock, true);
          document.removeEventListener('touchstart', unlock, true);
        });
      };
      document.addEventListener('click',     unlock, true);
      document.addEventListener('keydown',   unlock, true);
      document.addEventListener('touchstart', unlock, true);
    }
  }

  async loadSound(name, url, volume = 0.7) {
    await this.initAudioContext();

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await new Promise((resolve, reject) => {
      const p = this.audioContext.decodeAudioData(arrayBuffer, resolve, reject);
      if (p && typeof p.catch === 'function') p.catch(() => {}); // suppress Safari's duplicate rejection
    });

    this.sounds[name] = {
      buffer: audioBuffer,
      volume: volume !== null ? volume : this.defaultVolume
    };
  }

  async loadAll() {
    await this.initAudioContext();
    this.audioContext.resume().catch(() => {}); // fire-and-forget: resolves when user first interacts
    const manifest = [
      { name: 'cardPlay',     url: '/sounds/card_play.mp3',  volume: 0.3 },
      { name: 'bluffSuccess', url: '/sounds/success.mp3',    volume: 0.7 },
      { name: 'bluffFail',    url: '/sounds/busted.mp3',     volume: 0.7 },
      { name: 'callBluff',    url: '/sounds/pop_low.mp3',    volume: 0.7 },
      { name: 'discard',      url: '/sounds/discard.mp3',    volume: 0.7 },
      { name: 'win',          url: '/sounds/win.mp3',        volume: 0.7 },
      { name: 'pick_up',      url: '/sounds/pick_up.mp3',    volume: 0.2 },
      { name: 'start_bell',   url: '/sounds/start_bell.mp3', volume: 0.5 },
    ];
    await Promise.allSettled(
      manifest.map(({ name, url, volume }) =>
        this.loadSound(name, url, volume).catch(e =>
          console.error(`Failed to load sound "${name}":`, e)
        )
      )
    );
  }

  play(name, customVolume = null) {
    if (!this.enabled) return;
    if (!this.audioContext) { console.warn(`[sound] AudioContext not initialised when playing "${name}"`); return; }
    if (!this.sounds[name]) { console.warn(`[sound] "${name}" not loaded`); return; }

    const doPlay = () => {
      const soundData = this.sounds[name];
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      source.buffer = soundData.buffer;
      gainNode.gain.value = customVolume !== null ? customVolume : soundData.volume;

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      source.start(this.audioContext.currentTime);
    };

    if (this.audioContext.state === 'suspended') {
      console.warn(`[sound] context suspended when playing "${name}", attempting resume`);
      this.audioContext.resume().then(doPlay).catch(e => console.warn('[sound] resume failed:', e));
    } else {
      doPlay();
    }
  }

  setDefaultVolume(volume) {
    this.defaultVolume = Math.max(0, Math.min(1, volume));
  }

  setSoundVolume(name, volume) {
    if (this.sounds[name]) {
      const newVolume = Math.max(0, Math.min(1, volume));
      this.sounds[name].volume = newVolume;
      // Update all pooled sounds
      this.sounds[name].pool.forEach(sound => sound.volume = newVolume);
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

export const soundManager = new SoundManager();
