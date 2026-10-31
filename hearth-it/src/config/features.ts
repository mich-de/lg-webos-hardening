// Build-time switches. The weather widget can be left out of a build (HEARTH_WEATHER=0 npm run build): its code is
// then removed from the bundle, not just hidden.

declare const __WEATHER__: boolean | undefined;

export const WEATHER_ENABLED: boolean = typeof __WEATHER__ === 'undefined' ? true : __WEATHER__;

/** The "Tests" tab (what a TV allows a web app to do) is in every build; Settings shows it with the Debug tab (Options → Show the Debug tab). */
export const PROBE_ENABLED = true;

declare const __LEGACY__: boolean | undefined;

/** True only in the bundle for Chromium 38 (webOS 3.x; scripts/legacy.mjs): custom properties are emulated (lib/cssvars.ts). */
export const LEGACY: boolean = typeof __LEGACY__ === 'undefined' ? false : __LEGACY__;


/** Focus parallax of the layered tile icons (hearth-it/ICONS.md); false = layers stay still if the TV lags. */
export const ART_PARALLAX = true;