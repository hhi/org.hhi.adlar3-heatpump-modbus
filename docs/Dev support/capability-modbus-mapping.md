# Capability naar Modbus-register mapping

Dit project is Aurora III-only. Dit document vat de runtime-mapping samen van Homey capabilities naar Aurora III Modbus-registers.

Bronnen in de code:

- `drivers/intelligent-heatpump-modbus/device.ts`
- `lib/modbus/adlar3-modbus-service.ts`
- `lib/modbus/adlar3-modbus-registers.ts`

## Notatie

Aurora III gebruikt Modicon-notatie:

- `3-NNNN`: input register, FC04, read-only.
- `4-NNNN`: holding register, FC03/FC06, read/write.

Temperatuurwaarden met x10-schaal worden als raw registerwaarde `temperatuur_C * 10` opgeslagen.

## Aurora III mapping

| Capability | Register | FC | Scaling | Bereik / mogelijke waarden |
|---|---:|---|---:|---|
| `adlar_antifreeze` | `3-38` bit 2 | FC04 input | bitmask | `false/true`, bit `0x0004` |
| `adlar_defrosting` | `3-38` bit 1 | FC04 input | bitmask | `false/true`, bit `0x0002` |
| `adlar_sterilization` | `3-38` bit 4 | FC04 input | bitmask | `false/true`, bit `0x0010` |
| `adlar_running` | afgeleid uit `3-79` of `3-80` | FC04 input | `3-79` x1 Hz | `true` als compressorfrequentie > 0 of pompstatus = 1 |
| `adlar_compressor_on` | `3-79` | FC04 input | x1 Hz | `true` als > 0 |
| `adlar_state_compressor_state` | `3-79` | FC04 input | x1 Hz | zelfde boolean als `adlar_compressor_on` |
| `adlar_state_defrost_state` | `3-38` bit 1 | FC04 input | bitmask | zelfde boolean als `adlar_defrosting` |
| `adlar_fault_shutdown` | `3-90..3-101` | FC04 input | codewaarde x1 | `true` als er actieve fault/protection codes zijn |
| `alarm_generic` | `3-90..3-101` | FC04 input | codewaarde x1 | `true` als er actieve fault/protection codes zijn |
| `adlar_fault` | `3-90..3-101` | FC04 input | codewaarde x1 | aantal actieve fault/protection codes |
| `adlar_fault_active` | `3-90..3-101` | FC04 input | codewaarde x1 | tekst met actieve codes; Aurora III code-to-description tabel is nog niet bekend |
| `adlar_mode` | `4-2100` | FC03/FC06 holding | x1 | `1=Cool`, `2=Heat`, `4=Auto`; `0=Off` bestaat in enum maar schrijven is geblokkeerd |
| `onoff` | `4-2100` | FC03/FC06 holding | x1 | read: `mode !== 0`; write is geblokkeerd totdat `2100=0` hardware-bevestigd is |
| `target_temperature` | `4-2107` | FC03/FC06 holding | raw = C x10 | registermetadata `18-50 C`; capability listener accepteert `15-60 C` |
| `target_temperature.cooling` | `4-2106` | FC03/FC06 holding | raw = C x10 | `7-25 C` |
| `target_temperature.dhw` | `4-2105` | FC03/FC06 holding | raw = C x10 | `20-75 C` |
| `target_temperature.floor` | `4-2114` | FC03/FC06 holding | raw = C x10 | gebruikt als room temperature setpoint; listener accepteert `20-60 C` |
| `target_temperature.indoor` | geen Modbus-write | n.v.t. | n.v.t. | alleen lokale/adaptieve-control waarde; listener accepteert `15-25 C` |
| `measure_temperature.outlet` | `3-43` | FC04 input | x0.1 C | geen harde min/max in registermetadata |
| `measure_temperature.inlet` | `3-42` | FC04 input | x0.1 C | geen harde min/max in registermetadata |
| `measure_temperature.ambient` | `3-50` | FC04 input | x0.1 C | overschreven door `adlar_external_ambient` als die gevuld is |
| `measure_temperature.outer_coil` | `3-49` | FC04 input | x0.1 C | geen harde min/max in registermetadata |
| `measure_temperature.suction` | `3-53` | FC04 input | x0.1 C | geen harde min/max in registermetadata |
| `measure_temperature.exhaust` | `3-52` | FC04 input | x0.1 C | geen harde min/max in registermetadata |
| `measure_temperature.dhw` | `3-46` | FC04 input | x0.1 C | geen harde min/max in registermetadata |
| `measure_temperature.buffer_tank` | `3-45` | FC04 input | x0.1 C | geen harde min/max in registermetadata |
| `measure_temperature.total_outlet` | `3-41` | FC04 input | x0.1 C | geen harde min/max in registermetadata |
| `measure_temperature.zone2` | `3-47` | FC04 input | x0.1 C | geen harde min/max in registermetadata |
| `adlar_high_pressure` | `3-86` | FC04 input | x1 kPa | schaal `@verify` |
| `adlar_low_pressure` | `3-87` | FC04 input | x1 kPa | schaal `@verify` |
| `measure_power` | afgeleid uit `3-74 * 3-75` | FC04 input | V x1, A x0.1 | geen native Aurora III power-register; overschreven door `adlar_external_power` als die gevuld is |
| `measure_voltage` | `3-74` | FC04 input | x1 V | geen harde min/max in registermetadata |
| `measure_current` | `3-75` | FC04 input | x0.1 A | kalibratie nog `@verify` |
| `measure_current.comp_phase` | `3-77` | FC04 input | x0.1 A | geen harde min/max in registermetadata |
| `measure_frequency.compressor_freq` | `3-79` | FC04 input | x1 Hz | UI max typisch `120 Hz` |
| `measure_frequency.comp_target_freq` | `3-78` | FC04 input | x1 Hz | geen harde min/max in registermetadata |
| `adlar_fan_speed` | `3-72` | FC04 input | x1 RPM | UI `0-3000` |
| `adlar_eev_step` | `3-70` | FC04 input | x1 steps | UI `0-500` |
| `adlar_evi_step` | `3-71` | FC04 input | x1 steps | UI `0-500`; register beschikbaarheid `@verify` |
| `adlar_pump_pwm` | `3-62` | FC04 input | x1 % | UI `0-100` |
| `adlar_water_flow` | `3-64` | FC04 input | x0.1 m3/h intern | unit/scale staat `@verify`; UI `0-60 L/min`; overschreven door `adlar_external_flow` als die gevuld is |

