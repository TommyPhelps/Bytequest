// Browser-preview stand-ins for the Tauri modules. Never part of the desktop build.
// If the page defines window.__bq (the screenshot harness does, backed by
// node:sqlite), commands are forwarded there so the preview shows real data.
type Bridge = (cmd: string, args: unknown) => Promise<unknown>;
const bridge = () => (globalThis as unknown as { __bq?: Bridge }).__bq;
export async function invoke<T>(cmd: string, args?: unknown): Promise<T> {
  const b = bridge();
  if (!b) throw new Error("Not running inside the BYTEQUEST desktop app.");
  return (await b(cmd, args ?? {})) as T;
}
export async function open() { return null; }
export async function save() { return null; }
export async function openUrl(url: string) { window.open(url, "_blank"); }
