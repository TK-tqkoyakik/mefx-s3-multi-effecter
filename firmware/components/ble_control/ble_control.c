#include "ble_control.h"

#include "esp_check.h"
#include "esp_log.h"
#include "host/ble_hs.h"
#include "host/ble_uuid.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "preset_store.h"
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *TAG = "ble_control";
static uint16_t conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t status_val_handle;
static uint16_t telemetry_val_handle;
static uint32_t telemetry_divider = 0;
static uint8_t own_addr_type;
static char read_delete_response[512] = "{\"ok\":true}";

#define PRESET_LIST_PAGE_SIZE 4
#define PRESET_WRITE_MAX_BYTES 480

static const ble_uuid128_t service_uuid =
    BLE_UUID128_INIT(0x00, 0x01, 0xd2, 0xf5, 0x39, 0x7e, 0x61, 0x9a, 0x2a, 0x4c, 0x7d, 0x8b, 0x00, 0x00, 0x8f, 0x7d);
static const ble_uuid128_t preset_write_uuid =
    BLE_UUID128_INIT(0x00, 0x01, 0xd2, 0xf5, 0x39, 0x7e, 0x61, 0x9a, 0x2a, 0x4c, 0x7d, 0x8b, 0x01, 0x00, 0x8f, 0x7d);
static const ble_uuid128_t preset_list_uuid =
    BLE_UUID128_INIT(0x00, 0x01, 0xd2, 0xf5, 0x39, 0x7e, 0x61, 0x9a, 0x2a, 0x4c, 0x7d, 0x8b, 0x02, 0x00, 0x8f, 0x7d);
static const ble_uuid128_t preset_read_delete_uuid =
    BLE_UUID128_INIT(0x00, 0x01, 0xd2, 0xf5, 0x39, 0x7e, 0x61, 0x9a, 0x2a, 0x4c, 0x7d, 0x8b, 0x03, 0x00, 0x8f, 0x7d);
static const ble_uuid128_t status_uuid =
    BLE_UUID128_INIT(0x00, 0x01, 0xd2, 0xf5, 0x39, 0x7e, 0x61, 0x9a, 0x2a, 0x4c, 0x7d, 0x8b, 0x04, 0x00, 0x8f, 0x7d);
static const ble_uuid128_t telemetry_uuid =
    BLE_UUID128_INIT(0x00, 0x01, 0xd2, 0xf5, 0x39, 0x7e, 0x61, 0x9a, 0x2a, 0x4c, 0x7d, 0x8b, 0x05, 0x00, 0x8f, 0x7d);

static void advertise(void);

static int append_json(struct os_mbuf *om, const char *json)
{
    return os_mbuf_append(om, json, strlen(json)) == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
}

static void make_status_json(char *buffer, size_t len)
{
    preset_t preset;
    const bool has_preset = preset_store_load_active(&preset) == ESP_OK;
    snprintf(
        buffer,
        len,
        "{\"connected\":%s,\"instrument\":\"%s\",\"activeSlot\":%d,\"bypass\":%s,\"supplyMv\":9000}",
        conn_handle == BLE_HS_CONN_HANDLE_NONE ? "false" : "true",
        has_preset && preset.instrument == INSTRUMENT_BASS ? "bass" : "guitar",
        preset_store_active_slot(),
        has_preset && preset.bypass ? "true" : "false");
}

static bool buffer_append(char *buffer, size_t len, size_t *used, const char *format, ...)
{
    if (*used >= len) return false;
    va_list args;
    va_start(args, format);
    int written = vsnprintf(buffer + *used, len - *used, format, args);
    va_end(args);
    if (written < 0 || (size_t)written >= len - *used) return false;
    *used += (size_t)written;
    return true;
}

static bool buffer_append_json_string(char *buffer, size_t len, size_t *used, const char *value)
{
    if (!buffer_append(buffer, len, used, "\"")) return false;
    for (const unsigned char *cursor = (const unsigned char *)value; *cursor; cursor++) {
        if (*cursor == '\"' || *cursor == '\\') {
            if (!buffer_append(buffer, len, used, "\\%c", *cursor)) return false;
        } else if (*cursor < 0x20) {
            if (!buffer_append(buffer, len, used, "?")) return false;
        } else if (!buffer_append(buffer, len, used, "%c", *cursor)) {
            return false;
        }
    }
    return buffer_append(buffer, len, used, "\"");
}

