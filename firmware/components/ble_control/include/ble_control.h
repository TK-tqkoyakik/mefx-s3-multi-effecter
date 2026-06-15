#pragma once

#include "dsp.h"
#include "esp_err.h"

#define MEFX_BLE_DEVICE_NAME "MEFX-S3"
#define MEFX_BLE_SERVICE_UUID "7d8f0000-8b7d-4c2a-9a61-7e39f5d20100"
#define MEFX_BLE_PRESET_WRITE_UUID "7d8f0001-8b7d-4c2a-9a61-7e39f5d20100"
#define MEFX_BLE_PRESET_LIST_UUID "7d8f0002-8b7d-4c2a-9a61-7e39f5d20100"
#define MEFX_BLE_PRESET_READ_DELETE_UUID "7d8f0003-8b7d-4c2a-9a61-7e39f5d20100"
#define MEFX_BLE_DEVICE_STATUS_UUID "7d8f0004-8b7d-4c2a-9a61-7e39f5d20100"
#define MEFX_BLE_AUDIO_TELEMETRY_UUID "7d8f0005-8b7d-4c2a-9a61-7e39f5d20100"

esp_err_t ble_control_init(void);
esp_err_t ble_control_handle_preset_write(const char *json);
void ble_control_publish_status(void);
void ble_control_publish_telemetry(const audio_telemetry_t *telemetry);
