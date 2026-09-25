// wrangler bundles **/*.md as text (see the [[rules]] block in wrangler.toml), so the Architect's prompt can travel
// with the worker instead of being read off a disk it does not have.
declare module "*.md" { const content: string; export default content; }