static bool buffer_append_preset_summary(
    char *buffer,
    size_t len,
    size_t *used,
    int slot,
    const preset_t *preset,
    bool comma)
{
    if (!buffer_append(buffer, len, used, "%s{\"slot\":%d,\"name\":", comma ? "," : "", slot)) return false;
    if (!buffer_append_json_string(buffer, len, used, preset->name)) return false;
    return buffer_append(
        buffer,
        len,
        used,
        ",\"instrument\":\"%s\",\"source\":\"%s\"}",
        preset->instrument == INSTRUMENT_BASS ? "bass" : "guitar",
        preset->source[0] ? preset->source : "manual");
}

static int preset_list_json(char *buffer, size_t len)
{
    size_t used = 0;
    int count = 0;
    if (!buffer_append(buffer, len, &used, "[")) return BLE_ATT_ERR_INSUFFICIENT_RES;
    for (int slot = 0; slot < PRESET_STORE_MAX && count < PRESET_LIST_PAGE_SIZE; slot++) {
        preset_t preset;
        if (preset_store_load(slot, &preset) != ESP_OK) continue;
        size_t before = used;
        if (!buffer_append_preset_summary(buffer, len - 24, &used, slot, &preset, count > 0)) {
            if (count == 0) return BLE_ATT_ERR_INSUFFICIENT_RES;
            used = before;
            break;
        }
        count++;
    }
    return buffer_append(buffer, len, &used, "]") ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
}

static int preset_list_page_json(char *buffer, size_t len, int offset)
{
    if (offset < 0 || offset >= PRESET_STORE_MAX) offset = 0;
    size_t used = 0;
    int count = 0;
    int next_offset = -1;
    if (!buffer_append(buffer, len, &used, "{\"items\":[")) return BLE_ATT_ERR_INSUFFICIENT_RES;

    for (int slot = offset; slot < PRESET_STORE_MAX; slot++) {
        preset_t preset;
        if (preset_store_load(slot, &preset) != ESP_OK) continue;
        if (count >= PRESET_LIST_PAGE_SIZE) {
            next_offset = slot;
            break;
        }
        size_t before = used;
        if (!buffer_append_preset_summary(buffer, len - 24, &used, slot, &preset, count > 0)) {
            if (count == 0) return BLE_ATT_ERR_INSUFFICIENT_RES;
            used = before;
            next_offset = slot;
            break;
        }
        count++;
    }

    if (next_offset >= 0) {
        return buffer_append(buffer, len, &used, "],\"nextOffset\":%d}", next_offset)
            ? 0
            : BLE_ATT_ERR_INSUFFICIENT_RES;
    }
    return buffer_append(buffer, len, &used, "],\"nextOffset\":null}")
        ? 0
        : BLE_ATT_ERR_INSUFFICIENT_RES;
}

static int read_delete_command(const char *json)
{
    preset_command_t command;
    if (preset_command_from_json(json, &command) != ESP_OK) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    if (command.action == PRESET_COMMAND_LIST) {
        return preset_list_page_json(read_delete_response, sizeof(read_delete_response), command.offset);
    }
    const int slot = command.slot;
    int rc = 0;
    if (command.action == PRESET_COMMAND_DELETE) {
        if (preset_store_delete(slot) == ESP_OK) {
            snprintf(read_delete_response, sizeof(read_delete_response), "{\"ok\":true,\"deletedSlot\":%d}", slot);
            rc = 0;
        } else {
            rc = BLE_ATT_ERR_UNLIKELY;
        }
    } else if (command.action == PRESET_COMMAND_READ) {
        preset_t preset;
        esp_err_t err = preset_store_load(slot, &preset);
        if (err == ESP_OK && preset_to_json(&preset, read_delete_response, sizeof(read_delete_response)) == ESP_OK) {
            rc = 0;
        } else {
            rc = BLE_ATT_ERR_UNLIKELY;
        }
    } else {
        rc = BLE_ATT_ERR_REQ_NOT_SUPPORTED;
    }

    return rc;
}

