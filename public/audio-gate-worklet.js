// Runs on the dedicated real-time audio thread — immune to main-thread jank
// from chat rendering / screen-share encoding. Envelope-follower noise gate:
// smooth attack/release on the applied gain (never a hard on/off) so speech
// onsets aren't clipped and trailing consonants/breath aren't chopped.
class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: 0.05, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this.envelope = 0;
    this.gain = 0;
    // One-pole filter coefficients for a 48kHz-ish render quantum cadence.
    this.envelopeAttack = 0.6;   // fast follow on rising signal
    this.envelopeRelease = 0.05; // slower decay so brief dips don't chatter
    this.gateAttack = 0.35;      // ~8ms-scale open (won't clip word onsets)
    this.gateRelease = 0.02;     // ~200ms-scale close (won't chop trailing sound)
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    const threshold = parameters.threshold[0];
    if (!input || !input[0]) return true;

    for (let channel = 0; channel < input.length; channel++) {
      const inChannel = input[channel];
      const outChannel = output[channel];
      if (!inChannel || !outChannel) continue;

      for (let i = 0; i < inChannel.length; i++) {
        const sample = inChannel[i];
        const rectified = Math.abs(sample);

        this.envelope = rectified > this.envelope
          ? this.envelope + (rectified - this.envelope) * this.envelopeAttack
          : this.envelope + (rectified - this.envelope) * this.envelopeRelease;

        const target = this.envelope > threshold ? 1 : 0;
        this.gain = target > this.gain
          ? this.gain + (target - this.gain) * this.gateAttack
          : this.gain + (target - this.gain) * this.gateRelease;

        outChannel[i] = sample * this.gain;
      }
    }
    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
