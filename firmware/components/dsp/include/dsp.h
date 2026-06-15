#pragma once

#include <stdbool.h>
#include <stdint.h>

typedef enum {
    INSTRUMENT_GUITAR = 0,
    INSTRUMENT_BASS = 1
} instrument_t;

typedef struct {
    uint8_t gain;
    uint8_t tone_eq;
    uint8_t compressor;
    uint8_t drive;
    uint8_t modulation;
    uint8_t delay_reverb;
} effect_values_t;

typedef struct {
    char name[41];
    instrument_t instrument;
    effect_values_t effects;
    bool bypass;
    char source[9];
    char created_at[32];
} preset_t;

typedef struct {
    float input_level;
    float pre_output_level;
    float mic_level;
    bool clip;
} audio_telemetry_t;

void dsp_set_preset(const preset_t *preset);
void dsp_process_block(const int32_t *input, const int32_t *mic, int32_t *output, int frames, audio_telemetry_t *telemetry);
