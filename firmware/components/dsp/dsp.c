#include "dsp.h"

#include <math.h>
#include <string.h>

#define SAMPLE_SCALE 8388607.0f
#define FIR_TAPS 5
#define DELAY_SAMPLES 2400

typedef struct {
    float gain;
    float compressor;
    float drive;
    float modulation_depth;
    float delay_mix;
    float fir[FIR_TAPS];
} dsp_coefficients_t;

static preset_t active_preset = {
    .name = "Default",
    .instrument = INSTRUMENT_GUITAR,
    .effects = {
        .gain = 45,
        .tone_eq = 50,
        .compressor = 25,
        .drive = 20,
        .modulation = 0,
        .delay_reverb = 10,
    },
    .bypass = false,
    .source = "manual",
};

static dsp_coefficients_t coeffs;
static float fir_history[FIR_TAPS];
static unsigned fir_index;
static float delay_line[DELAY_SAMPLES];
static unsigned delay_index;
static float modulation_phase;
static bool initialized;

static float clampf(float value, float min, float max)
{
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

static int32_t float_to_s24(float value)
{
    return (int32_t)(clampf(value, -1.0f, 1.0f) * SAMPLE_SCALE);
}

static void update_coefficients(void)
{
    const float tone = (float)active_preset.effects.tone_eq * 0.01f;
    const float shape = (tone - 0.5f) * 2.0f;

    coeffs.gain = 0.5f + (float)active_preset.effects.gain * 0.025f;
    coeffs.compressor = (float)active_preset.effects.compressor * 0.01f;
    coeffs.drive = (float)active_preset.effects.drive * 0.01f;
    coeffs.modulation_depth = (float)active_preset.effects.modulation * 0.0008f;
    coeffs.delay_mix = (float)active_preset.effects.delay_reverb * 0.0035f;

    if (shape < 0.0f) {
        const float amount = -shape;
        coeffs.fir[0] = 0.0625f * amount;
        coeffs.fir[1] = 0.25f * amount;
        coeffs.fir[2] = 1.0f - 0.625f * amount;
    } else {
        coeffs.fir[0] = -0.0625f * shape;
        coeffs.fir[1] = -0.125f * shape;
        coeffs.fir[2] = 1.0f + 0.375f * shape;
    }
    coeffs.fir[3] = coeffs.fir[1];
    coeffs.fir[4] = coeffs.fir[0];
}

static float fir_convolve(float sample)
{
    fir_history[fir_index] = sample;

    const unsigned i0 = fir_index;
    const unsigned i1 = (i0 + FIR_TAPS - 1) % FIR_TAPS;
    const unsigned i2 = (i0 + FIR_TAPS - 2) % FIR_TAPS;
    const unsigned i3 = (i0 + FIR_TAPS - 3) % FIR_TAPS;
    const unsigned i4 = (i0 + FIR_TAPS - 4) % FIR_TAPS;

    const float filtered =
        coeffs.fir[0] * (fir_history[i0] + fir_history[i4]) +
        coeffs.fir[1] * (fir_history[i1] + fir_history[i3]) +
        coeffs.fir[2] * fir_history[i2];

    fir_index = (fir_index + 1) % FIR_TAPS;
    return filtered;
}

static float fast_saturate(float sample)
{
    const float amount = coeffs.drive;
    if (amount <= 0.001f) return sample;

    const float driven = sample * (1.0f + amount * 5.0f);
    const float saturated = driven / (1.0f + fabsf(driven));
    return sample * (1.0f - amount) + saturated * amount;
}

static float triangle_modulation(void)
{
    modulation_phase += 0.00075f;
    if (modulation_phase >= 1.0f) modulation_phase -= 1.0f;
    const float triangle = 1.0f - 4.0f * fabsf(modulation_phase - 0.5f);
    return 1.0f + triangle * coeffs.modulation_depth;
}

void dsp_set_preset(const preset_t *preset)
{
    if (preset == NULL) return;
    active_preset = *preset;
    update_coefficients();
    initialized = true;
}

void dsp_process_block(const int32_t *input, const int32_t *mic, int32_t *output, int frames, audio_telemetry_t *telemetry)
{
    if (!initialized) {
        update_coefficients();
        initialized = true;
    }

    int32_t input_peak = 0;
    int32_t output_peak = 0;
    int32_t mic_peak = 0;
    bool clip = false;

    for (int i = 0; i < frames; i++) {
        const int32_t input_abs = input[i] < 0 ? -input[i] : input[i];
        const int32_t mic_abs = mic && mic[i] < 0 ? -mic[i] : (mic ? mic[i] : 0);
        if (input_abs > input_peak) input_peak = input_abs;
        if (mic_abs > mic_peak) mic_peak = mic_abs;

        if (active_preset.bypass) {
            output[i] = input[i];
            if (input_abs > output_peak) output_peak = input_abs;
            continue;
        }

        float sample = (float)input[i] / SAMPLE_SCALE;
        sample *= coeffs.gain;

        const float magnitude = fabsf(sample);
        if (magnitude > 0.30f) {
            const float excess = clampf((magnitude - 0.30f) * 1.4285714f, 0.0f, 0.65f);
            sample *= 1.0f - coeffs.compressor * excess;
        }

        sample = fast_saturate(sample);
        sample = fir_convolve(sample);
        sample *= triangle_modulation();

        const float delayed = delay_line[delay_index];
        delay_line[delay_index] = sample + delayed * 0.32f;
        delay_index = (delay_index + 1) % DELAY_SAMPLES;
        sample += (delayed - sample) * coeffs.delay_mix;

        if (fabsf(sample) > 0.98f) clip = true;
        output[i] = float_to_s24(sample);
        const int32_t output_abs = output[i] < 0 ? -output[i] : output[i];
        if (output_abs > output_peak) output_peak = output_abs;
    }

    if (telemetry) {
        telemetry->input_level = (float)input_peak / SAMPLE_SCALE;
        telemetry->pre_output_level = (float)output_peak / SAMPLE_SCALE;
        telemetry->mic_level = (float)mic_peak / SAMPLE_SCALE;
        telemetry->clip = clip;
    }
}
