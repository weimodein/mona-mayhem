let audioContext: AudioContext | undefined;
let masterGain: GainNode | undefined;
let enabled = true;

const protectAudio = (operation: () => void): void => {
	try {
		operation();
	} catch (error) {
		console.warn('Could not play arcade sound effects.', error);
	}
};

const getAudioContext = (): AudioContext | undefined => {
	if (typeof window === 'undefined' || !('AudioContext' in window)) {
		return undefined;
	}

	if (!audioContext) {
		audioContext = new AudioContext();
		masterGain = audioContext.createGain();
		masterGain.gain.value = enabled ? 0.12 : 0;
		masterGain.connect(audioContext.destination);
	}

	if (audioContext.state === 'suspended') {
		void audioContext.resume().catch((error: unknown) => {
			console.warn('Could not resume arcade sound effects.', error);
		});
	}

	return audioContext;
};

const playTone = (
	frequency: number,
	start: number,
	duration: number,
	options: {
		waveform?: OscillatorType;
		endFrequency?: number;
		volume?: number;
	} = {},
): void => {
	const context = getAudioContext();
	if (!enabled || !context || !masterGain) {
		return;
	}

	const oscillator = context.createOscillator();
	const envelope = context.createGain();
	const attackEnd = start + Math.min(0.012, duration / 4);
	const noteEnd = start + duration;

	oscillator.type = options.waveform ?? 'square';
	oscillator.frequency.setValueAtTime(frequency, start);
	if (options.endFrequency !== undefined) {
		oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, noteEnd);
	}

	envelope.gain.setValueAtTime(0.0001, start);
	envelope.gain.exponentialRampToValueAtTime(options.volume ?? 0.8, attackEnd);
	envelope.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
	oscillator.connect(envelope);
	envelope.connect(masterGain);
	oscillator.start(start);
	oscillator.stop(noteEnd + 0.01);
};

export const setSfxEnabled = (isEnabled: boolean): void => {
	enabled = isEnabled;
	if (audioContext && masterGain) {
		protectAudio(() => {
			masterGain?.gain.setTargetAtTime(
				enabled ? 0.12 : 0,
				audioContext?.currentTime ?? 0,
				0.015,
			);
		});
	}
};

export const isSfxEnabled = (): boolean => enabled;

export const playCoin = (): void => {
	protectAudio(() => {
		const context = getAudioContext();
		if (!context || !enabled) {
			return;
		}

		playTone(880, context.currentTime, 0.055, { waveform: 'square', volume: 0.45 });
		playTone(1320, context.currentTime + 0.045, 0.075, {
			waveform: 'square',
			volume: 0.35,
		});
	});
};

export const playPowerUp = (): void => {
	protectAudio(() => {
		const context = getAudioContext();
		if (!context || !enabled) {
			return;
		}

		const start = context.currentTime;
		[220, 277, 330, 440, 554, 660].forEach((frequency, index) => {
			playTone(frequency, start + index * 0.11, 0.18, {
				waveform: 'triangle',
				volume: 0.35,
			});
		});
	});
};

export const playStatHit = (): void => {
	protectAudio(() => {
		const context = getAudioContext();
		if (!context || !enabled) {
			return;
		}

		playTone(210, context.currentTime, 0.12, {
			waveform: 'square',
			endFrequency: 75,
			volume: 0.55,
		});
	});
};

export const playVictory = (): void => {
	protectAudio(() => {
		const context = getAudioContext();
		if (!context || !enabled) {
			return;
		}

		const start = context.currentTime;
		[523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach(
			(frequency, index) => {
				playTone(frequency, start + index * 0.13, 0.2, {
					waveform: 'square',
					volume: 0.4,
				});
			},
		);
	});
};
