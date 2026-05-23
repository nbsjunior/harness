/**
 * CLI logging — in IPC mode stdout is reserved for JSON frames; use stderr only.
 */
/**
 * @module log
 * IPC-safe logging: stderr when `TODDSPECT_IPC=1`, else stdout.
 * **Why:** Daemon stdout is reserved for JSON frames only.
 */

/** Human-readable log line (stderr in IPC mode). */
export function toddspectLog(message: string): void {
  if (process.env['TODDSPECT_IPC'] === '1') {
    process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
  } else {
    console.log(message);
  }
}

export function toddspectWarn(message: string): void {
  process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
}
