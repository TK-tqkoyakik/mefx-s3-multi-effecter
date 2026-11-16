#include "preset_store.h"
#include "cJSON.h"
#include <math.h>
#include <stdio.h>
#include <string.h>

static const char *effect_keys[] = {
    "gain", "tone_eq", "compressor", "drive", "modulation", "delay_reverb"
};

/* cJSON decodes escapes; validate the decoded text before copying fixed buffers. */
static bool valid_text(const char *s, size_t max)
{
    if (!s || !*s || strlen(s) > max) return false;
    const unsigned char *p = (const unsigned char *)s;
    while (*p) {
        unsigned int cp = *p++;
        if (cp < 0x20 || cp == 0x7f) return false;
        if (cp < 0x80) continue;
        int n;
        unsigned int min;
        if (cp >= 0xc2 && cp <= 0xdf) { n = 1; cp &= 0x1f; min = 0x80; }
        else if (cp >= 0xe0 && cp <= 0xef) { n = 2; cp &= 0x0f; min = 0x800; }
        else if (cp >= 0xf0 && cp <= 0xf4) { n = 3; cp &= 7; min = 0x10000; }
        else return false;
        while (n--) {
            if ((*p & 0xc0) != 0x80) return false;
            cp = (cp << 6) | (*p++ & 0x3f);
        }
        if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return false;
    }
    return true;
}

static bool object_keys(const cJSON *object, const char *const *keys, size_t count)
{
    if (!cJSON_IsObject(object)) return false;
    const cJSON *item;
    cJSON_ArrayForEach(item, object) {
        bool known = false;
        for (size_t i = 0; i < count; i++) if (item->string && strcmp(item->string, keys[i]) == 0) known = true;
        if (!known) return false;
        for (const cJSON *prior = object->child; prior != item; prior = prior->next) {
            if (strcmp(prior->string, item->string) == 0) return false;
        }
    }
    return true;
}

static cJSON *parse(const char *json, size_t max)
{
    if (!json || !*json || strlen(json) > max) return NULL;
    int depth = 0;
    bool quoted = false;
    /* Embedded NUL escapes would be truncated by cJSON's C-string API. */
    for (const char *p = json; *p; p++) {
        if (*p == '\\' && p[1]) {
            if (strncmp(p + 1, "u0000", 5) == 0) return NULL;
            p++;
        } else if (*p == '"') {
            quoted = !quoted;
        } else if (!quoted && (*p == '{' || *p == '[')) {
            if (++depth > 2) return NULL;
        } else if (!quoted && (*p == '}' || *p == ']')) {
            if (--depth < 0) return NULL;
        }
    }
    if (quoted || depth != 0) return NULL;
    return cJSON_ParseWithOpts(json, NULL, true);
}

static bool integer(const cJSON *item, int min, int max)
{
    return cJSON_IsNumber(item) && isfinite(item->valuedouble) &&
        item->valuedouble >= min && item->valuedouble <= max && floor(item->valuedouble) == item->valuedouble;
}

esp_err_t preset_from_json(const char *json, preset_t *out)
{
    if (!out) return ESP_ERR_INVALID_ARG;
    cJSON *root = parse(json, 480);
    static const char *keys[] = { "instrument", "name", "effects", "bypass", "createdAt", "source" };
    esp_err_t result = ESP_ERR_INVALID_ARG;
    if (!object_keys(root, keys, 6) || cJSON_GetArraySize(root) != 6) goto done;
    const cJSON *name = cJSON_GetObjectItemCaseSensitive(root, "name");
    const cJSON *instrument = cJSON_GetObjectItemCaseSensitive(root, "instrument");
    const cJSON *source = cJSON_GetObjectItemCaseSensitive(root, "source");
    const cJSON *created = cJSON_GetObjectItemCaseSensitive(root, "createdAt");
    const cJSON *bypass = cJSON_GetObjectItemCaseSensitive(root, "bypass");
    const cJSON *effects = cJSON_GetObjectItemCaseSensitive(root, "effects");
    if (!cJSON_IsString(name) || !valid_text(name->valuestring, 32) ||
        !cJSON_IsString(instrument) || (strcmp(instrument->valuestring, "guitar") && strcmp(instrument->valuestring, "bass")) ||
        !cJSON_IsString(source) || (strcmp(source->valuestring, "manual") && strcmp(source->valuestring, "youtube")) ||
        !cJSON_IsString(created) || (*created->valuestring && !valid_text(created->valuestring, sizeof(out->created_at) - 1)) ||
        !cJSON_IsBool(bypass) || !object_keys(effects, effect_keys, 6) || cJSON_GetArraySize(effects) != 6) goto done;
    preset_t preset = { 0 };
    uint8_t *values[] = { &preset.effects.gain, &preset.effects.tone_eq, &preset.effects.compressor,
        &preset.effects.drive, &preset.effects.modulation, &preset.effects.delay_reverb };
    for (size_t i = 0; i < 6; i++) {
        const cJSON *value = cJSON_GetObjectItemCaseSensitive(effects, effect_keys[i]);
        if (!integer(value, 0, 100)) goto done;
        *values[i] = (uint8_t)value->valueint;
    }
    strcpy(preset.name, name->valuestring);
    strcpy(preset.source, source->valuestring);
    strcpy(preset.created_at, created->valuestring);
    preset.instrument = strcmp(instrument->valuestring, "bass") == 0 ? INSTRUMENT_BASS : INSTRUMENT_GUITAR;
    preset.bypass = cJSON_IsTrue(bypass);
    *out = preset;
    result = ESP_OK;
done:
    cJSON_Delete(root);
    return result;
}

