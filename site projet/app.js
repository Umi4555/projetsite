const statusText = document.getElementById("status-text");

function setStatus(message, type = "idle") {
  statusText.textContent = message;
  statusText.style.color =
    type === "error" ? "var(--error)" : type === "success" ? "var(--success)" : "var(--muted)";
}

// Tabs
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    const tab = btn.dataset.tab;
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) panel.classList.add("active");
  });
});

// Generic API call
async function runCommand(command, opts = {}) {
  const { method = "POST", endpoint = "/api/exec", stdin } = opts;
  setStatus("Exécution en cours…");
  try {
    const payload = { command };
    if (stdin !== undefined) payload.stdin = stdin;

    const res = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    const isOk = res.ok;
    setStatus(isOk ? "Commande exécutée" : "Erreur lors de l’exécution", isOk ? "success" : "error");
    return { ok: isOk, body: text };
  } catch (err) {
    setStatus("Erreur réseau / API", "error");
    return { ok: false, body: String(err) };
  }
}

// Append line to console
const consoleOutput = document.getElementById("console-output");

function appendConsoleLine(text, className = "") {
  const line = document.createElement("div");
  line.className = `console-line ${className}`.trim();
  line.textContent = text;
  consoleOutput.appendChild(line);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// Utilisateurs – création / modification
const formCreateUser = document.getElementById("form-create-user");
const previewCreateUser = document.getElementById("preview-create-user");

formCreateUser.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(formCreateUser);
  const username = (data.get("username") || "").trim();
  if (!username) return;

  const parts = ["useradd"];

  const uid = (data.get("uid") || "").trim();
  if (uid) parts.push(`-u ${uid}`);

  const primaryGroup = (data.get("primaryGroup") || "").trim();
  if (primaryGroup) parts.push(`-g ${shellEscape(primaryGroup)}`);

  const home = (data.get("home") || "").trim();
  if (home) parts.push(`-d ${shellEscape(home)}`);

  const shell = (data.get("shell") || "").trim();
  if (shell) parts.push(`-s ${shellEscape(shell)}`);

  parts.push(shellEscape(username));
  let command = parts.join(" ");
  const password = (data.get("password") || "").trim();

  let fullPreview = command;
  if (password) {
    fullPreview += `\necho ${shellEscape(`${username}:${password}`)} | chpasswd`;
  }

  previewCreateUser.textContent = fullPreview;

  // Execution
  let result = await runCommand(command);
  appendConsoleLine(`# ${command}`, "command");
  appendConsoleLine(result.body, result.ok ? "success" : "error");

  if (password) {
    const passwdCommand = `echo ${shellEscape(`${username}:${password}`)} | chpasswd`;
    appendConsoleLine(`# ${passwdCommand}`, "command");
    result = await runCommand(passwdCommand);
    appendConsoleLine(result.body, result.ok ? "success" : "error");
  }
});

// Utilisateurs – mot de passe
const formPasswd = document.getElementById("form-passwd");
const previewPasswd = document.getElementById("preview-passwd");

formPasswd.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(formPasswd);
  const username = (data.get("username") || "").trim();
  const password = (data.get("password") || "").trim();
  if (!username || !password) return;

  const command = `echo ${shellEscape(`${username}:${password}`)} | chpasswd`;
  previewPasswd.textContent = command;

  appendConsoleLine(`# ${command}`, "command");
  const result = await runCommand(command);
  appendConsoleLine(result.body, result.ok ? "success" : "error");
});

// Groupes
const formGroup = document.getElementById("form-group");
const previewGroup = document.getElementById("preview-group");

formGroup.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(formGroup);
  const group = (data.get("group") || "").trim();
  if (!group) return;
  const gid = (data.get("gid") || "").trim();
  const action = data.get("action");
  const userToAdd = (data.get("userToAdd") || "").trim();
  const userToRemove = (data.get("userToRemove") || "").trim();

  const commands = [];

  if (action === "create") {
    const parts = ["groupadd"];
    if (gid) parts.push(`-g ${gid}`);
    parts.push(shellEscape(group));
    commands.push(parts.join(" "));
  } else if (action === "modify") {
    const parts = ["groupmod"];
    if (gid) parts.push(`-g ${gid}`);
    parts.push(shellEscape(group));
    commands.push(parts.join(" "));
  } else if (action === "delete") {
    commands.push(`groupdel ${shellEscape(group)}`);
  }

  if (userToAdd) {
    commands.push(`usermod -a -G ${shellEscape(group)} ${shellEscape(userToAdd)}`);
  }

  if (userToRemove) {
    commands.push(`gpasswd -d ${shellEscape(userToRemove)} ${shellEscape(group)}`);
  }

  const previewText = commands.join("\n");
  previewGroup.textContent = previewText;
  if (!commands.length) return;

  for (const cmd of commands) {
    appendConsoleLine(`# ${cmd}`, "command");
    const result = await runCommand(cmd);
    appendConsoleLine(result.body, result.ok ? "success" : "error");
  }
});

