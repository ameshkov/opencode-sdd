#!/usr/bin/env python3
"""Scriptable PTY driver for the QA workspace: the CLI install wizard
(group C), without a human at the terminal.

Runs INSIDE the workspace container (python3 stdlib only — pty, select,
termios). It spawns a command on a wide pseudo-terminal, captures the
screen, feeds staged input, and can auto-answer prompt lines. The
wizard is the only TTY-only part of the manual QA suite (an inquirer
program; `install --yes` covers the non-interactive cases) — opencode
sessions themselves are driven through the web UI by
qa/docker/serve-web.sh.

Usage:

    python3 pty-driver.py [options] -- <command...>

Options:

    --cols N               pty columns (default 200, a wide TUI)
    --rows N               pty rows (default 50)
    --log FILE             capture the full output (written continuously)
    --snapshot FILE        current screen, rewritten after every read;
                           polls from outside with `docker exec ... cat`
    --snapshot-lines N     keep only the last N lines in the snapshot
                           (default: whole screen buffer)
    --send TEXT            one staged input item (repeatable)
    --send-file FILE       load staged input items from a file, one line
                           each (repeatable, appended after --send items)
    --auto-reply RX=REPLY  watch the screen; when a line matches RX and
                           the pty has been quiet for --quiet-window,
                           send REPLY + Enter (repeatable)
    --auto-y               preset: reply "y" to y/n permission prompts
    --quiet-window SEC     quiet time before auto-replies fire (0.8)
    --wait-timeout SEC     default deadline for `wait:` items (60)
    --timeout SEC          hard deadline; on expiry the child is killed
                           and the driver exits 124

Staged input item syntax (one per --send / line of --send-file):

    send:<text>      type <text> and press Enter
    raw:<text>       type <text> without Enter
    key:<name>       special key: enter tab ctrl-c ctrl-d escape alt-enter
                     up down left right backspace f5 f6
    sleep:<seconds>  pause (still reading the pty)
    wait:<regex>     pause until <regex> appears in the screen

Exit status: the child's exit code; 124 on --timeout; 2 on usage error.

Example (drive the wizard, keep the capture scriptable — in sandbox
VMs `docker exec` stdout is dropped once the process idles, so run the
driver with `docker exec -d` and read the snapshot/log files):

    python3 pty-driver.py --cols 200 --log /tmp/wizard.log \
      --snapshot /tmp/wizard.screen --send 'send:node install' \
      --timeout 300 -- bash
"""

import argparse
import fcntl
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time

KEYMAP = {
    "enter": b"\r",
    "tab": b"\t",
    "ctrl-c": b"\x03",
    "ctrl-d": b"\x04",
    "escape": b"\x1b",
    "alt-enter": b"\x1b\r",
    "up": b"\x1b[A",
    "down": b"\x1b[B",
    "left": b"\x1b[D",
    "right": b"\x1b[C",
    "backspace": b"\x7f",
    "f5": b"\x1b[15~",
    "f6": b"\x1b[17~",
}

# How much screen history to keep (chars) for wait/auto-reply matching.
SCREEN_HISTORY = 200_000


def build_parser():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--cols", type=int, default=200)
    parser.add_argument("--rows", type=int, default=50)
    parser.add_argument("--log")
    parser.add_argument("--snapshot")
    parser.add_argument("--snapshot-lines", type=int, default=0)
    parser.add_argument("--send", action="append", default=[])
    parser.add_argument("--send-file", action="append", default=[])
    parser.add_argument("--auto-reply", action="append", default=[])
    parser.add_argument("--auto-y", action="store_true")
    parser.add_argument("--quiet-window", type=float, default=0.8)
    parser.add_argument("--wait-timeout", type=float, default=60.0)
    parser.add_argument("--timeout", type=float, default=0.0)
    parser.add_argument("command", nargs="+")
    return parser


def parse_items(parser, args):
    """Loads staged input items from --send and --send-file."""
    items = list(args.send)
    for path in args.send_file:
        try:
            with open(path, encoding="utf-8") as fh:
                items.extend(line.strip() for line in fh if line.strip())
        except OSError as err:
            parser.error(f"cannot read --send-file {path}: {err}")
    return items


def parse_replies(parser, args):
    """Parses --auto-reply 'RX=REPLY' pairs; adds the --auto-y preset."""
    replies = []
    for item in args.auto_reply:
        rx, sep, reply = item.partition("=")
        if not sep:
            parser.error(f"--auto-reply needs 'regex=reply', got: {item}")
        try:
            replies.append((re.compile(rx, re.IGNORECASE), reply))
        except re.error as err:
            parser.error(f"bad --auto-reply regex {rx!r}: {err}")
    if args.auto_y:
        replies.append((re.compile(r"\?.*(y/n|yes/no)", re.IGNORECASE), "y"))
    return replies


def set_winsize(fd, rows, cols):
    """Sets the pty winsize so the child sees the wide terminal."""
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
    except OSError:
        pass


def run_key(key):
    name = key.lower()
    if name not in KEYMAP:
        parser_error(f"unknown key: {key}")
    return KEYMAP[name]


def parser_error(message):
    print(f"pty-driver: error: {message}", file=sys.stderr)
    sys.exit(2)


def tail_lines(history, limit):
    if limit <= 0:
        return history
    return "\n".join(history.splitlines()[-limit:])


