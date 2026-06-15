idf_component_register(
  SRCS "switch_control.c"
  INCLUDE_DIRS "include"
  REQUIRES esp_driver_gpio preset_store
)
