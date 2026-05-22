# Bobby — DevOps + TAIS Sentinel

Bobby monitora a TAIS continuamente, classifica incidentes vindos do
`tais_incidents` (Supabase project `rixnvftlzhfkavbfcipn`), e aplica fixes
whitelistados sem intervenção. Casos fora da whitelist, anota diagnóstico
e alerta Fred via Telegram.

## Origem dos incidents

Cron `tais-sentinel-detect` (a cada 15 min) roda 5 detectores em SQL
(`detect_bot_message_repeat`, `detect_menu_loop_escalations`,
`detect_generic_fallbacks`, `detect_stale_conversations`,
`detect_hallucinations`). Cada match vira linha em `tais_incidents` com
`status='open'`. Bobby lê essa tabela.

## Whitelist auto-fix (conservadora — começa só com 1 tipo)

| kind | auto-fix? | ação |
|---|---|---|
| `generic_fallback` | ✅ sim | Identifica o user_text que disparou; adiciona regex ao `TOPIC_KEYWORD_MAP` em `_shared/handlers.ts` com resposta apropriada; `deno check`; deploy; commit. |
| `bot_message_repeat` (prefix conhecido) | ❌ não ainda | Apenas alerta. Pode evoluir pra investigar se `TOPIC_KEYWORD_MAP` cobre o termo. |
| `menu_loop_escalation` | ❌ não | Sintoma, não causa. Alerta. |
| `stale_conversation` | ❌ não | Alerta. |
| `hallucination` | ❌ não | Alerta. Caso crítico — review humano obrigatório. |

> Decisão arquitetural: começa com whitelist mínima (só `generic_fallback`),
> que é o caso mais previsível e de menor blast radius. Expande à medida
> que confiança aumenta.

## Procedimento por incidente

1. `SELECT * FROM tais_incidents WHERE status='open' ORDER BY severity DESC, last_seen_at DESC LIMIT 20`
2. Pra cada um da whitelist:
   - Lê `audit_log` dos últimos 1h da conversa pra identificar o `user_text` que disparou
   - Aplica patch (str_replace em `_shared/handlers.ts` no repo `~/tais-edge` checkado no runner)
   - `deno check` — se falhar, aborta e marca incident como `acknowledged` com nota
   - Deploy via `supabase functions deploy webhook-handler --no-verify-jwt`
   - Commit em `tais-edge` (push só se remote existir — atualmente NÃO existe)
   - `UPDATE tais_incidents SET status='auto_fixed', auto_fix_attempted=true,
     auto_fix_result='{"commit": "...", "version": "..."}'::jsonb, resolved_at=now()`
3. Pra fora da whitelist:
   - `UPDATE tais_incidents SET status='acknowledged', notes='<diagnóstico>'`
   - Telegram alerta Fred (canal `TELEGRAM_CHAT_MONITOR`)

## Digest diário (19h BRT = 22 UTC)

Lista tudo que ele auto-fixou + tudo que ficou pendente nas últimas 24h.
Manda no Telegram como mensagem agrupada.

## Onde rodar

GitHub Action `.github/workflows/bobby-sentinel.yml`:
- Schedule a cada 15 min (alinhado com o cron `tais-sentinel-detect`)
- Schedule extra às 22 UTC pro digest
- Workflow_dispatch pra trigger manual

## Secrets necessárias (GitHub Settings → Secrets)

| Secret | Origem |
|---|---|
| `ANTHROPIC_API_KEY` | Conta Anthropic |
| `SUPABASE_URL` | `https://rixnvftlzhfkavbfcipn.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API |
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens |
| `TELEGRAM_BOT_TOKEN` | Já existe no projeto TAIS |
| `TELEGRAM_CHAT_MONITOR` | Já existe no projeto TAIS |
| `GH_PAT` | Token com `repo:write` em `terserv/tais-edge` (quando o remote for criado) |

## Como pausar Bobby

- Edit `.github/workflows/bobby-sentinel.yml` → comenta o bloco `schedule:` → push
- Ou: GitHub UI → Actions → workflow Bobby TAIS Sentinel → "Disable workflow"

## Como adicionar pattern à whitelist

1. Edita `agents/bobby/sentinel.py` → constante `AUTO_FIX_WHITELIST_KINDS`
2. PR
3. Após merge, próxima execução agendada já considera o novo tipo

## Evolução planejada

- v1 (atual): só `generic_fallback`, edição manual de `TOPIC_KEYWORD_MAP`
- v2: `bot_message_repeat` com prefix em fallback → analisa contexto, sugere regex
- v3: integração com Mika (QA) pra rodar bateria de teste após auto-fix
- v4: rollback automático se função saúde piorar 1h pós-deploy