esp_err_t preset_to_json(const preset_t *preset, char *buffer, size_t len)
{
    if (!preset || !buffer || len == 0 ||
        !memchr(preset->name, 0, sizeof(preset->name)) ||
        !memchr(preset->source, 0, sizeof(preset->source)) ||
        !memchr(preset->created_at, 0, sizeof(preset->created_at))) return ESP_ERR_INVALID_ARG;
    cJSON *root = cJSON_CreateObject();
    if (!root) return ESP_ERR_NO_MEM;
    cJSON *effects = NULL;
    bool ok = cJSON_AddStringToObject(root, "instrument", preset->instrument == INSTRUMENT_BASS ? "bass" : "guitar") &&
        cJSON_AddStringToObject(root, "name", preset->name) &&
        (effects = cJSON_AddObjectToObject(root, "effects")) &&
        cJSON_AddBoolToObject(root, "bypass", preset->bypass) &&
        cJSON_AddStringToObject(root, "createdAt", preset->created_at) &&
        cJSON_AddStringToObject(root, "source", preset->source[0] ? preset->source : "manual");
    const uint8_t values[] = { preset->effects.gain, preset->effects.tone_eq, preset->effects.compressor,
        preset->effects.drive, preset->effects.modulation, preset->effects.delay_reverb };
    for (size_t i = 0; ok && i < 6; i++) ok = cJSON_AddNumberToObject(effects, effect_keys[i], values[i]) != NULL;
    ok = ok && len <= INT32_MAX && cJSON_PrintPreallocated(root, buffer, (int)len, false);
    cJSON_Delete(root);
    if (!ok) buffer[0] = 0;
    return ok ? ESP_OK : ESP_ERR_NO_MEM;
}

esp_err_t preset_command_from_json(const char *json, preset_command_t *out)
{
    if (!out) return ESP_ERR_INVALID_ARG;
    cJSON *root = parse(json, 127);
    const cJSON *action = cJSON_GetObjectItemCaseSensitive(root, "action");
    esp_err_t result = ESP_ERR_INVALID_ARG;
    if (!cJSON_IsString(action)) goto done;
    bool list = strcmp(action->valuestring, "list") == 0;
    bool read = strcmp(action->valuestring, "read") == 0;
    bool del = strcmp(action->valuestring, "delete") == 0;
    const char *keys[] = { "action", list ? "offset" : "slot" };
    if ((!list && !read && !del) || !object_keys(root, keys, 2) || cJSON_GetArraySize(root) != 2) goto done;
    const cJSON *value = cJSON_GetObjectItemCaseSensitive(root, keys[1]);
    if (!integer(value, 0, PRESET_STORE_MAX - 1)) goto done;
    *out = (preset_command_t){ .action = list ? PRESET_COMMAND_LIST : read ? PRESET_COMMAND_READ : PRESET_COMMAND_DELETE,
        .slot = list ? 0 : value->valueint, .offset = list ? value->valueint : 0 };
    result = ESP_OK;
done:
    cJSON_Delete(root);
    return result;
}
