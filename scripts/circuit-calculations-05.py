import math


def fc_lowpass(r_ohm, c_f):
    return 1 / (2 * math.pi * r_ohm * c_f)


def fc_highpass(r_ohm, c_f):
    return 1 / (2 * math.pi * r_ohm * c_f)


checks = [
    ("ADC input anti-alias / RF low-pass", fc_lowpass(2000, 220e-12), "2k + 220pF"),
    ("DAC output low-pass approx", fc_lowpass(470, 3.3e-9), "470R + 3.3nF"),
    ("DAC DC-block high-pass", fc_highpass(10000, 10e-6), "10k + 10uF"),
]

print("MEFX-S3 PCBA 05 circuit calculations")
print("====================================")
for name, hz, parts in checks:
    print(f"{name}: {parts} -> fc={hz:.2f} Hz")

print()
print("Power budget rough check")
print("------------------------")
loads = {
    "CS4270 VA/VD/VLC typical": 37e-3 + 13e-3,
    "AP2112 quiescent": 55e-6,
    "ESP32-S3 module allowance": 350e-3,
    "TL072 typical": 2.5e-3,
}
for name, current in loads.items():
    print(f"{name}: {current*1000:.1f} mA")
print(f"Estimated 5V-side main load: {(loads['CS4270 VA/VD/VLC typical'] + loads['ESP32-S3 module allowance'] + loads['TL072 typical']) * 1000:.1f} mA")
print("R-78E5.0-1.0 capacity: 1000 mA nominal -> OK for prototype margin")
print("AP2112 output: CS4270 digital logic + small logic load well below 600 mA -> OK")
