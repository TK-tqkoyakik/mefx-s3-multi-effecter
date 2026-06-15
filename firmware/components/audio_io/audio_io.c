#include "audio_io.h"

#include "ble_control.h"
#include "driver/i2s_std.h"
#include "dsp.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>

static const char *TAG = "audio_io";
static const int BLOCK_FRAMES = 64;
static i2s_chan_handle_t rx_chan;
static i2s_chan_handle_t tx_chan;

#define I2S_ADC_BCLK GPIO_NUM_4
#define I2S_ADC_WS GPIO_NUM_5
#define I2S_ADC_DIN GPIO_NUM_6
#define I2S_DAC_BCLK GPIO_NUM_7
#define I2S_DAC_WS GPIO_NUM_15
#define I2S_DAC_DOUT GPIO_NUM_16

static esp_err_t init_i2s(void)
{
    i2s_chan_config_t rx_chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
    i2s_chan_config_t tx_chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
    ESP_RETURN_ON_ERROR(i2s_new_channel(&rx_chan_cfg, NULL, &rx_chan), TAG, "create i2s rx");
    ESP_RETURN_ON_ERROR(i2s_new_channel(&tx_chan_cfg, &tx_chan, NULL), TAG, "create i2s tx");

    i2s_std_config_t rx_std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(48000),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = I2S_ADC_BCLK,
            .ws = I2S_ADC_WS,
            .dout = I2S_GPIO_UNUSED,
            .din = I2S_ADC_DIN,
            .invert_flags = {
                .mclk_inv = false,
                .bclk_inv = false,
                .ws_inv = false,
            },
        },
    };

    i2s_std_config_t tx_std_cfg = {
        .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(48000),
        .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO),
        .gpio_cfg = {
            .mclk = I2S_GPIO_UNUSED,
            .bclk = I2S_DAC_BCLK,
            .ws = I2S_DAC_WS,
            .dout = I2S_DAC_DOUT,
            .din = I2S_GPIO_UNUSED,
            .invert_flags = {
                .mclk_inv = false,
                .bclk_inv = false,
                .ws_inv = false,
            },
        },
    };

    ESP_RETURN_ON_ERROR(i2s_channel_init_std_mode(rx_chan, &rx_std_cfg), TAG, "init i2s rx");
    ESP_RETURN_ON_ERROR(i2s_channel_init_std_mode(tx_chan, &tx_std_cfg), TAG, "init i2s tx");
    ESP_RETURN_ON_ERROR(i2s_channel_enable(rx_chan), TAG, "enable i2s rx");
    ESP_RETURN_ON_ERROR(i2s_channel_enable(tx_chan), TAG, "enable i2s tx");
    return ESP_OK;
}

static void audio_task(void *arg)
{
    int32_t rx_interleaved[BLOCK_FRAMES * 2];
    int32_t tx_interleaved[BLOCK_FRAMES * 2];
    int32_t input[BLOCK_FRAMES];
    int32_t mic[BLOCK_FRAMES];
    int32_t output[BLOCK_FRAMES];
    audio_telemetry_t telemetry;

    ESP_LOGI(TAG, "I2S pin map v1: ADC BCLK=4 WS=5 DIN=6, DAC BCLK=7 WS=15 DOUT=16");

    while (true) {
        size_t bytes_read = 0;
        esp_err_t read_err = i2s_channel_read(rx_chan, rx_interleaved, sizeof(rx_interleaved), &bytes_read, pdMS_TO_TICKS(20));
        if (read_err != ESP_OK || bytes_read < sizeof(rx_interleaved)) {
            memset(rx_interleaved, 0, sizeof(rx_interleaved));
        }

        for (int i = 0; i < BLOCK_FRAMES; i++) {
            input[i] = rx_interleaved[i * 2];
            mic[i] = rx_interleaved[i * 2 + 1];
        }

        dsp_process_block(input, mic, output, BLOCK_FRAMES, &telemetry);

        for (int i = 0; i < BLOCK_FRAMES; i++) {
            tx_interleaved[i * 2] = output[i];
            tx_interleaved[i * 2 + 1] = output[i];
        }

        size_t bytes_written = 0;
        ESP_ERROR_CHECK_WITHOUT_ABORT(i2s_channel_write(tx_chan, tx_interleaved, sizeof(tx_interleaved), &bytes_written, pdMS_TO_TICKS(20)));
        ble_control_publish_telemetry(&telemetry);
    }
}

esp_err_t audio_io_start(void)
{
    ESP_RETURN_ON_ERROR(init_i2s(), TAG, "init i2s");
    BaseType_t ok = xTaskCreatePinnedToCore(audio_task, "audio", 4096, NULL, 18, NULL, 1);
    return ok == pdPASS ? ESP_OK : ESP_ERR_NO_MEM;
}
