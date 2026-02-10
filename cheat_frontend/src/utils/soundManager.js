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
    }
  }

  async loadSound(name, url, volume = 0.7) {
    await this.initAudioContext();

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    this.sounds[name] = {
      buffer: audioBuffer,
      volume: volume !== null ? volume : this.defaultVolume
    };
  }

  play(name, customVolume = null) {
    if (!this.enabled || !this.sounds[name] || !this.audioContext) return;

    const soundData = this.sounds[name];
    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();

    source.buffer = soundData.buffer;
    gainNode.gain.value = customVolume !== null ? customVolume : soundData.volume;

    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    source.start(0);
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
