idf_component_register(
  SRCS "main.c"
  INCLUDE_DIRS "."
  REQUIRES nvs_flash dsp preset_store ble_control audio_io switch_control
)
