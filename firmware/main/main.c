#include "audio_io.h"
#include "ble_control.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "preset_store.h"
#include "switch_control.h"

static const char *TAG = "mefx_main";

void app_main(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    ESP_ERROR_CHECK(preset_store_init());
    ESP_ERROR_CHECK(ble_control_init());
    ESP_ERROR_CHECK(audio_io_start());
    ESP_ERROR_CHECK(switch_control_start());

    ESP_LOGI(TAG, "MEFX-S3 firmware started");
}
