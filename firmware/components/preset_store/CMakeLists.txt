idf_component_register(
  SRCS "preset_store.c" "preset_json.c"
  INCLUDE_DIRS "include"
  REQUIRES nvs_flash dsp
)
