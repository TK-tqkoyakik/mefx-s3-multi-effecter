#include "dsp.h"

#include <math.h>
#include <string.h>

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

static float tone_state = 0.0f;
static float delay_line[2400];
static int delay_index = 0;
static float lfo_phase = 0.0f;

static float clampf(float value, float min, float max)
{
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

static int32_t float_to_s24(float value)
{
    const float clipped = clampf(value, -1.0f, 1.0f);
    return (int32_t)(clipped * 8388607.0f);
}

void dsp_set_preset(const preset_t *preset)
{
    if (preset == NULL) return;
    active_preset = *preset;
}

void dsp_process_block(const int32_t *input, const int32_t *mic, int32_t *output, int frames, audio_telemetry_t *telemetry)
{
    float input_peak = 0.0f;
    float output_peak = 0.0f;
    float mic_peak = 0.0f;
    bool clip = false;

    const float gain = 0.5f + ((float)active_preset.effects.gain / 100.0f) * 2.5f;
    const float drive = ((float)active_preset.effects.drive / 100.0f) * 6.0f;
    const float comp = (float)active_preset.effects.compressor / 100.0f;
    const float tone = (float)active_preset.effects.tone_eq / 100.0f;
    const float mod_depth = (float)active_preset.effects.modulation / 100.0f * 0.08f;
    const float space_mix = (float)active_preset.effects.delay_reverb / 100.0f * 0.35f;
    const float lowpass_alpha = active_preset.instrument == INSTRUMENT_BASS
        ? 0.05f + tone * 0.18f
        : 0.08f + tone * 0.30f;

    for (int i = 0; i < frames; i++) {
        float sample = (float)input[i] / 8388607.0f;
        float mic_sample = mic ? (float)mic[i] / 8388607.0f : 0.0f;
        input_peak = fmaxf(input_peak, fabsf(sample));
        mic_peak = fmaxf(mic_peak, fabsf(mic_sample));

        if (active_preset.bypass) {
            output[i] = input[i];
            output_peak = fmaxf(output_peak, fabsf(sample));
            continue;
        }

        sample *= gain;
        const float abs_sample = fabsf(sample);
        if (abs_sample > 0.30f) {
            const float reduction = 1.0f - comp * clampf((abs_sample - 0.30f) / 0.70f, 0.0f, 0.65f);
            sample *= reduction;
        }

        if (drive > 0.01f) {
            sample = tanhf(sample * (1.0f + drive));
        }

        tone_state += lowpass_alpha * (sample - tone_state);
        sample = tone_state + (sample - tone_state) * (0.45f + tone);

        const float lfo = sinf(lfo_phase) * mod_depth;
        lfo_phase += 0.0018f;
        if (lfo_phase > 6.2831853f) lfo_phase -= 6.2831853f;
        sample *= 1.0f + lfo;

        const float delayed = delay_line[delay_index];
        delay_line[delay_index] = sample + delayed * 0.32f;
        delay_index = (delay_index + 1) % (int)(sizeof(delay_line) / sizeof(delay_line[0]));
        sample = sample * (1.0f - space_mix) + delayed * space_mix;

        clip = clip || fabsf(sample) > 0.98f;
        output_peak = fmaxf(output_peak, fabsf(sample));
        output[i] = float_to_s24(sample);
    }

    if (telemetry) {
        telemetry->input_level = clampf(input_peak, 0.0f, 1.0f);
        telemetry->pre_output_level = clampf(output_peak, 0.0f, 1.0f);
        telemetry->mic_level = clampf(mic_peak, 0.0f, 1.0f);
        telemetry->clip = clip;
    }
}
