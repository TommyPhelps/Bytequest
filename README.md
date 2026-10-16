# BYTEQUEST.EXE

A local-first Windows 11 lab for learning computing by doing: **see → build → break → fix → recall → apply**.
You choose a subject, difficulty and how much time you have. BYTEQUEST gives you a mission with a working deliverable, a diagram, safe step-by-step instructions, hints that get more specific as you ask, verification criteria, and, for most missions, an answer key it computes itself for your exact seed.

Tauri 2 · React 19 · TypeScript (strict) · Rust · SQLite (bundled) · built on GitHub Actions. No accounts, no subscriptions, and it works offline.

## Install (Windows 11)

1. Open **Actions → Windows build** and click the latest green run. You can also use **Releases** once a version is tagged.
2. Download the `BYTEQUEST-x.y.z-windows-x64` artifact and unzip it. Pick one:
   - `BYTEQUEST_x.y.z_x64-setup.exe`: per-user installer, no admin needed.
   - `BYTEQUEST_x.y.z_x64_en-US.msi`: MSI installer.
   - `BYTEQUEST_x.y.z_x64_portable.exe`: runs without installing. It still keeps its data in your AppData folder.
3. Windows SmartScreen will warn because the app isn't code-signed. Click **More info → Run anyway**.
4. The app needs WebView2. Windows 11 already has it; the installers fetch it if it's missing.

Your data lives in `%APPDATA%\dev.tommy.bytequest\bytequest.sqlite3`. Mission folders are created under `Documents\BYTEQUEST Lab`, which you can change in Settings.

## What's in Phase 1

| Area | Status |
|---|---|
| Windows app (NSIS installer, MSI, portable exe) built by GitHub Actions | ✅ |
| Retro UI with 6 dark themes (Phosphor Lab, Midnight 2003, CRT Amber, Gothic Terminal, Windows 2000 Classic Dark, Monochrome Lab), 3 densities, text scaling | ✅ |
| Subject map: 14 regions, 89 concepts, prerequisite and "unlocks" links, cycle-checked | ✅ |
| Mission library: 24 validated templates, 75 tier variants, 15 seeded generators with computed answer keys | ✅ |
| Difficulty (Rookie → Nightmare) changes requirements, steps and time; hint level is a separate setting | ✅ |
| Mission board: filters (subject, style, time, language, Linux, hardware, simulators, offline), explainable ranking, unlimited rerolls, "reroll parameters", typed-in seeds | ✅ |
| Project Lab: split pane with brief, steps (commands with explanations and effects), diagram, hints, verification, answer key, resources and reflection; autosaving notes; evidence log | ✅ |
| Safe project actions: creates mission folders with generated files, opens them in VS Code, Windows Terminal, Neovim, Vim or Explorer, and never overwrites without asking | ✅ |
| Skill profile per concept, keeping self-reported familiarity, exposure, demonstrated work and recall apart | ✅ |
| Completion requires every verification criterion; the debrief writes a journal entry and schedules recall | ✅ |
| Recall queue: spaced review that you grade yourself; postponing is free and there are no streaks | ✅ |
| Journal: search, edit, Markdown export | ✅ |
| Curated free-resource catalog (38 entries) with filters and an in-app link checker | ✅ |
| JSON backup and restore (all-or-nothing, with an automatic safety copy before each restore; credentials excluded) | ✅ |
| Command palette (Ctrl+K), Ctrl+1–8 navigation, Alt+← back, R to reroll | ✅ |

### Mission library

| Subject | Missions |
|---|---|
| Networking | Subnet Surveyor · DNS From Scratch · Packet Autopsy · Socket Chat Server |
| Computer architecture / math | Bit Bender · Gate Lab · Tiny CPU Emulator (BQ-8 ISA, reference emulator) · Cache Detective |
| Electronics / embedded | LED Bench · RC Timer · Morse Beacon (Arduino or Wokwi) · Pi Vitals Dashboard |
| Operating systems | Memory Map · Write a Shell · Proc Explorer |
| Programming / algorithms / game dev | Pathfinder · Dungeon Generator · Tiny Interpreter · Assembly Spelunker · Jump Physics Tuner (Godot 4) |
| Data / DevOps / AI | Retro Shop Ledger (SQL) · Log-Structured Vault · Container Forge · Perceptron Lab |

## Safety rules the code enforces

- BYTEQUEST **never runs mission commands**. Each command is shown with a plain-language explanation and its effect (read-only, creates files, network, changes the system, needs admin). Commands that change the system need a confirmation before they are copied.
- Files are only written inside your lab folder, using sanitized names. The same rules are implemented in TypeScript and in the Rust `labfs` crate, and both are tested. Existing files are never overwritten unless you confirm.
- External tools start without a shell, using fixed arguments, with the project folder as the working directory.
- The only network use is opening a link you click and the link checker, which can only contact the catalog's own hosts.

## Development

The workflow assumes you don't install anything locally; GitHub Actions builds everything. If you do want to work locally, you need Node 22.18+ and Rust stable with MSVC.

```
npm ci
npm test            # node --test: missions, generators, persistence, backup, filters, offline, safety, migrations
npm run validate    # mission library + subject graph validation
cargo test --manifest-path src-tauri/labfs/Cargo.toml
npm run tauri dev
```

Layout: `src/core` (pure TypeScript: catalog, generators, engine, recall; no network and no platform code) · `src/db` (schema, migrations, repository) · `src/backup` · `src/views` and `src/ui` (React) · `src-tauri` (Rust: SQLite bridge, lab actions, link checker) · `src-tauri/labfs` (dependency-free path-safety crate).

Adding a mission means appending a `MissionTemplate` to a file in `src/core/missions/lib/`. `npm run validate` rejects any template that is missing tiers, steps, hints, verification, recall, safety notes or resources, that points at an unknown concept, or that leaves a placeholder unfilled for any seed.

## Known limitations (Phase 1)

- The Windows build is checked by CI (compiles, packages, tests pass), but it has not been installed and click-tested on a physical PC as part of that process.
- **Cybersecurity has no hands-on missions yet.** Its subject region, concepts and curated authorized practice platforms (PortSwigger Academy, OverTheWire, picoCTF, OWASP Juice Shop) are in place; custom security missions are deferred.
- Apprentice and Nightmare variants are sparse. When a mission lacks the requested tier, the board shows the nearest one and says so.
- The knowledge map is a region grid plus concept links, not yet a zoomable graph. Diagrams are static (some draw the rolled numbers); interactive simulations come later.
- Resource "access" notes are curated, not verified live. The link checker only confirms that a page answers. In the first CI link check (2026-10-16), 35 of 38 links answered; OSDev Wiki and Raspberry Pi Docs returned 403 to the datacenter bot (bot protection), and Linux Journey had moved to LabEx (catalog updated). There's no live video discovery yet.
- No AI-assisted mission generation yet. The core generator is entirely offline.

## Next priorities

1. Zoomable knowledge graph (pan, zoom, search, follow edges).
2. More Apprentice and Nightmare tiers, plus more templates per generator.
3. Interactive simulations: BQ-8 CPU stepper, subnet bit slider, cache visualizer.
4. Practical diagnostics that let you skip introductory tiers per concept.
5. Optional AI-assisted briefs that pass validation before they're trusted.
