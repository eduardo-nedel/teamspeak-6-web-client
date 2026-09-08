# Impedimentos em Aberto — Atualização Contínua do Sprint

## ~~IMP-0001: FFI TS6 Nativa via tslib (Bloqueio Estrutural de Libertação de Carga)~~ [RESOLVIDO]
- **Data de Resolução:** 2026-09-08
- **Solução Aplicada:** Servidor TeamSpeak 6 real em container Docker integrado com WebQuery HTTP (`:10080`) e voz UDP (`:9987`). Conexão de voz ponta a ponta validada com `Ts3Client`, envio de Opus estéreo 48kHz e teste de Jitter entre dois clientes simultâneos executado com sucesso (485/485 frames entregues, jitter médio ~10.88ms, 0 frames fora de ordem).

## IMP-0002: Co-decodificação Opus sob Assembly (AudioWorklet VAD)
- **Data:** 2026-09-08
- **Hash:** `b1cc...f2`
- **Descrição:** Source binário nativo (libasound/Opus) ha divergencia na versão da libraria WebAsm vs nativa compilada.
- **Status:** Jitter/PLC injetado como Stub no `voice-worker`.

## IMP-0003: Coturn TRUP (Épico 5)
- **Data:** 2026-09-08
- **Hash:** `c2dd...f3`
- **Status:** [~] A IBM Cloud fornece container, mas sem certificado interno, o STUN fallback permanece [~] nao testado.
