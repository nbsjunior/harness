/**
 * CLI logging — in IPC mode stdout is reserved for JSON frames; use stderr only.
 */
export function harnessLog(message: string): void {
  if (process.env['HARNESS_IPC'] === '1') {
    process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
  } else {
    console.log(message);
  }
}

export function harnessWarn(message: string): void {
  process.stderr.write(message.endsWith('\n') ? message : `${message}\n`);
}
