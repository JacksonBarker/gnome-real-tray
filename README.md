# Real Tray

Real Tray is an original GNOME Shell 50 extension that hosts
AppIndicator/KStatusNotifierItem applications in a proper drop-down tray.

It supports three modes:

- **Off**: every non-hidden indicator is placed on the panel.
- **Overflow**: pinned indicators and up to a configurable limit are placed on
  the panel; the rest are placed in the tray.
- **Drop-down only**: all indicators are placed in the tray.

The extension deliberately does not support legacy XEmbed tray icons. Disable
"AppIndicator and KStatusNotifierItem Support" before enabling Real Tray: only
one process can own `org.kde.StatusNotifierWatcher`.

## Development

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run package
```

Install the built extension for the current user with `npm run install:user`,
then log out and back in on Wayland before enabling `real-tray@local`.

The TypeScript source is compiled to readable ES2023 JavaScript modules. The
project is not bundled. Protocol specifications and the existing Ubuntu
AppIndicator extension were used as behavioral references; this is an
independently structured implementation.

## Identity rules

New rules use the normalized StatusNotifier `DesktopEntry` when one exists and
fall back to `Id` otherwise. Rules can still be edited to match either or both.
When both are populated, both must match. A two-field rule takes precedence over
a one-field rule. Equal-specificity matches are treated as conflicts and no rule
is applied.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
