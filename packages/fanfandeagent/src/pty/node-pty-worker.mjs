import readline from "node:readline";
import { spawn } from "node-pty";

let term = null;

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(message) {
  send({
    type: "error",
    message,
  });
}

function disposeAndExit(code = 0) {
  if (term) {
    try {
      term.kill();
    } catch {
      // The PTY may already be gone.
    }
    term = null;
  }

  process.exit(code);
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

input.on("line", (line) => {
  let message;

  try {
    message = JSON.parse(line);
  } catch {
    fail("Worker command must be valid JSON text");
    return;
  }

  if (message.type === "start") {
    if (term) {
      fail("PTY worker is already started");
      return;
    }

    try {
      term = spawn(message.shell, [], {
        name: "xterm-256color",
        cwd: message.cwd,
        cols: message.cols,
        rows: message.rows,
        env: message.env,
        useConpty: process.platform === "win32" ? true : undefined,
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      disposeAndExit(1);
      return;
    }

    term.onData((data) => {
      send({
        type: "data",
        data,
      });
    });

    term.onExit((event) => {
      send({
        type: "exit",
        exitCode: event.exitCode ?? null,
        signal: event.signal,
      });
      process.exit(0);
    });

    send({
      type: "ready",
      pid: term.pid,
    });
    return;
  }

  if (!term) {
    fail("PTY worker has not started yet");
    return;
  }

  if (message.type === "write") {
    try {
      term.write(message.data);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (message.type === "resize") {
    try {
      term.resize(message.cols, message.rows);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (message.type === "kill") {
    disposeAndExit(0);
    return;
  }

  fail(`Unknown worker command: ${String(message.type)}`);
});

input.on("close", () => {
  disposeAndExit(0);
});

process.on("SIGTERM", () => {
  disposeAndExit(0);
});

process.on("SIGINT", () => {
  disposeAndExit(0);
});
