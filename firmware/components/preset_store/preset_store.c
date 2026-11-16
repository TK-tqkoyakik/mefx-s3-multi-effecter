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
    preset_t candidate;
    esp_err_t err = nvs_get_blob(handle, key, &candidate, &size);
    if (err != ESP_OK) return err;
    if (size != sizeof(candidate) || !memchr(candidate.name, 0, sizeof(candidate.name)) ||
        !memchr(candidate.source, 0, sizeof(candidate.source)) ||
        !memchr(candidate.created_at, 0, sizeof(candidate.created_at)) ||
        (candidate.instrument != INSTRUMENT_GUITAR && candidate.instrument != INSTRUMENT_BASS) ||
        (strcmp(candidate.source, "manual") && strcmp(candidate.source, "youtube"))) return ESP_ERR_INVALID_STATE;
    const uint8_t values[] = { candidate.effects.gain, candidate.effects.tone_eq, candidate.effects.compressor,
        candidate.effects.drive, candidate.effects.modulation, candidate.effects.delay_reverb };
    for (size_t i = 0; i < sizeof(values); i++) if (values[i] > 100) return ESP_ERR_INVALID_STATE;
    *preset_out = candidate;
    return ESP_OK;
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

esp_err_t preset_store_activate(int slot)
{
    preset_t preset;
    ESP_RETURN_ON_ERROR(preset_store_load(slot, &preset), TAG, "load preset to activate");
    ESP_RETURN_ON_ERROR(nvs_set_i32(handle, "active", slot), TAG, "set active preset");
    ESP_RETURN_ON_ERROR(nvs_commit(handle), TAG, "commit active preset");
    dsp_set_preset(&preset);
    ESP_LOGI(TAG, "Activated slot %d: %s", slot, preset.name);
    return ESP_OK;
}

esp_err_t preset_store_activate_next(void)
{
    const int current = preset_store_active_slot();
    for (int offset = 1; offset <= PRESET_STORE_MAX; offset++) {
        const int slot = (current + offset) % PRESET_STORE_MAX;
        preset_t preset;
        if (preset_store_load(slot, &preset) == ESP_OK) {
            return preset_store_activate(slot);
        }
    }
    return ESP_ERR_NOT_FOUND;
}

esp_err_t preset_store_update_active(const preset_t *preset)
{
    if (preset == NULL) return ESP_ERR_INVALID_ARG;
    const int slot = preset_store_active_slot();
    char key[8];
    snprintf(key, sizeof(key), "slot%d", slot);
    ESP_RETURN_ON_ERROR(nvs_set_blob(handle, key, preset, sizeof(*preset)), TAG, "update active preset");
    ESP_RETURN_ON_ERROR(nvs_commit(handle), TAG, "commit active preset update");
    dsp_set_preset(preset);
    return ESP_OK;
}