## Registers zonder directe capability

Deze registers worden wel gelezen of in snapshots verwerkt, maar hebben in de huidige `applyModbusSnapshot()` geen eigen Homey capability:

| Snapshotveld | Register | FC | Scaling | Opmerking |
|---|---:|---|---:|---|
| `roomTemp` | `3-40` | FC04 input | x0.1 C | geen directe capability |
| `pumpPwmFeedback` | `3-63` | FC04 input | x0.1 | niet opgenomen in `SENSOR_DESCRIPTORS` |
| `currentTargetOpMode` | `3-102` | FC04 input | x1 | enumwaarden onbekend |
| `actualOpMode` | `3-103` | FC04 input | x1 | enumwaarden onbekend |
| `zone1AutoHeatingSetTemp` | `4-2109` | FC03/FC06 holding | vermoedelijk x0.1 C | schrijven expliciet geblokkeerd wegens schaalrisico |

## Externe capabilities zonder directe Modbus-register mapping

| Capabilitygroep | Voorbeelden | Bron |
|---|---|---|
| Externe meetwaarden | `adlar_external_power`, `adlar_external_flow`, `adlar_external_ambient`, `adlar_external_solar_power`, `adlar_external_solar_radiation`, `adlar_external_wind_speed`, `adlar_external_indoor_temperature` | flow cards / weer- en externe sensorservices |
| Laatst ontvangen externe waarden | `adlar_last_*_received`, `adlar_openmeteo_last_fetch` | flow cards / Open-Meteo service |
| COP/SCOP en energie | `adlar_cop`, `adlar_cop_daily`, `adlar_cop_weekly`, `adlar_cop_monthly`, `adlar_scop`, `adlar_energy_cost_*`, `adlar_external_energy_*` | COP-, SCOP- en energy-tracking services |
| Prijsoptimalisatie | `adlar_energy_price_*`, `adlar_price_forecast_*`, `adlar_cheapest_block_start`, `adlar_price_savings_potential`, `energy_prices_data` | energy price optimizer |
| Adaptieve regeling en gebouwmodel | `adlar_simulated_target`, `adaptive_control_diagnostics`, `cop_optimizer_diagnostics`, `adlar_building_*`, `building_*` | adaptive/building services |
| Defrost-statistiek | `adlar_defrost_count_24h`, `adlar_defrost_minutes_24h`, `defrost_active_power` | defrost learner / flow-card service |
| Verbinding/status | `adlar_connection_status`, `adlar_connection_active`, `adlar_daily_disconnect_count` | service coordinator |

## Aandachtspunten

- `adlar_mode` is uitgelijnd op Aurora III: `0=Off`, `1=Cool`, `2=Heat`, `4=Auto`. Schrijven naar `0` is nog geblokkeerd door de runtime.
- Aurora III `onoff` schrijven is bewust geblokkeerd totdat bevestigd is dat `4-2100 = 0` veilig als uit-commando werkt.
- Aurora III waterflow (`3-64`) heeft in de registermetadata unit `m3/h` met schaal x0.1, maar de Homey capability toont `L/min`; de exacte unit/schaal staat nog als `@verify`.
- Aurora III heeft geen native input-power register. `measure_power` wordt afgeleid uit voltage en current, of vervangen door `adlar_external_power`.
