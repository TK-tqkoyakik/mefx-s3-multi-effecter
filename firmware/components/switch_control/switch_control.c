#include "switch_control.h"

#include "driver/gpio.h"
#include "dsp.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "preset_store.h"

static const char *TAG = "switch";
static const gpio_num_t FOOTSWITCH_GPIO = GPIO_NUM_0;

static void switch_task(void *arg)
{
    bool was_down = false;
    TickType_t pressed_at = 0;

    while (true) {
        bool down = gpio_get_level(FOOTSWITCH_GPIO) == 0;
        if (down && !was_down) pressed_at = xTaskGetTickCount();
        if (!down && was_down) {
            TickType_t held = xTaskGetTickCount() - pressed_at;
            preset_t preset;
            if (preset_store_load_active(&preset) == ESP_OK) {
                if (held > pdMS_TO_TICKS(800)) {
                    preset.bypass = !preset.bypass;
                    ESP_LOGI(TAG, "Long press: bypass=%d", preset.bypass);
                } else {
                    ESP_LOGI(TAG, "Short press: reapply active preset");
                }
                int slot;
                preset_store_save(&preset, &slot);
            }
        }
        was_down = down;
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

esp_err_t switch_control_start(void)
{
    gpio_config_t config = {
        .pin_bit_mask = 1ULL << FOOTSWITCH_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_RETURN_ON_ERROR(gpio_config(&config), TAG, "configure switch");
    BaseType_t ok = xTaskCreate(switch_task, "switch", 3072, NULL, 8, NULL);
    return ok == pdPASS ? ESP_OK : ESP_ERR_NO_MEM;
}
