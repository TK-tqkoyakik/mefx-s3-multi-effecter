#include "preset_store.h"
#include "cJSON.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static int checks;
#define CHECK(expression) do { if (!(expression)) { fprintf(stderr, "Failed at line %d: %s\n", __LINE__, #expression); return 1; } checks++; } while (0)
static const char *valid = "{\"instrument\":\"guitar\",\"name\":\"Test\",\"effects\":{\"gain\":45,\"tone_eq\":50,\"compressor\":25,\"drive\":20,\"modulation\":0,\"delay_reverb\":10},\"bypass\":false,\"createdAt\":\"2026-10-22T00:00:00Z\",\"source\":\"manual\"}";

int main(void)
{
    preset_t preset = { 0 };
    CHECK(preset_from_json(valid, &preset) == ESP_OK);
    CHECK(preset.effects.gain == 45 && preset.instrument == INSTRUMENT_GUITAR && !preset.bypass);
    char output[512];
    strcpy(preset.name, "A\"B\\C");
    CHECK(preset_to_json(&preset, output, sizeof(output)) == ESP_OK);
    preset_t roundtrip;
    CHECK(preset_from_json(output, &roundtrip) == ESP_OK);
    CHECK(strcmp(roundtrip.name, preset.name) == 0);
    CHECK(preset_to_json(&preset, output, 10) == ESP_ERR_NO_MEM && output[0] == 0);
    CHECK(preset_from_json("{}", &preset) == ESP_ERR_INVALID_ARG);
    CHECK(preset_from_json("[]", &preset) == ESP_ERR_INVALID_ARG);
    CHECK(preset_from_json(NULL, &preset) == ESP_ERR_INVALID_ARG);
    cJSON *root = cJSON_Parse(valid);
    const char *fields[] = { "instrument", "name", "effects", "bypass", "createdAt", "source" };
    for (unsigned int i = 0; i < 6; i++) {
        cJSON *copy = cJSON_Duplicate(root, 1);
        cJSON_DeleteItemFromObjectCaseSensitive(copy, fields[i]);
        char *text = cJSON_PrintUnformatted(copy);
        CHECK(preset_from_json(text, &preset) == ESP_ERR_INVALID_ARG);
        cJSON_free(text); cJSON_Delete(copy);
    }
    cJSON *effects = cJSON_GetObjectItemCaseSensitive(root, "effects");
    const char *bad_numbers[] = { "\"45\"", "null", "true", "101", "-1", "1.5", "1e300" };
    for (unsigned int i = 0; i < 7; i++) {
        cJSON_ReplaceItemInObjectCaseSensitive(effects, "gain", cJSON_Parse(bad_numbers[i]));
        char *text = cJSON_PrintUnformatted(root);
        CHECK(preset_from_json(text, &preset) == ESP_ERR_INVALID_ARG);
        cJSON_free(text);
    }
    cJSON_Delete(root);
    root = cJSON_Parse(valid);
    cJSON_AddStringToObject(root, "name", "duplicate");
    char *text = cJSON_PrintUnformatted(root);
    CHECK(preset_from_json(text, &preset) == ESP_ERR_INVALID_ARG);
    cJSON_free(text); cJSON_Delete(root);
    const char *bad_names[] = { "\"\"", "\"123456789012345678901234567890123\"", "\"x\\u0000y\"", "\"x\\ny\"", "\"\\ud800\"" };
    for (unsigned int i = 0; i < sizeof(bad_names) / sizeof(*bad_names); i++) {
        char raw[480];
        const char *start = strstr(valid, "\"Test\"");
        snprintf(raw, sizeof(raw), "%.*s%s%s", (int)(start - valid), valid, bad_names[i], start + 6);
        CHECK(preset_from_json(raw, &preset) == ESP_ERR_INVALID_ARG);
    }
    preset_command_t command;
    CHECK(preset_command_from_json("{\"action\":\"delete\",\"slot\":15}", &command) == ESP_OK && command.slot == 15);
    CHECK(preset_command_from_json("{\"action\":\"list\",\"offset\":0}", &command) == ESP_OK && command.action == PRESET_COMMAND_LIST);
    const char *bad[] = {
        "{\"action\":\"read\",\"slot\":\"0\"}", "{\"action\":\"delete\",\"slot\":null}",
        "{\"action\":\"delete\",\"slot\":-1}", "{\"action\":\"delete\",\"slot\":16}",
        "{\"action\":\"delete\",\"slot\":0.5}", "{\"action\":\"delete\",\"slot\":0,\"slot\":1}",
        "{\"action\":\"read\",\"slot\":0,\"notes\":\"delete\"}", "{\"action\":\"READ\",\"slot\":0}",
        "{\"action\":\"delete\\u0000read\",\"slot\":0}", "{\"action\":\"read\",\"slot\":0} trailing",
        "{\"action\":\"list\",\"offset\":{\"x\":[[]]}}", "{\"action\":\"list\",\"offset\":false}"
    };
    for (unsigned int i = 0; i < sizeof(bad) / sizeof(*bad); i++) CHECK(preset_command_from_json(bad[i], &command) == ESP_ERR_INVALID_ARG);
    puts("Preset JSON: all checks passed");
    printf("Checks: %d\n", checks);
    return 0;
}
