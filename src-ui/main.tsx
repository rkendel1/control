const root = document.getElementById("root");

function escapeHtml(value: string): string {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function describeFailure(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}${reason.stack ? `\n${reason.stack}` : ""}`;
  if (typeof reason === "string") return reason;
  try {
    const json = JSON.stringify(reason, Object.getOwnPropertyNames(reason as object), 2);
    if (json && json !== "{}") return json;
  } catch {/* use the safe fallback below */}
  return Object.prototype.toString.call(reason);
}

function isExpectedCancellation(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const value=reason as {type?:unknown;msg?:unknown};
  return value.type === "cancelation" && value.msg === "operation is manually canceled";
}

function showStartupFailure(reason: unknown): void {
  if (!root) return;
  const message = describeFailure(reason);
  root.innerHTML = `
    <main style="min-height:100vh;display:grid;place-items:center;background:#111318;color:#f5f7fa;font:14px system-ui;padding:32px;box-sizing:border-box">
      <section style="max-width:680px">
        <h1 style="font-size:20px">Control could not start</h1>
        <p style="color:#b8c0cc;white-space:pre-wrap">${escapeHtml(message)}</p>
        <button id="control-retry" style="padding:8px 14px">Retry</button>
      </section>
    </main>`;
  document.getElementById("control-retry")?.addEventListener("click", () => window.location.reload());
}

window.addEventListener("error", (event) => showStartupFailure(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => {
  if(isExpectedCancellation(event.reason)){event.preventDefault();return;}
  showStartupFailure(event.reason);
});

if (root) {
  root.innerHTML = '<div style="min-height:100vh;background:#111318;color:#b8c0cc;display:grid;place-items:center;font:14px system-ui">Starting Control…</div>';
}

void import("./bootstrap").catch(showStartupFailure);