static int gatt_access_cb(uint16_t conn, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    (void)conn;
    (void)attr_handle;
    (void)arg;

    char payload[640];
    switch (ctxt->op) {
    case BLE_GATT_ACCESS_OP_WRITE_CHR: {
        int len = OS_MBUF_PKTLEN(ctxt->om);
        if (len <= 0 || len > PRESET_WRITE_MAX_BYTES || len >= (int)sizeof(payload)) {
            return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        }
        if (ble_hs_mbuf_to_flat(ctxt->om, payload, sizeof(payload), NULL) != 0) return BLE_ATT_ERR_UNLIKELY;
        payload[len] = '\0';
        if (memchr(payload, 0, len)) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        return ble_control_handle_preset_write(payload) == ESP_OK ? 0 : BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    }
    case BLE_GATT_ACCESS_OP_READ_CHR:
        if (ble_uuid_cmp(ctxt->chr->uuid, &preset_list_uuid.u) == 0) {
            int rc = preset_list_json(payload, sizeof(payload));
            return rc == 0 ? append_json(ctxt->om, payload) : rc;
        }
        if (ble_uuid_cmp(ctxt->chr->uuid, &status_uuid.u) == 0) {
            make_status_json(payload, sizeof(payload));
            return append_json(ctxt->om, payload);
        }
        return BLE_ATT_ERR_REQ_NOT_SUPPORTED;
    default:
        return BLE_ATT_ERR_REQ_NOT_SUPPORTED;
    }
}

static int read_delete_access_cb(uint16_t conn, uint16_t attr_handle, struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    (void)conn;
    (void)attr_handle;
    (void)arg;
    if (ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
        return append_json(ctxt->om, read_delete_response);
    }
    if (ctxt->op != BLE_GATT_ACCESS_OP_WRITE_CHR) return BLE_ATT_ERR_REQ_NOT_SUPPORTED;

    char payload[128];
    int len = OS_MBUF_PKTLEN(ctxt->om);
    if (len <= 0 || len >= (int)sizeof(payload)) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    if (ble_hs_mbuf_to_flat(ctxt->om, payload, sizeof(payload), NULL) != 0) return BLE_ATT_ERR_UNLIKELY;
    payload[len] = '\0';
    if (memchr(payload, 0, len)) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    return read_delete_command(payload);
}

static const struct ble_gatt_svc_def gatt_services[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &service_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[]) {
            {
                .uuid = &preset_write_uuid.u,
                .access_cb = gatt_access_cb,
                .flags = BLE_GATT_CHR_F_WRITE,
            },
            {
                .uuid = &preset_list_uuid.u,
                .access_cb = gatt_access_cb,
                .flags = BLE_GATT_CHR_F_READ,
            },
            {
                .uuid = &preset_read_delete_uuid.u,
                .access_cb = read_delete_access_cb,
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_WRITE,
            },
            {
                .uuid = &status_uuid.u,
                .access_cb = gatt_access_cb,
                .val_handle = &status_val_handle,
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
            },
            {
                .uuid = &telemetry_uuid.u,
                .access_cb = gatt_access_cb,
                .val_handle = &telemetry_val_handle,
                .flags = BLE_GATT_CHR_F_NOTIFY,
            },
            { 0 },
        },
    },
    { 0 },
};

static int gap_event_cb(struct ble_gap_event *event, void *arg)
{
    (void)arg;
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status == 0) {
            conn_handle = event->connect.conn_handle;
            ESP_LOGI(TAG, "BLE connected");
            ble_control_publish_status();
        } else {
            ESP_LOGW(TAG, "BLE connect failed; restarting advertising");
            advertise();
        }
        return 0;
    case BLE_GAP_EVENT_DISCONNECT:
        ESP_LOGI(TAG, "BLE disconnected");
        conn_handle = BLE_HS_CONN_HANDLE_NONE;
        advertise();
        return 0;
    case BLE_GAP_EVENT_SUBSCRIBE:
        ESP_LOGI(TAG, "BLE subscribe attr=%u notify=%d", event->subscribe.attr_handle, event->subscribe.cur_notify);
        return 0;
    default:
        return 0;
    }
}

