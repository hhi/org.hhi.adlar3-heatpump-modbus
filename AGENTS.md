# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript Homey app for an Adlar Aurora III heat pump over Modbus. The entry point is `app.ts`; device and driver code lives in `drivers/intelligent-heatpump-modbus/`. Core runtime logic is under `lib/`, with Modbus definitions in `lib/modbus/`, adaptive control in `lib/adaptive/`, services in `lib/services/`, and shared types in `lib/types/`.

Homey metadata, capabilities, and flow cards are generated from `.homeycompose/`. Static dashboards are in `public/`, icons are in `assets/`, translations are in `locales/`, and setup or technical notes are in `docs/` and `ADR/`. The `test/` directory contains standalone Modbus scripts and simulator files, not a full test runner.

## Build, Test, and Development Commands

- `npm run build` compiles TypeScript into `.homeybuild/`.
- `npm run lint` runs ESLint with the `athom/homey-app` ruleset.
- `homey app validate` validates the Homey app structure after a build.
- `homey app validate -l debug` gives detailed Homey validation output.
- `npx tsx test/test-adlar3-registers.ts` runs register-map assertions.
- `npx tsx test/test-sim3-registers.ts <IP> dump` inspects simulator register data; see `test/readme.md`.

Always run `npm run build` after source changes. Run lint when touching TypeScript, compose JSON, or dashboard scripts.

## Coding Style & Naming Conventions

Use TypeScript targeting Node 16. Follow the existing two-space indentation, single quotes, explicit service classes, and descriptive file names such as `modbus-connection-service.ts`. Keep Homey capability IDs and compose files stable; new capability files belong in `.homeycompose/capabilities/` and should match existing `adlar_*` naming where applicable.

Prefer typed interfaces over loose objects. For Homey timers, use `this.homey.setTimeout()` and `this.homey.setInterval()` instead of global timers.

## Testing Guidelines

There is no automated coverage threshold. Add focused assertions to `test/test-adlar3-registers.ts` for register-map or calculation changes. Use `test/test-sim3-registers.ts` with a Modbus simulator for connection, read/write, and polling behavior.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries, for example `Release 1.0.5` and `Fix expert dashboard text selection on Safari`. Keep commits scoped and mention the affected feature. Pull requests should include a concise description, validation performed (`npm run build`, lint, Homey validation, simulator checks), linked issues when relevant, and screenshots for dashboard or pairing UI changes.

## Security & Configuration Tips

Do not commit local secrets or device-specific settings from `env.json`. Treat expert dashboard writes and Modbus holding-register changes carefully, because writable registers can alter heat pump behavior.
