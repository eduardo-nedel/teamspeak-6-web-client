# Impedimentos em Aberto — Atualização Contínua do Sprint

## IMP-0001: FFI TS6 Nativa via tslib (Bloqueio Estrutural de Libertação de Carga)
- **Data:** 2026-09-08
- **Hash:** `a0bc...f1`
- **Descrição:** Conexão binária WS/TCP com a espeleologia da porta 21080 travando sem o SDK completo exposto.
- **Status:** Happy Path rodando em Mock para todos os Controllers TS6 (AudioBridge, Chat, ChannelTree).
- **Resolução Prognostica:** Migrar o `packages/ts6-client` como Worker da máquina real e amarrar no `ts6.adapter.ts` via C++ Nan bindings quando o hardware de QA for provido.

## IMP-0002: Co-decodificação Opus sob Assembly (AudioWorklet VAD)
- **Data:** 2026-09-08
- **Hash:** `b1cc...f2`
- **Descrição:** Source binário nativo (libasound/Opus) ha divergencia na versão da libraria WebAsm vs nativa compilada.
- **Status:** Jitter/PLC injetado como Stub no `voice-worker`.

## IMP-0003: Coturn TRUP (Épico 5)
- **Data:** 2026-09-08
- **Hash:** `c2dd...f3`
- **Status:** [~] A IBM Cloud fornece container, mas sem certificado interno, o STUN fallback permanece [~] nao testado.
