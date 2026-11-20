import AVFoundation
import os

/// Procedural sound: the same oscillator cues as the web game's WebAudio synth, off until the
/// player turns audio on. Nothing is loaded from disk.
final class SoundEngine {
    private enum Wave {
        case sine, triangle, sawtooth
    }

    /// One oscillator with an exponential gain decay, and optionally an exponential pitch sweep.
    private struct Voice {
        var wave: Wave
        var startFreq: Double
        var endFreq: Double
        /// Seconds over which the pitch sweeps from start to end; 0 holds the start pitch.
        var sweep: Double
        var startGain: Double
        var endGain: Double
        /// Seconds over which the gain decays.
        var decay: Double
        /// Seconds until the voice is dropped.
        var length: Double
        /// Seconds before the voice starts.
        var delay: Double
        var elapsed = 0.0
        var phase = 0.0
    }

    private let engine = AVAudioEngine()
    private var source: AVAudioSourceNode?
    private var sampleRate = 44100.0
    private var enabled = false

    // Voices are shared with the audio thread. The lock is held only for a few array operations.
    private var voices: [Voice] = []
    private var lock = os_unfair_lock()

    func setEnabled(_ on: Bool) {
        enabled = on
        if on {
            startIfNeeded()
            click(520, duration: 0.04)
        } else {
            engine.pause()
        }
    }

    private func startIfNeeded() {
        if source == nil {
            // Ambient: respects the silent switch and plays alongside the player's own music.
            try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
            try? AVAudioSession.sharedInstance().setActive(true)
            let format = engine.outputNode.inputFormat(forBus: 0)
            sampleRate = format.sampleRate > 0 ? format.sampleRate : 44100
            let mono = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
            let node = AVAudioSourceNode(format: mono) { [unowned self] _, _, frameCount, bufferList in
                self.render(frameCount: Int(frameCount), bufferList: bufferList)
                return noErr
            }
            engine.attach(node)
            engine.connect(node, to: engine.mainMixerNode, format: mono)
            source = node
            voices.reserveCapacity(32)
        }
        if !engine.isRunning { try? engine.start() }
    }

    private func render(frameCount: Int, bufferList: UnsafeMutablePointer<AudioBufferList>) {
        let buffers = UnsafeMutableAudioBufferListPointer(bufferList)
        guard let out = buffers.first?.mData?.assumingMemoryBound(to: Float.self) else { return }
        let dt = 1 / sampleRate

        os_unfair_lock_lock(&lock)
        for frame in 0..<frameCount {
            var sample = 0.0
            for i in voices.indices {
                var v = voices[i]
                if v.delay > 0 {
                    v.delay -= dt
                    voices[i] = v
                    continue
                }
                let freq = v.sweep > 0 ? v.startFreq * pow(v.endFreq / v.startFreq, min(v.elapsed / v.sweep, 1)) : v.startFreq
                let gain = v.startGain * pow(v.endGain / v.startGain, min(v.elapsed / v.decay, 1))
                let wave: Double
                switch v.wave {
                case .sine: wave = sin(2 * .pi * v.phase)
                case .triangle: wave = 4 * abs(v.phase - 0.5) - 1
                case .sawtooth: wave = 2 * v.phase - 1
                }
                sample += wave * gain
                v.phase += freq * dt
                v.phase -= v.phase.rounded(.down)
                v.elapsed += dt
                voices[i] = v
            }
            out[frame] = Float(max(-1, min(1, sample)))
        }
        voices.removeAll { $0.delay <= 0 && $0.elapsed >= $0.length }
        os_unfair_lock_unlock(&lock)
    }

    private func play(_ voice: Voice) {
        guard enabled, source != nil else { return }
        os_unfair_lock_lock(&lock)
        if voices.count < 32 { voices.append(voice) }
        os_unfair_lock_unlock(&lock)
    }

    // MARK: Cues

    func click(_ freq: Double = 440, duration: Double = 0.035) {
        play(Voice(wave: .sine, startFreq: freq, endFreq: freq, sweep: 0, startGain: 0.06, endGain: 0.0008,
                   decay: duration, length: duration, delay: 0))
    }

    func launch(speedRatio: Double) {
        let base = 180 + speedRatio * 140
        play(Voice(wave: .triangle, startFreq: base, endFreq: base * 2.1, sweep: 0.24, startGain: 0.11, endGain: 0.001,
                   decay: 0.34, length: 0.35, delay: 0))
    }

    func relayLock(index: Int) {
        let scale = [523.25, 659.25, 783.99, 1046.5]
        let freq = scale[min(max(index, 0), scale.count - 1)]
        play(Voice(wave: .sine, startFreq: freq, endFreq: freq, sweep: 0, startGain: 0.12, endGain: 0.0008,
                   decay: 0.55, length: 0.58, delay: 0))
        play(Voice(wave: .triangle, startFreq: freq * 1.5, endFreq: freq * 1.5, sweep: 0, startGain: 0.05, endGain: 0.0008,
                   decay: 0.51, length: 0.54, delay: 0.04))
    }

    func sectorComplete() {
        let chord = [523.25, 659.25, 783.99, 987.77, 1046.5]
        for (i, freq) in chord.enumerated() {
            play(Voice(wave: .sine, startFreq: freq, endFreq: freq, sweep: 0, startGain: 0.08, endGain: 0.0008,
                       decay: 0.65, length: 0.68, delay: Double(i) * 0.075))
        }
    }

    func impact() {
        play(Voice(wave: .sawtooth, startFreq: 140, endFreq: 38, sweep: 0.32, startGain: 0.12, endGain: 0.001,
                   decay: 0.34, length: 0.35, delay: 0))
    }
}
