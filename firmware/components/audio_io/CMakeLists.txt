idf_component_register(
  SRCS "audio_io.c"
  INCLUDE_DIRS "include"
  REQUIRES dsp ble_control esp_driver_i2s
)
