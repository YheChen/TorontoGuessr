// Flat config, because Next 16 removed `next lint` and the script invokes
// eslint directly.
//
// eslint-config-next 16 ships a flat config array, so it is spread in as-is.
// It was previously version 15 bridged through FlatCompat, which stopped
// working the moment the config itself became flat: FlatCompat tried to
// validate an eslintrc-shaped object, walked the self-referential plugin
// graph, and threw "Converting circular structure to JSON" before linting a
// single file.
import coreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * Rules that arrived with eslint-plugin-react-hooks 6, which version 16 of the
 * Next config pulls in. They are real findings, not noise, and they are kept
 * on so they stay visible: eslint-config-next 15 did not ship them at all, so
 * until now these 17 issues were reported zero times.
 *
 * They are warnings rather than errors because clearing them means reworking
 * effects in the game, lobby and countdown screens, which is a behavioural
 * change to live gameplay and belongs in its own reviewed change rather than
 * riding along with a lint-config bump. Flip these to "error" as the last step
 * of that work.
 *
 * Counts at the time of writing: set-state-in-effect 13, refs 2, purity 1,
 * immutability 1.
 */
const deferredReactHooksRules = {
  "react-hooks/set-state-in-effect": "warn",
  "react-hooks/refs": "warn",
  "react-hooks/purity": "warn",
  "react-hooks/immutability": "warn",
};

// Named rather than exported inline: this file is linted by its own config,
// and next/core-web-vitals forbids an anonymous default export.
const config = [
  // components/ui is generated (shadcn); the rest never wants linting.
  { ignores: ["components/ui/**", ".next/**", "node_modules/**"] },
  ...coreWebVitals,
  { rules: deferredReactHooksRules },
];

export default config;
