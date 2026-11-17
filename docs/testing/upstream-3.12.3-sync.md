# Aurora III synchronization with upstream 3.12.3

Source main: `9b0556e1e25022ca439faad9139323b18fc5cbf4`.

Includes positional hysteresis and target-shift limiting, indoor-staleness
protection, Modbus transport lifecycle fixes, automatic price thresholds,
24-hour pre-heating model means, Classic PI startup settings and the Aurora III
process schema. Standalone driver IDs and the default dashboard port 8090 remain.
Aurora I/II parameter banks and refrigerant temperature scaling are excluded.

The 85 pre-existing untracked copies with ` 2` in their filenames are retained.
Build, lint and packaging exclude these backup copies; they are not source files
for this update. Run `npm test`, `npm run lint` and `homey app validate`.

On hardware, check update migration to fixed price thresholds, the indoor sensor
staleness and recovery notifications, custom PI values after restart, then
compare the process schema with the expert register view (3-42/43, 3-64,
3-80/81 and 3-86/87). Native Aurora III temperatures remain in tenths of a degree.

Existing standalone Flow IDs are also used by runtime registrations and snapshot
triggers; the main-app `_aurora3` suffix is removed only when the unsuffixed ID
exists in the standalone manifest. Regression tests cross-check both sources.
The standalone dashboard history reads the unsuffixed indoor capability.

Local Homey Compose validation temporarily holds the pre-existing capability JSON
copy outside the source folder, then restores it. This prevents that untracked
copy from adding a spurious capability to the generated manifest.
