#include "preset_store.h"

#include "esp_check.h"
#include "esp_log.h"
#include "nvs.h"
#include <stdbool.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

static const char *TAG = "preset_store";
static const char *NAMESPACE = "presets";

static nvs_handle_t handle;

static uint8_t clamp_u8(int value)
{
    if (value < 0) return 0;
    if (value > 100) return 100;
    return (uint8_t)value;
}

static bool json_string_value(const char *json, const char *key, char *out, size_t out_len)
{
    char pattern[32];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *pos = strstr(json, pattern);
    if (!pos) return false;
    pos = strchr(pos + strlen(pattern), ':');
    if (!pos) return false;
    pos++;
    while (*pos == ' ' || *pos == '\t') pos++;
    if (*pos != '"') return false;
    pos++;
    const char *end = strchr(pos, '"');
    if (!end) return false;
    size_t len = (size_t)(end - pos);
    if (len >= out_len) len = out_len - 1;
    memcpy(out, pos, len);
    out[len] = '\0';
    return true;
}

static bool json_bool_value(const char *json, const char *key, bool fallback)
{
    char pattern[32];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *pos = strstr(json, pattern);
    if (!pos) return fallback;
    pos = strchr(pos + strlen(pattern), ':');
    if (!pos) return fallback;
    pos++;
    while (*pos == ' ' || *pos == '\t') pos++;
    if (strncmp(pos, "true", 4) == 0) return true;
    if (strncmp(pos, "false", 5) == 0) return false;
    return fallback;
}

static int json_int_value(const char *json, const char *key, int fallback)
{
    char pattern[32];
    snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    const char *pos = strstr(json, pattern);
    if (!pos) return fallback;
    pos = strchr(pos + strlen(pattern), ':');
    if (!pos) return fallback;
    return atoi(pos + 1);
}

esp_err_t preset_store_init(void)
{
    return nvs_open(NAMESPACE, NVS_READWRITE, &handle);
}

esp_err_t preset_store_save(const preset_t *preset, int *slot_out)
{
    if (preset == NULL) return ESP_ERR_INVALID_ARG;
    char key[8];
    int slot = 0;
    for (; slot < PRESET_STORE_MAX; slot++) {
        snprintf(key, sizeof(key), "slot%d", slot);
        size_t required = 0;
        esp_err_t err = nvs_get_blob(handle, key, NULL, &required);
        if (err == ESP_ERR_NVS_NOT_FOUND) break;
    }
    if (slot >= PRESET_STORE_MAX) slot = 0;
    snprintf(key, sizeof(key), "slot%d", slot);
    ESP_RETURN_ON_ERROR(nvs_set_blob(handle, key, preset, sizeof(*preset)), TAG, "save preset");
    ESP_RETURN_ON_ERROR(nvs_set_i32(handle, "active", slot), TAG, "set active slot");
    ESP_RETURN_ON_ERROR(nvs_commit(handle), TAG, "commit preset");
    dsp_set_preset(preset);
    if (slot_out) *slot_out = slot;
    return ESP_OK;
}

esp_err_t preset_store_load(int slot, preset_t *preset_out)
{
    if (preset_out == NULL || slot < 0 || slot >= PRESET_STORE_MAX) return ESP_ERR_INVALID_ARG;
    char key[8];
    size_t size = sizeof(*preset_out);
    snprintf(key, sizeof(key), "slot%d", slot);
    return nvs_get_blob(handle, key, preset_out, &size);
}

esp_err_t preset_store_delete(int slot)
{
    if (slot < 0 || slot >= PRESET_STORE_MAX) return ESP_ERR_INVALID_ARG;
    char key[8];
    snprintf(key, sizeof(key), "slot%d", slot);
    esp_err_t err = nvs_erase_key(handle, key);
    if (err == ESP_ERR_NVS_NOT_FOUND) return ESP_OK;
    ESP_RETURN_ON_ERROR(err, TAG, "erase preset");
    return nvs_commit(handle);
}

int preset_store_active_slot(void)
{
    int32_t active = 0;
    nvs_get_i32(handle, "active", &active);
    if (active < 0 || active >= PRESET_STORE_MAX) return 0;
    return (int)active;
}

esp_err_t preset_store_load_active(preset_t *preset_out)
{
    return preset_store_load(preset_store_active_slot(), preset_out);
}

esp_err_t preset_store_apply_active(void)
{
    preset_t preset;
    esp_err_t err = preset_store_load_active(&preset);
    if (err == ESP_OK) {
        dsp_set_preset(&preset);
        ESP_LOGI(TAG, "Applied active preset: %s", preset.name);
    }
    return err == ESP_ERR_NVS_NOT_FOUND ? ESP_OK : err;
}

esp_err_t preset_from_json(const char *json, preset_t *preset_out)
{
    if (!json || !preset_out) return ESP_ERR_INVALID_ARG;

    memset(preset_out, 0, sizeof(*preset_out));
    char instrument[8] = "guitar";
    if (!json_string_value(json, "name", preset_out->name, sizeof(preset_out->name))) return ESP_ERR_INVALID_ARG;
    json_string_value(json, "instrument", instrument, sizeof(instrument));
    preset_out->instrument = strcmp(instrument, "bass") == 0 ? INSTRUMENT_BASS : INSTRUMENT_GUITAR;
    preset_out->bypass = json_bool_value(json, "bypass", false);
    if (!json_string_value(json, "source", preset_out->source, sizeof(preset_out->source))) {
        strncpy(preset_out->source, "manual", sizeof(preset_out->source) - 1);
    }
    json_string_value(json, "createdAt", preset_out->created_at, sizeof(preset_out->created_at));
    preset_out->effects.gain = clamp_u8(json_int_value(json, "gain", 45));
    preset_out->effects.tone_eq = clamp_u8(json_int_value(json, "tone_eq", 50));
    preset_out->effects.compressor = clamp_u8(json_int_value(json, "compressor", 25));
    preset_out->effects.drive = clamp_u8(json_int_value(json, "drive", 20));
    preset_out->effects.modulation = clamp_u8(json_int_value(json, "modulation", 0));
    preset_out->effects.delay_reverb = clamp_u8(json_int_value(json, "delay_reverb", 10));
    return ESP_OK;
}

esp_err_t preset_to_json(const preset_t *preset, char *buffer, size_t buffer_len)
{
    if (!preset || !buffer || buffer_len == 0) return ESP_ERR_INVALID_ARG;
    int written = snprintf(
        buffer,
        buffer_len,
        "{\"instrument\":\"%s\",\"name\":\"%s\",\"effects\":{\"gain\":%u,\"tone_eq\":%u,\"compressor\":%u,\"drive\":%u,\"modulation\":%u,\"delay_reverb\":%u},\"bypass\":%s,\"createdAt\":\"%s\",\"source\":\"%s\"}",
        preset->instrument == INSTRUMENT_BASS ? "bass" : "guitar",
        preset->name,
        preset->effects.gain,
        preset->effects.tone_eq,
        preset->effects.compressor,
        preset->effects.drive,
        preset->effects.modulation,
        preset->effects.delay_reverb,
        preset->bypass ? "true" : "false",
        preset->created_at,
        preset->source[0] ? preset->source : "manual");
    return written > 0 && written < (int)buffer_len ? ESP_OK : ESP_ERR_NO_MEM;
}
