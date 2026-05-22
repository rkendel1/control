"""
Bobby — TAIS Sentinel runner.

Conservador na v1: apenas LÊ incidents, marca os fora-da-whitelist
como acknowledged, e alerta Telegram. Auto-fix de `generic_fallback`
é o ÚNICO tipo whitelistado, mas implementação completa do patch
(Anthropic tool_use loop + supabase deploy) fica como TODO até
Fred liberar a primeira execução de auto-fix em produção.

Modos:
- Default: detect+act (chamado a cada 15 min)
- IS_DIGEST=true: monta resumo das últimas 24h e manda Telegram

Saída: prints no stdout (visíveis nos logs do GitHub Action).
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from supabase import Client, create_client

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
TG_BOT = os.environ.get("TELEGRAM_BOT_TOKEN")
TG_CHAT = os.environ.get("TELEGRAM_CHAT_MONITOR")
IS_DIGEST = os.environ.get("IS_DIGEST", "false").lower() == "true"

# Whitelist conservadora — só esses tipos podem ser auto-fixados na v1.
# Pra expandir, adicione o `kind` aqui E implemente o handler em apply_auto_fix().
AUTO_FIX_WHITELIST_KINDS = {"generic_fallback"}

# Bobby v1 ainda NÃO aplica patches automaticamente sem revisão humana.
# Quando Fred liberar, mude pra True e implemente apply_auto_fix().
AUTO_FIX_ENABLED = False


def send_telegram(text: str) -> None:
    if not TG_BOT or not TG_CHAT:
        print(f"[telegram-skipped] {text[:120]}")
        return
    requests.post(
        f"https://api.telegram.org/bot{TG_BOT}/sendMessage",
        json={"chat_id": TG_CHAT, "text": text, "parse_mode": "Markdown"},
        timeout=10,
    )


def fetch_open_incidents(sb: Client) -> list[dict[str, Any]]:
    res = (
        sb.table("tais_incidents")
        .select("*")
        .eq("status", "open")
        .order("severity", desc=True)
        .order("last_seen_at", desc=True)
        .limit(20)
        .execute()
    )
    return res.data or []


def acknowledge(sb: Client, incident_id: str, note: str) -> None:
    sb.table("tais_incidents").update(
        {"status": "acknowledged", "notes": note}
    ).eq("id", incident_id).execute()


def apply_auto_fix(sb: Client, inc: dict[str, Any]) -> dict[str, Any]:
    """Stub. Quando AUTO_FIX_ENABLED=True, implementa loop tool_use Anthropic:
    1. Lê audit_log da conversa pra identificar user_text que disparou
    2. Anthropic Claude (claude-sonnet-4-6) com tools: read_file, str_replace,
       deno_check, supabase_deploy
    3. Aplica patch em ~/tais-edge/supabase/functions/_shared/handlers.ts
    4. Valida, deploya, commita
    5. Retorna dict com commit, version, deploy_status
    """
    raise NotImplementedError("auto-fix ainda não habilitado na v1")


def handle_detect_act(sb: Client) -> None:
    incidents = fetch_open_incidents(sb)
    print(f"[detect_act] {len(incidents)} incidents open")
    if not incidents:
        return

    by_kind: dict[str, list[dict[str, Any]]] = {}
    for inc in incidents:
        by_kind.setdefault(inc["kind"], []).append(inc)

    for kind, items in by_kind.items():
        print(f"  - {kind}: {len(items)}")

    for inc in incidents:
        kind = inc["kind"]
        if kind in AUTO_FIX_WHITELIST_KINDS and AUTO_FIX_ENABLED:
            try:
                result = apply_auto_fix(sb, inc)
                sb.table("tais_incidents").update(
                    {
                        "status": "auto_fixed",
                        "auto_fix_attempted": True,
                        "auto_fix_result": result,
                        "resolved_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("id", inc["id"]).execute()
                send_telegram(
                    f"✅ *Bobby auto-fix* — `{kind}`\n"
                    f"Commit: `{result.get('commit', '?')}`\n"
                    f"Version: `{result.get('version', '?')}`"
                )
            except Exception as exc:  # pragma: no cover
                acknowledge(sb, inc["id"], f"auto_fix_failed: {exc}")
                send_telegram(
                    f"⚠️ *Bobby auto-fix FALHOU* — `{kind}`\n"
                    f"Incident: `{inc['id']}`\n"
                    f"Erro: `{exc}`"
                )
        else:
            note_prefix = (
                "whitelisted_but_auto_fix_disabled" if kind in AUTO_FIX_WHITELIST_KINDS
                else "not_whitelisted"
            )
            ev = json.dumps(inc.get("evidence", {}))[:200]
            note = f"{note_prefix}: needs_human_review | evidence={ev}"
            acknowledge(sb, inc["id"], note)
            emoji = "🚨" if inc["severity"] == "error" else "⚠️"
            send_telegram(
                f"{emoji} *Bobby alert* — `{kind}` ({inc['severity']})\n"
                f"Incident: `{inc['id']}`\n"
                f"Conv: `{inc.get('conversation_id', 'n/a')}`\n"
                f"Status: needs_human_review\n"
                f"Evidence: `{ev}`"
            )


def handle_digest(sb: Client) -> None:
    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    res = (
        sb.table("tais_incidents")
        .select("kind, status, severity")
        .gte("first_seen_at", since)
        .execute()
    )
    rows = res.data or []
    if not rows:
        send_telegram("📊 *Bobby digest 24h*\nNenhum incident detectado. 🎉")
        return

    by_kind_status: dict[tuple[str, str], int] = {}
    for r in rows:
        key = (r["kind"], r["status"])
        by_kind_status[key] = by_kind_status.get(key, 0) + 1

    lines = ["📊 *Bobby digest 24h*", f"Total: {len(rows)} incidents", ""]
    for (kind, status), count in sorted(by_kind_status.items()):
        lines.append(f"• `{kind}` — {status}: {count}")
    send_telegram("\n".join(lines))


def main() -> int:
    sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    if IS_DIGEST:
        handle_digest(sb)
    else:
        handle_detect_act(sb)
    return 0


if __name__ == "__main__":
    sys.exit(main())
