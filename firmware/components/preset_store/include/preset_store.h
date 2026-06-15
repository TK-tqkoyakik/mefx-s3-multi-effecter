#pragma once

#include "dsp.h"
#include "esp_err.h"

#define PRESET_STORE_MAX 16

esp_err_t preset_store_init(void);
esp_err_t preset_store_save(const preset_t *preset, int *slot_out);
esp_err_t preset_store_load(int slot, preset_t *preset_out);
esp_err_t preset_store_delete(int slot);
int preset_store_active_slot(void);
esp_err_t preset_store_load_active(preset_t *preset_out);
esp_err_t preset_store_apply_active(void);
esp_err_t preset_from_json(const char *json, preset_t *preset_out);
esp_err_t preset_to_json(const preset_t *preset, char *buffer, size_t buffer_len);
