#pragma once
/* Host-test subset of ESP-IDF's error ABI; production uses the real header. */
typedef int esp_err_t;
#define ESP_OK 0
#define ESP_ERR_NO_MEM 0x101
#define ESP_ERR_INVALID_ARG 0x102
