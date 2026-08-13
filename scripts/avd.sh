#!/usr/bin/env bash
# The android class's program: one phone, on the screen the desktop already
# started. Run as `sandbox-desktop avd`, so the X server, the window manager and
# the VNC pair are that script's business and this one only draws into them.
#
# WHY THIS IS NOT A SECOND STREAMING PATH, which is the thing it would be easiest
# to accidentally build. The emulator opens an ordinary X window on ${DISPLAY}.
# The screen the fleet already serves is that display, scraped by TigerVNC and
# carried out through the Kubernetes exec subresource
# (hanzoai/cloud apps/sandbox/screen.go). A phone is therefore a WINDOW, and
# looking at one costs no new port, no new socket and no new client — which is
# why the android class is `desktop` plus an SDK rather than a display of its own.
#
# THE EMULATOR IS QEMU AND IT WANTS /dev/kvm. Without it the emulator falls back
# to software CPU emulation, where a cold boot of Android 15 does not finish in
# any time a person will wait — measured, not feared. That failure is silent in
# the worst way: qemu starts, the window appears, the boot animation runs, and
# nothing ever becomes usable. So the device is checked FIRST and its absence is
# an exit rather than twenty minutes of apparent progress.
set -euo pipefail

AVD="${SANDBOX_AVD:-hanzo}"
SDK="${ANDROID_HOME:-/opt/android}"
export ANDROID_HOME="${SDK}" ANDROID_SDK_ROOT="${SDK}"
export PATH="${SDK}/platform-tools:${SDK}/emulator:${SDK}/cmdline-tools/latest/bin:${PATH}"

log() { printf '[avd] %s\n' "$*" >&2; }

if [ ! -e /dev/kvm ]; then
  log "no /dev/kvm: this pod was scheduled somewhere the android class cannot run"
  exit 1
fi
# PRESENT AND OPENABLE ARE DIFFERENT FACTS, and the gap between them is a whole
# evening. A hostPath mount puts the node's /dev/kvm in the container and the
# container's device cgroup still refuses every open with EPERM — the file is
# right there, `ls` shows it, and only a program that opens it finds out. Ask the
# question the emulator will ask.
if ! (exec 3<>/dev/kvm) 2>/dev/null; then
  log "/dev/kvm is present and refuses to open for uid $(id -u) groups $(id -G)"
  ls -l /dev/kvm >&2 || true
  exit 1
fi

log "booting ${AVD}"
# -gpu swiftshader_indirect renders with Mesa into a real X window. `-no-window`
# is the flag that looks right here and is exactly wrong: it runs the emulator
# headless, which is a phone nobody can see.
emulator -avd "${AVD}" \
  -no-snapshot -no-audio -no-boot-anim \
  -gpu swiftshader_indirect \
  -memory "${SANDBOX_AVD_MEM:-4096}" \
  -cores "${SANDBOX_AVD_CORES:-2}" \
  -accel on &
qemu=$!

# One line in the log that means ANDROID IS UP, as opposed to qemu is up. They
# are ninety seconds apart and nothing else distinguishes them.
(
  adb wait-for-device >/dev/null 2>&1 || exit 0
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    sleep 2
  done
  log "boot_completed"
) &

wait "${qemu}"