// Fichiers
const formFile = document.getElementById("form-file");
const previewFile = document.getElementById("preview-file");

formFile.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = new FormData(formFile);
  const path = (data.get("path") || "").trim();
  if (!path) return;

  const owner = (data.get("owner") || "").trim();
  const group = (data.get("group") || "").trim();
  const mode = (data.get("mode") || "").trim();
  const recursive = data.get("recursive") === "yes";

  const commands = [];
  const pathEsc = shellEscape(path);

  if (owner) {
    const chownTarget = group ? `${shellEscape(owner)}:${shellEscape(group)}` : shellEscape(owner);
    const flags = recursive ? "-R " : "";
    commands.push(`chown ${flags}${chownTarget} ${pathEsc}`);
  } else if (group) {
    const flags = recursive ? "-R " : "";
    commands.push(`chgrp ${flags}${shellEscape(group)} ${pathEsc}`);
  }

  if (mode) {
    const flags = recursive ? "-R " : "";
    commands.push(`chmod ${flags}${mode} ${pathEsc}`);
  }

  previewFile.textContent = commands.join("\n");
  if (!commands.length) return;

  for (const cmd of commands) {
    appendConsoleLine(`# ${cmd}`, "command");
    const result = await runCommand(cmd);
    appendConsoleLine(result.body, result.ok ? "success" : "error");
  }
});

// Console
const formConsole = document.getElementById("form-console");
const consoleInput = document.getElementById("console-input");

formConsole.addEventListener("submit", async (e) => {
  e.preventDefault();
  const cmd = consoleInput.value.trim();
  if (!cmd) return;
  consoleInput.value = "";
  appendConsoleLine(`$ ${cmd}`, "command");
  const res = await runCommand(cmd);
  appendConsoleLine(res.body, res.ok ? "success" : "error");
});

// Simple shell escaping (very conservative)
function shellEscape(str) {
  const s = String(str);
  return `'${s.replace(/'/g, `'\\\\''`)}'`;
}

// ----------------------
// Background typing effect
// ----------------------
(function initBgTyping() {
  const container = document.getElementById("bg-typing");
  if (!container) return;

  // short pseudo-code / system logs for style
  const baseLines = [
    "init: loading system modules...",
    "net.iface[eth0]: link up, 192.168.1.12",
    "auth: checking /etc/passwd",
    "spawn: useradd --create-home --shell=/bin/bash alice",
    "fsck: remounting read-write",
    "watcher: listening on /var/log/auth.log",
    "cron: schedule applied — backup@02:00",
    "iptables: default-policy ACCEPT",
    "sshd: key exchange complete",
    "kernel: kmalloc(4096) -> 0xffff88007f1a0000",
    "docker: started container abc123",
    "db: replica sync: 42%",
    "audit: selinux status permissive",
    "systemd: reached target multi-user.target",
    "rsync: transferring incremental file list",
    "logger: usb device connected: /dev/sdb1",
    "apt: Updating package lists...",
    "journal: rotated logs (3 files)",
    "lvs: thin pool low watermark reached",
    "ufw: Allow IN tcp 22",
  ];

  // Build a long list by repeating baseLines with small random noise
  const totalLines = 60;
  const lines = [];
  for (let i = 0; i < totalLines; i++) {
    const src = baseLines[i % baseLines.length];
    // add small random suffix to avoid perfect repetition
    const noise = Math.random() < 0.25 ? ` #${Math.random().toString(36).slice(2, 8)}` : "";
    lines.push(src + noise);
  }

  // Create an inner wrapper that will scroll vertically via CSS animation
  const scroller = document.createElement("div");
  scroller.className = "bg-scroller";
  container.appendChild(scroller);

  // Populate scroller with two repeats so the scroll loops without gaps
  function populateRepeat() {
    const rep = document.createElement("div");
    rep.className = "bg-block";
    for (const text of lines) {
      const el = document.createElement("div");
      el.className = "bg-line";
      el.textContent = text;
      rep.appendChild(el);
    }
    return rep;
  }

  scroller.appendChild(populateRepeat());
  scroller.appendChild(populateRepeat());

  // subtle flicker: occasionally add a tiny "typed" character effect to random lines
  function flicker() {
    const all = scroller.querySelectorAll(".bg-line");
    if (!all.length) return;
    const idx = Math.floor(Math.random() * all.length);
    const el = all[idx];
    const original = el.textContent;
    const suffix = Math.random() < 0.35 ? "." : Math.random() < 0.5 ? ";" : "";
    el.textContent = original + suffix;
    el.style.textShadow = "0 0 8px rgba(0,255,110,0.18)";
    setTimeout(() => {
      el.textContent = original;
      el.style.textShadow = "";
    }, 220 + Math.random() * 420);
  }

  setInterval(flicker, 300 + Math.random() * 700);
})();