def main():
    parser = build_parser()
    args = parser.parse_args()
    if args.command[0] == "--":
        command = args.command[1:]
    else:
        command = args.command
    if not command:
        parser.error("no command to run")

    items = parse_items(parser, args)
    replies = parse_replies(parser, args)

    os.environ["TERM"] = os.environ.get("TERM", "xterm-256color")
    os.environ["COLUMNS"] = str(args.cols)
    os.environ["LINES"] = str(args.rows)

    pid, fd = pty.fork()
    if pid == 0:
        # Child: the pty slave is the controlling terminal.
        os.execvp(command[0], command)
        os._exit(127)

    set_winsize(fd, args.rows, args.cols)

    log_handle = open(args.log, "w", encoding="utf-8", errors="replace") if args.log else None
    screen = ""
    last_read = time.monotonic()
    auto_fired = {}  # pattern index -> True while its match is on screen
    timed_out = False
    item_index = 0
    wait_deadline = None
    start = time.monotonic()

    def write_input(data):
        os.write(fd, data)

    def snapshot():
        if args.snapshot:
            try:
                with open(args.snapshot, "w", encoding="utf-8", errors="replace") as fh:
                    fh.write(tail_lines(screen, args.snapshot_lines))
            except OSError:
                pass

    def feed(chunk):
        nonlocal screen
        decoded = chunk.decode("utf-8", errors="replace")
        screen = (screen + decoded)[-SCREEN_HISTORY:]
        sys.stdout.write(decoded)
        sys.stdout.flush()
        if log_handle:
            log_handle.write(decoded)
            log_handle.flush()
        snapshot()

    def drain(seconds):
        """Reads for up to `seconds`, interleaved with other work."""
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            ready, _, _ = select.select([fd], [], [], 0.1)
            if not ready:
                continue
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                return
            if not chunk:
                return
            feed(chunk)

    def child_done():
        try:
            pid_ret, status = os.waitpid(pid, os.WNOHANG)
        except ChildProcessError:
            return True, 0
        if pid_ret == 0:
            # waitpid returns (0, 0) while the child is still running;
            # only a non-zero pid means an actual exit.
            return False, 0
        return True, status

    def exec_item(item):
        nonlocal wait_deadline
        kind, _, value = item.partition(":")
        kind = kind.lower()
        if kind == "send":
            write_input(value.encode("utf-8") + b"\r")
            sys.stdout.flush()
        elif kind == "raw":
            write_input(value.encode("utf-8"))
            sys.stdout.flush()
        elif kind == "key":
            write_input(run_key(value))
            sys.stdout.flush()
        elif kind == "sleep":
            try:
                drain(float(value))
            except ValueError:
                parser_error(f"bad sleep duration: {value}")
        elif kind == "wait":
            try:
                wait_deadline = time.monotonic() + float(args.wait_timeout)
                wait_until(item, lambda: screen)
            except ValueError:
                parser_error(f"bad wait timeout: {value}")
        else:
            parser_error(
                f"unknown staged item: {item} (use send:/raw:/key:/sleep:/wait:)"
            )

    def wait_until(item, get_screen):
        """Blocks (still reading) until the wait: regex shows up."""
        nonlocal screen
        deadline = wait_deadline if wait_deadline is not None else time.monotonic() + float(args.wait_timeout)
        pattern = re.compile(item.partition(":")[2], re.IGNORECASE)
        while time.monotonic() < deadline:
            if pattern.search(get_screen()):
                return
            drain(0.2)
        print(f"pty-driver: warning: wait: timed out for {item!r}")

    def auto_check():
        nonlocal last_read
        now = time.monotonic()
        if now - last_read < args.quiet_window:
            return
        tail = tail_lines(screen, 40)
        for index, (pattern, reply) in enumerate(replies):
            if index in auto_fired and auto_fired[index]:
                if not pattern.search(tail):
                    auto_fired[index] = False
                continue
            if pattern.search(tail):
                auto_fired[index] = True
                write_input(reply.encode("utf-8") + b"\r")
                sys.stdout.flush()
                last_read = time.monotonic()

    # Main loop: read output, run staged items, auto-answer, watch child.
    while True:
        done, status = child_done()
        if done:
            # Drain whatever the child left, then flush and exit.
            drain(0.4)
            snapshot()
            if log_handle:
                log_handle.close()
            if os.WIFEXITED(status):
                return os.WEXITSTATUS(status)
            return 128 + os.WTERMSIG(status)

        if args.timeout and time.monotonic() - start > args.timeout:
            timed_out = True
            try:
                os.kill(pid, signal.SIGINT)
            except ProcessLookupError:
                pass
            drain(2.0)
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            os.waitpid(pid, 0)
            break

        if item_index < len(items):
            item = items[item_index]
            ready, _, _ = select.select([fd], [], [], 0.1)
            if item.lower().startswith(("send:", "raw:", "key:")):
                if ready:
                    feed(os.read(fd, 65536))
                exec_item(item)
                item_index += 1
                continue
            if item.lower().startswith("sleep:"):
                if ready:
                    feed(os.read(fd, 65536))
                exec_item(item)
                item_index += 1
                continue
            if item.lower().startswith("wait:"):
                if ready:
                    feed(os.read(fd, 65536))
                exec_item(item)
                item_index += 1
                continue
            parser_error(f"unknown staged item: {item}")

        ready, _, _ = select.select([fd], [], [], 0.1)
        if ready:
            try:
                feed(os.read(fd, 65536))
            except OSError:
                pass
        auto_check()

    snapshot()
    if log_handle:
        log_handle.close()
    if timed_out:
        print("\npty-driver: timed out (exit 124)", file=sys.stderr)
        return 124
    return 0


if __name__ == "__main__":
    sys.exit(main())
