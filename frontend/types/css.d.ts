// TypeScript 6 requires a declaration for a side-effect import of a non-code
// module and reports TS2882 without one, which is what `import "./globals.css"`
// in app/layout.tsx hits. Next handles the stylesheet itself; this only tells
// tsc that importing one purely for its side effects is deliberate and brings no
// bindings with it.
//
// next-env.d.ts would be the obvious home, but Next regenerates that file and it
// says not to edit it, so the declaration lives here instead. tsconfig's
// include already covers "**/*.ts", so nothing needs registering.
declare module "*.css";
