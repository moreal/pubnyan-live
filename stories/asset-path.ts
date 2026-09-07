/**
 * Static assets (lottie/rive/svg/video) are served from Storybook's staticDirs,
 * which are mounted at the output root — not under the Vite `base` path.
 * When Storybook is deployed under a subpath (e.g. GitHub Pages project pages),
 * a hardcoded leading-slash path like `/lottie/x.json` resolves to the domain
 * root instead of the deployed subpath, causing 404s. Prefixing with
 * `import.meta.env.BASE_URL` keeps asset URLs correct in both dev (base `/`)
 * and deployed (base `/repo-name/`) contexts.
 */
export function assetPath(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