static void advertise(void)
{
    struct ble_hs_adv_fields fields = { 0 };
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.name = (const uint8_t *)MEFX_BLE_DEVICE_NAME;
    fields.name_len = strlen(MEFX_BLE_DEVICE_NAME);
    fields.name_is_complete = 1;
    fields.uuids128 = (ble_uuid128_t *)&service_uuid;
    fields.num_uuids128 = 1;
    fields.uuids128_is_complete = 1;
    ESP_ERROR_CHECK_WITHOUT_ABORT(ble_gap_adv_set_fields(&fields));

    struct ble_gap_adv_params params = { 0 };
    params.conn_mode = BLE_GAP_CONN_MODE_UND;
    params.disc_mode = BLE_GAP_DISC_MODE_GEN;
    int rc = ble_gap_adv_start(own_addr_type, NULL, BLE_HS_FOREVER, &params, gap_event_cb, NULL);
    if (rc != 0) ESP_LOGE(TAG, "advertise start failed: %d", rc);
}

static void on_sync(void)
{
    int rc = ble_hs_id_infer_auto(0, &own_addr_type);
    if (rc != 0) {
        ESP_LOGE(TAG, "BLE address infer failed: %d", rc);
        return;
    }
    advertise();
}

static void host_task(void *param)
{
    (void)param;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

esp_err_t ble_control_init(void)
{
    ESP_ERROR_CHECK_WITHOUT_ABORT(preset_store_apply_active());
    ESP_RETURN_ON_ERROR(nimble_port_init(), TAG, "nimble init");
    ble_hs_cfg.sync_cb = on_sync;
    ble_svc_gap_init();
    ble_svc_gatt_init();
    ble_svc_gap_device_name_set(MEFX_BLE_DEVICE_NAME);
    ESP_RETURN_ON_ERROR(ble_gatts_count_cfg(gatt_services), TAG, "gatt count");
    ESP_RETURN_ON_ERROR(ble_gatts_add_svcs(gatt_services), TAG, "gatt add");
    nimble_port_freertos_init(host_task);
    ESP_LOGI(TAG, "BLE service %s initialized for %s", MEFX_BLE_SERVICE_UUID, MEFX_BLE_DEVICE_NAME);
    return ESP_OK;
}

esp_err_t ble_control_handle_preset_write(const char *json)
{
    preset_t preset;
    int slot = 0;
    ESP_RETURN_ON_ERROR(preset_from_json(json, &preset), TAG, "parse preset json");
    ESP_RETURN_ON_ERROR(preset_store_save(&preset, &slot), TAG, "save preset from BLE");
    ESP_LOGI(TAG, "Stored BLE preset '%s' in slot %d", preset.name, slot);
    ble_control_publish_status();
    return ESP_OK;
}

void ble_control_publish_status(void)
{
    if (conn_handle == BLE_HS_CONN_HANDLE_NONE || status_val_handle == 0) return;
    char payload[160];
    make_status_json(payload, sizeof(payload));
    struct os_mbuf *om = ble_hs_mbuf_from_flat(payload, strlen(payload));
    if (!om) return;
    int rc = ble_gatts_notify_custom(conn_handle, status_val_handle, om);
    if (rc != 0) ESP_LOGW(TAG, "status notify failed: %d", rc);
}

void ble_control_publish_telemetry(const audio_telemetry_t *telemetry)
{
    if (telemetry == NULL) return;
    telemetry_divider++;
    // 64 frames at 48 kHz is 750 blocks/s. Notify at about 10 Hz.
    if (telemetry_divider % 75 != 0) return;
    if (conn_handle == BLE_HS_CONN_HANDLE_NONE || telemetry_val_handle == 0) return;

    char payload[128];
    snprintf(
        payload,
        sizeof(payload),
        "{\"inputLevel\":%.3f,\"preOutputLevel\":%.3f,\"micLevel\":%.3f,\"clip\":%s}",
        telemetry->input_level,
        telemetry->pre_output_level,
        telemetry->mic_level,
        telemetry->clip ? "true" : "false");
    struct os_mbuf *om = ble_hs_mbuf_from_flat(payload, strlen(payload));
    if (!om) return;
    int rc = ble_gatts_notify_custom(conn_handle, telemetry_val_handle, om);
    if (rc != 0) ESP_LOGD(TAG, "telemetry notify failed: %d", rc);
}
