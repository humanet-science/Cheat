export class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
    this.defaultVolume = 0.7; // Global default volume
  }

  loadSound(name, url, volume = 0.7) {
    const audio = new Audio(url);
    // Store both the audio object and its volume setting
    this.sounds[name] = {
      audio: audio,
      volume: volume !== null ? volume : this.defaultVolume
    };
  }

    play(name, customVolume = null) {
    if (this.enabled && this.sounds[name]) {
      const soundData = this.sounds[name];
      const sound = soundData.audio.cloneNode();

      // Use custom volume if provided, otherwise use the stored volume
      sound.volume = customVolume !== null ? customVolume : soundData.volume;

      sound.play().catch(e => console.log('Sound play failed:', e));
    }
  }

  setDefaultVolume(volume) {
    this.defaultVolume = Math.max(0, Math.min(1, volume));
  }

  setSoundVolume(name, volume) {
    if (this.sounds[name]) {
      this.sounds[name].volume = Math.max(0, Math.min(1, volume));
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

export const soundManager = new SoundManager();