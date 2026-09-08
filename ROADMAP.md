# ROADMAP — TeamSpeak 6 Web Client v3.1

> **Status:** documento de construção — v3.1
> **Escopo:** cliente Web de comunicação para um servidor TeamSpeak 6,
> com voz, texto, canais, webcam e compartilhamento de tela.  
> **Escala-alvo:** comunidade fechada de pequena escala.  
> **Princípio da v3:** reduzir incerteza técnica antes de aumentar escopo.
>
> Esta versão substitui integralmente a versão anterior do roadmap.
> Ela incorpora as decisões e riscos identificados nas revisões técnicas,
> mantendo somente o que é compatível com a premissa de escala.

---

# 1. Objetivo

Construir um cliente Web capaz de usar um servidor TeamSpeak 6 sem exigir
instalação de cliente desktop.

O produto deve permitir:

- autenticar o usuário no Web Client;
- conectar ao servidor TeamSpeak 6;
- navegar pelos canais;
- visualizar presença em tempo real;
- entrar, sair e trocar de canal;
- falar e ouvir voz de baixa latência;
- usar push-to-talk, mute e deaf;
- enviar mensagens em canais;
- enviar mensagens privadas;
- transmitir webcam;
- compartilhar tela;
- compartilhar áudio da tela quando o navegador disponibilizar essa
  capacidade;
- manter estado consistente mesmo durante reconnects, timeouts e falhas
  parciais.

O sistema é dividido em três planos:

```text
                    Web Client
                        |
          +-------------+-------------+
          |             |             |
          v             v             v
     Control Plane  Voice Plane   Media Plane
          |             |             |
         TS6           TS6         WebRTC/P2P
```

A separação existe para impedir que falhas de mídia derrubem controle,
presença e mensagens.

---

# 2. Premissas e limites

## 2.1 Escala de referência

| Recurso | Limite de projeto |
|---|---:|
| Usuários Web simultâneos | 20 |
| Usuários simultaneamente em voz | 20 |
| Publishers de vídeo/tela simultâneos | 5 |
| Gateways | 1 processo |
| Servidores TeamSpeak atendidos | 1 |
| SFU | fora da v3 |
| Persistência distribuída | fora da v3 |

Esses números são **limites de projeto**, não promessas de capacidade
universal.

A arquitetura pode ser evoluída posteriormente, mas a implementação da v3
não deve carregar complexidade destinada a uma escala maior.

## 2.2 Pior caso formal de mídia

O cenário usado em benchmark é:

```text
20 usuários no mesmo canal
20 usuários em voz
5 publishers simultâneos
até 5 espectadores por publisher (aceite)
19 espectadores por publisher (stress, apenas diagnóstico)
```

O custo P2P deve ser calculado por publisher:

```text
upload do publisher
≈ bitrate do stream × número de viewers
```

Portanto, "5 streams" não é suficiente para definir o custo.

`MAX_VIEWERS_PER_STREAM = 5` (D-14). O cenário de 19 espectadores é
apenas diagnóstico para registrar o ponto de degradação, não é critério
de aceite de produção.

## 2.3 Limites obrigatórios

A implementação deve possuir limites explícitos para:

```text
MAX_ACTIVE_PUBLISHERS_PER_CHANNEL = 5
MAX_VIEWERS_PER_STREAM             = 5
MAX_RECEIVED_STREAMS_PER_USER      = 5
MAX_VIDEO_BITRATE_PER_STREAM       = 2 Mbps inicial; tunável por benchmark
MAX_VOICE_SESSIONS_PER_USER        = 1
MAX_MEDIA_SESSIONS_PER_USER        = 5
MAX_WEBSOCKETS_PER_USER            = 6 (5 control + 1 voice)
MAX_SESSIONS_PER_USER               = 5
MAX_ACTIVE_STREAMS_PER_USER         = 1
```

Os valores numéricos das quotas operacionais estão consolidados na D-15.

Nenhum limite deve ser implicitamente inferido de "20 usuários".

---

# 3. Princípios arquiteturais


## Decisões Normativas de Arquitetura (D-01 a D-23)

This section is normative and supersedes any earlier wording in this document that conflicts with it.

### D-01 — VoiceSession ownership

The model is:

`User -> many WebSessions -> at most one VoiceSession -> one ownerSessionId -> one TeamSpeak voice client`

Invariants:

- `ownerSessionId` identifies the only WebSession allowed to control the VoiceSession.
- A second WebSession cannot create a parallel TeamSpeak voice client for the same user.
- Starting voice on another WebSession transfers ownership atomically.
- The previous owner is fenced using `bindingGeneration`.
- Reconnect/restart reconciles ownership before voice commands are accepted.
- Persistent TeamSpeak identity material is reused across reconnects and restarts and is encrypted at rest.

### D-02 — Screen audio

Screen audio is part of the Media Plane and uses a dedicated WebRTC audio track.

- It is independent from the TeamSpeak microphone voice channel.
- Microphone mute/deaf does not implicitly mute screen audio.
- Microphone and screen-audio volume can be controlled independently.
- A/V synchronization belongs to the WebRTC media session.
- Browser capture/mixing behavior is a validation item, not an assumed fact.

### D-03 — Video is Click-to-Watch

Video is announced as available, but viewers are never automatically subscribed.

Flow:

1. publisher starts the stream;
2. eligible users see that the publisher is transmitting;
3. viewer explicitly clicks **Assistir**;
4. gateway authorizes the subscription;
5. P2P WebRTC session is established;
6. `MAX_VIEWERS_PER_STREAM` is enforced.

Click-to-Watch reduces unnecessary subscriptions and upload pressure, but does not guarantee zero publisher upload. Bitrate caps, adaptive bitrate and connection monitoring remain mandatory.

### D-04 — VoiceFrame ordering

Every logical VoiceFrame contains:

- `sessionId`
- voice stream/client identifier
- monotonic `sequence`
- capture/send `timestamp`
- codec/payload metadata

The playout layer supports reordering, duplicate suppression, late-frame detection, stale-frame discard, PLC/concealment and bounded buffering.

`LATE_FRAME_THRESHOLD_MS` is configurable and must be established by benchmark/perceptual testing. A fixed 60 ms value is not normative.

### D-05 — TeamSpeak identity lifecycle

A TeamSpeak identity is persistent application state.

- Generate/import it once using the TS6-compatible procedure validated by the protocol spike.
- Encrypt identity material at rest.
- Reuse it on reconnect/restart.
- Never regenerate it during normal connection recovery.
- Do not make unverified assumptions about identity proof-of-work cost normative.

### D-06 — Per-server TeamSpeak capacity budget

Capacity is not a universal constant.

For each configured TS6 server the gateway tracks:

- `configuredCapacity`
- `reservedForGateway`
- `minimumFreeCapacity`
- current gateway client count
- available capacity

Admission reserves capacity before creating a virtual client and releases it only after confirmed cleanup. The gateway must preserve `minimumFreeCapacity`.

### D-07 — Channel chat authority

Channel chat remains TeamSpeak-authoritative:

- send channel messages through the native TS6 channel-text operation;
- propagate TS6 chat events through the gateway;
- do not create a competing persistent channel-chat source of truth.

Web direct messages are ephemeral by default in v3.1. Any future TS6 mapping requires protocol validation.




### D-08 — Snapshot Stabilization Protocol

Snapshot/event synchronization uses a concrete stabilization protocol.

Flow:

1. Subscribe to the authoritative TS6 event stream.
2. Capture local `eventCursorBefore`.
3. Read authoritative TS6 state.
4. Capture `eventCursorAfter`.
5. Buffer events received during the snapshot window.
6. Install the snapshot as the state base.
7. Replay buffered events in cursor order.
8. Perform a validation read.
9. If the state changed during the final validation window, repeat.
10. After a maximum of 3 cycles, mark state `RECONCILING` and perform a full reconcile.

A deterministic normalized-state checksum may accelerate equality checks. The design does not depend on an unverified TS6 `stateVersion`.

Invariants:

- state marked `RECONCILING` is not presented as ready;
- concurrent mutations are incorporated or trigger another stabilization cycle;
- persistent failure becomes an observable reconcile condition;
- TS6 remains authoritative;
- Gateway owns buffering, normalization and reconciliation.

Acceptance: snapshot + buffered events must converge to the validation read, or explicitly enter reconciliation.

### D-09 — Authoritative Voice Activity Detection

Effective shared `speaking` state is calculated by the Voice Worker from decoded audio.

Flow:

`TS6 voice -> Worker decode -> PCM -> VAD -> speaking -> Gateway -> WebSocket -> UI`

Invariants:

- browser microphone activity is local UI feedback only;
- browser cannot assert another user's authoritative speaking state;
- Gateway rejects client-supplied authoritative `speaking` state;
- VAD uses debounce/hangover;
- stale speaking state expires automatically.

Initial values:

- `VAD_ON_HOLD_MS = 40`
- `VAD_OFF_HOLD_MS = 200`
- `VAD_IDLE_TIMEOUT_MS = 500`

These values are benchmark-tunable.

### D-10 — Voice Codec Negotiation

Codec negotiation is owned by the Voice Protocol Adapter/Worker and follows the actual TS6 handshake/capability exchange validated by F-1.

Invariants:

- domain code never depends on TS6 codec IDs;
- selected TS6 codec is a session property;
- unsupported codecs fail deterministically;
- internal processing is normalized to `48 kHz / 2 channels / PCM16 / 20 ms / 960 samples per channel` unless F-1 proves another boundary is required;
- Opus is not assumed mandatory until validated.

F-1 must establish negotiation messages, codec IDs, sample rate, channels, frame duration, bitrate/mode, codec changes, unsupported-codec behavior and voice encryption/authentication requirements.

Acceptance:

`connect -> negotiate -> identify codec -> decode/encode -> exchange audio -> verify PCM integrity`.

### D-11 — TURN Infrastructure

Initial TURN infrastructure is self-operated `coturn`. The Gateway issues short-lived credentials.

Responsibilities:

- coturn performs STUN/TURN relay only;
- Gateway generates ephemeral credentials and controls TTL;
- browser receives temporary ICE configuration only;
- permanent TURN secrets never reach clients.

ICE preference:

`direct P2P -> STUN discovery -> TURN relay`

Initial operational ceiling:

`MAX_TURN_RELAYS = 10`

This is a protection limit, not a capacity guarantee.

F3 measures TURN ingress/egress Mbps, active allocations, CPU, memory and relay duration.

### D-12 — Graceful Shutdown Budget

`GRACEFUL_SHUTDOWN_TIMEOUT = 15s`

Flow:

`SIGTERM -> stop new sessions/commands -> drain -> stop publishers -> disconnect Workers -> close WebRTC -> close TS6 clients -> flush critical state -> exit`

After 15 seconds:

- cancel remaining commands;
- close sockets and WebRTC peers;
- terminate remaining Workers;
- release local locks/reservations;
- exit without waiting indefinitely for TS6.

Commands left `UNKNOWN` are reconciled on next startup.

### D-13 — TeamSpeak-Authoritative Channel Authorization

Authorization is split between product-level access and TeamSpeak-native permissions.

Rules:

- Web RBAC/capabilities decide whether a user may use a Web feature;
- TS6 permissions decide whether a TeamSpeak-owned operation is allowed;
- Gateway evaluates both before protected operations;
- Web-only capabilities such as `web.media.publish` and `web.media.watch` supplement, but do not replace, TS6 permissions.

Exact permission IDs/mappings are validated during F-1.

### D-14 — Bounded P2P Fanout

P2P fanout is explicitly bounded:

`MAX_ACTIVE_PUBLISHERS_PER_CHANNEL = 5`

`MAX_VIEWERS_PER_STREAM = 5`

Invariants:

- Click-to-Watch is mandatory;
- viewer admission is authorized and reserved atomically;
- disconnect/channel change/permission loss/stream stop releases or revokes the reservation;
- no infinite viewer queue;
- capacity denial returns `MEDIA_CAPACITY_EXCEEDED`;
- rejecting a viewer cannot destabilize the publisher.

Benchmarks:

- Acceptance: 5 publishers × 5 viewers/stream = 25 P2P viewer subscriptions.
- Stress: 5 publishers × 19 viewers/stream = 95 subscriptions; diagnostic only.

Stress records the degradation point and may emit `STRESS_LIMIT_REACHED` without making that alone a production acceptance failure.

### D-15 — Initial Operational Quotas

Initial limits for the 20-user reference scale:

| Limit | Initial value |
|---|---:|
| `MAX_MESSAGES_PER_WINDOW` | 30 / 10s / session |
| `MAX_COMMANDS_PER_WINDOW` | 60 / 10s / session |
| `MAX_CONTROL_COMMANDS_IN_FLIGHT` | 8 / session |
| `MAX_WS_CONNECTIONS_PER_USER` | 6 (5 control + 1 voice) |
| `MAX_WS_CONNECTIONS_GLOBAL` | 100 |
| `MAX_SESSIONS_PER_USER` | 5 |
| `MAX_PAYLOAD_BYTES` | 256 KB |
| `MAX_CHAT_MESSAGE_BYTES` | 4 KB |
| `MAX_COMMAND_PAYLOAD_BYTES` | 64 KB |
| `MAX_SIGNALING_PAYLOAD_BYTES` | 64 KB |
| `MAX_WEBRTC_CANDIDATES_PER_SESSION` | 100 |
| `MAX_MEDIA_SESSIONS_PER_USER` | 5 |
| `MAX_RECEIVED_STREAMS_PER_USER` | 5 |
| `MAX_VOICE_SESSIONS_PER_USER` | 1 |
| `MAX_ACTIVE_PUBLISHERS_PER_CHANNEL` | 5 |
| `MAX_VIEWERS_PER_STREAM` | 5 |
| `MAX_TURN_RELAYS` | 10 |
| `COMMAND_TIMEOUT` | 5s |
| `GRACEFUL_SHUTDOWN_TIMEOUT` | 15s |

Message quotas apply to client-generated chat/DM traffic and equivalent user-originated operations, not internal Gateway fan-out.

All values are observable and tunable operating limits. Tuning a value by benchmark does not reopen the architectural decision that the limit exists.




### D-16 — Voice Reconnect Policy

Initial values:

```text
MAX_RECONNECT_ATTEMPTS = 5
MAX_BACKOFF            = 30s
GRACE_PERIOD           = 30s
```

Use exponential backoff with jitter.

After exhausting attempts:

```text
VOICE_RECONNECT_EXHAUSTED
```

The VoiceSession enters a recoverable state requiring a new connection / reconciliation.

### D-17 — Chat History Bound

```text
MAX_HISTORY = 200
```

Channel history is limited to 200 messages loaded per query.

This value does **not** imply automatic persistent storage. Chat retention remains governed by the still-open retention decision; do not introduce a persistent chat database without an explicit retention decision.

### D-18 — Idempotency Bounds

```text
IDEMPOTENCY_TTL          = 60s
MAX_REQUESTS_PER_SESSION = 120
```

Every mutable command carries a `requestId`.

During the TTL:

```text
same requestId + same payload     → returns previous result
same requestId + different payload → IDEMPOTENCY_KEY_REUSE
```

### D-19 — Channel Password Handling

```text
Browser
   ↓ password
Gateway
   ↓
TS6
```

Invariants:

- the password is never persisted;
- it never appears in logs;
- it is never forwarded to another WebSession;
- it stays in memory only during the operation;
- maximum TTL of 60 seconds;
- if TS6 rejects it, a structured error is returned;
- after success, the password is discarded.

The Gateway must never attempt to "remember" a channel password.

### D-20 — WebRTC Renegotiation Rules

Definição de mudança de stream:

- mudança de stream = alteração do conjunto de tracks publicado, `trackId`, `kind` ou publisher ativo num PeerConnection existente;
- adição/remoção de track sem troca de publisher = renegotiação;
- troca total de PeerConnection = nova sessão de mídia.

Regras:

```text
troca de canal                          → encerra media authorization
mudança de track num PeerConnection     → renegociação se PeerConnection
                                          puder ser preservado sem alterar
                                          a autoridade de signaling
alteração estrutural de tracks          → renegociação
mudança de ICE/network                  → ICE restart
falha de renegociação                   → destruir media session e criar nova
timeout de negociação                   → 10s
```

Uma conexão antiga nunca permanece autorizada após mudança de contexto.

### D-21 — SLO Baseline

Initial product SLOs at the reference load (20 users, 20 in voice, 5 publishers):

| Metric | SLO |
|---|---:|
| Gateway command p95 | ≤ 500 ms |
| Gateway command p99 | ≤ 1.5 s |
| WebSocket event propagation p95 | ≤ 250 ms |
| Voice reconnect p95 | ≤ 10 s |
| WebRTC signaling setup p95 | ≤ 5 s |
| WebRTC recovery / ICE restart p95 | ≤ 5 s |
| Graceful shutdown | ≤ 15 s |
| Snapshot stabilization | ≤ 3 cycles |

These are product SLOs at reference load, not absolute infrastructure guarantees.
The `Voice reconnect p95 ≤ 10s` value is a performance target measured at the
reference load, not a hard upper bound on every reconnect attempt.

**Recovery budget (D-16):**

```text
MAX_RECONNECT_ATTEMPTS = 5
MAX_BACKOFF            = 30s
GRACE_PERIOD           = 30s
```

These are the parameters governing the reconnect state machine. The p95 ≤ 10s SLO
is a target that the reconnect mechanism should aim to achieve under normal
conditions; exceeding the hard limit (30s backoff) does not automatically
satisfy the SLO, and the VOICE_RECONNECT_EXHAUSTED state is the operational
fallback. The relationship between D-16 parameters and D-21 SLO should be
validated by benchmark — the reconnect p95 must be empirically measured and
confirmed ≤ 10s before the SLO claim is considered stable.

### D-22 — Backup / Restore (v3 scope)

Simple for v3:

- backup of persistent database/configuration;
- encrypted TS identity included in the backup;
- external secrets are not hardcoded in the backup;
- restore must be able to reconstruct persistent state;
- media/voice runtime state is **not** restored;
- after restore → startup reconciliation.

No HA, PITR or S3 inventing at this stage.

### D-23 — Licensing / Provenance

Before distribution:

- dependency inventory;
- license of each dependency;
- origin of external code;
- mandatory attributions;
- `LICENSE` / `NOTICE` files when required;
- third-party code cannot be incorporated without traceability;
- agent-generated artifacts also enter the provenance review.

This is especially important because we are moving to code-agent execution.


## 3.1 TeamSpeak 6 é a fonte de verdade do estado TeamSpeak

Para:

- canais;
- clientes;
- presença;
- posição dos clientes;
- identidade TeamSpeak;
- permissões;
- estado observado do servidor;

o gateway mantém uma projeção operacional, mas não cria uma segunda fonte
de verdade.

```text
TeamSpeak 6
    |
    v
TS6 Adapters
    |
    v
Projection / State
    |
    v
Browser
```

A projeção deve ser reconstruível.

## 3.2 O navegador nunca acessa diretamente o TeamSpeak

```text
Browser
   |
 HTTPS / WSS
   |
   v
Gateway
   |
   +--> TS6 Control
   |
   +--> TS6 Voice
   |
   +--> Media Signaling
```

Credenciais do TS6, chaves privadas e detalhes de integração nunca são
entregues ao navegador.

## 3.3 O domínio Web não conhece o protocolo TS6

O frontend trabalha com conceitos próprios:

```text
User
Session
Channel
Participant
Message
VoiceSession
MediaSession
Stream
```

A tradução para:

```text
clid
cid
uid
virtual client
TS6 packet
```

fica restrita aos adapters.

## 3.4 Integrações stateful ficam atrás de managers

Conexões persistentes devem ser administradas por componentes próprios:

```text
ControlManager
VoiceManager
WorkerSupervisor
SessionManager
MediaSessionManager
```

Não criar conexões novas em cada request quando a integração exige
persistência.

## 3.5 Eventos atualizam estado; comandos não inventam estado

Preferir:

```text
command
   ↓
TS6
   ↓
TS6 event
   ↓
projection update
   ↓
broadcast
```

Um comando que retorna sucesso pode acelerar a UX, mas a confirmação
canônica deve vir do estado observado quando isso for possível.

## 3.6 Um request tem uma identidade própria

Toda operação mutável deve possuir:

```text
requestId
sessionId
```

Quando relevante, também:

```text
correlationId
```

Isso permite deduplicação, observabilidade e reconciliação.

---

# 4. Arquitetura do sistema

```text
                         Browser
                            |
                    HTTPS / WSS
                            |
                            v
                 +----------------------+
                 |      Web Gateway     |
                 +----------------------+
                  |        |          |
                  |        |          |
                  v        v          v
              Control    Voice      Media
              Session    Session    Signaling
                  |        |          |
                  v        v          v
             TS6 Control TS6 Voice  WebRTC
                  |        |
                  |        v
                  |    Voice Worker
                  |        |
                  +--------+
                       |
                       v
                   TeamSpeak 6
```

## 4.1 Processos

### Gateway

Responsável por:

- autenticação Web;
- sessões;
- autorização;
- estado/projeção;
- canais;
- presença;
- mensagens;
- signaling;
- coordenação dos workers.

### Voice Worker

Responsável por:

- protocolo de voz TS6;
- socket UDP;
- framing;
- codec de voz (Opus se validado);
- encode/decode;
- jitter/reorder;
- pacing;
- reconexão da camada de voz.

### Media Plane

Na v3 usa P2P WebRTC.

O gateway faz:

- autorização;
- signaling;
- lifecycle;
- ownership;
- revogação.

O áudio/vídeo da chamada não passa pelo gateway depois do estabelecimento
do peer, salvo quando uma decisão posterior exigir outra topologia.

---

# 5. Autenticação Web e sessão

## 5.1 Conta Web

A v3 deve possuir autenticação própria.

Modelo mínimo:

```text
User
 ├── id
 ├── username
 ├── passwordHash
 ├── enabled
 └── timestamps
```

O mecanismo de autenticação deve usar sessão segura, com:

- credencial de login;
- access/session token;
- refresh quando aplicável;
- expiração;
- revogação;
- logout.

Tokens de sessão não devem aparecer em URL ou logs.

## 5.2 WebSession

Cada login cria uma sessão Web identificável:

```text
WebSession
 ├── sessionId
 ├── userId
 ├── createdAt
 ├── expiresAt
 └── state
```

Uma sessão pode possuir no máximo uma `VoiceSession` ativa na v3.

## 5.3 Múltiplas sessões do mesmo usuário

A política padrão da v3 é:

```text
User
 ├── WebSession A
 └── WebSession B
```

é permitido.

Cada sessão é independente **no plano Web**. No plano de voz, o modelo
segue **D-01**:

```text
User -> many WebSessions -> at most one VoiceSession
      -> one ownerSessionId -> one TeamSpeak voice client
```

Invariantes:

- uma segunda WebSession não pode criar um cliente de voz paralelo para
o mesmo usuário;
- iniciar voz em outra WebSession transfere a ownership atômicamente,
com fencing por `bindingGeneration`;
- a identidade TS6 persistente é reutilizada entre reconnects/restarts.

A política de "uma sessão por conta" não será usada como mecanismo de
consistência.

---

# 6. Identidade TeamSpeak

## 6.1 Relação

```text
Web User
   |
   v
Persistent TS Identity
   |
   v
TS6 Virtual Client
```

A identidade persistente pertence ao usuário, enquanto o cliente virtual
pertence à sessão.

## 6.2 Lifecycle

Devem ser definidos e implementados:

- criação;
- persistência;
- recuperação;
- criptografia do material sensível;
- associação ao usuário;
- revogação;
- perda/corrupção;
- migração;
- backup.

O gateway não deve gerar uma identidade nova a cada reconnect normal.

## 6.3 Cliente virtual

O cliente virtual deve possuir estado próprio:

```text
DISCONNECTED
CONNECTING
CONNECTED
JOINING
IN_CHANNEL
RECONNECTING
CLOSING
CLOSED
```

A implementação deve distinguir claramente:

```text
Internal Virtual Client
Remote TeamSpeak Client
```

para que eventos dos próprios clientes do gateway não sejam confundidos
com usuários remotos.

---

# 7. Fencing e ownership

## 7.1 Geração do binding

Cada associação de sessão com cliente virtual possui uma geração:

```text
bindingGeneration
```

Qualquer operação assíncrona deve carregar a geração que a originou.

Se a geração atual for diferente:

```text
old operation
    ↓
stale
    ↓
must not mutate current state
```

## 7.2 Ownership

Uma `VoiceSession` pertence a exatamente uma `WebSession`.

Uma `MediaSession` representa uma sessão de mídia WebRTC e pertence a
exatamente uma `WebSession`.

Ela pode atuar como:

- `PUBLISHER`: publica webcam/tela/áudio de tela;
- `VIEWER`: recebe um ou mais streams autorizados.

`MAX_ACTIVE_STREAMS_PER_USER = 1` limita publicação ativa, enquanto
`MAX_MEDIA_SESSIONS_PER_USER = 5` limita sessões WebRTC simultâneas do usuário,
incluindo visualização.

O backend valida ownership antes de qualquer:

- signaling;
- publicação;
- assinatura;
- encerramento;
- troca de canal;
- alteração de estado.

---

# 8. Estado e sincronização

## 8.1 Modelo de estado

A projeção mínima deve representar:

```text
Server
Channel[]
Participant[]
CurrentSessionParticipant
Message state
Connection health
Capabilities
```

## 8.2 Snapshot + eventos

A v3 **não depende de `stateVersion` do protocolo**. O mecanismo concreto
é definido pela **D-08 — Snapshot Stabilization Protocol**:

```text
1. assinar o stream de eventos autoritativo;
2. capturar eventCursorBefore;
3. ler o estado autoritativo do TS6 (snapshot);
4. capturar eventCursorAfter;
5. bufferizar eventos recebidos durante a janela;
6. instalar o snapshot como base;
7. replay dos eventos bufferizados em ordem de cursor;
8. validation read;
9. se mudou durante a janela final, repetir;
10. após máximo de 3 ciclos → RECONCILING + reconcile completo.
```

Um checksum determinístico do estado normalizado pode acelerar as
comparacões de igualdade. O design não depende de `stateVersion` não
verificado do TS6.

Invariantes (D-08):

- estado em `RECONCILING` não é apresentado como ready;
- mutações concorrentes são incorporadas ou disparam novo ciclo;
- falha persistente vira condição de reconcile observável;
- TS6 permanece autoritativo;
- Gateway é dono do buffering, normalização e reconciliação.

Não basta "achar" que não houve mudança.

## 8.3 Snapshot generation

Cada snapshot possui:

```text
snapshotId
startedAt
completedAt
status
```

Estados:

```text
RUNNING
VALIDATING
READY
RETRYING
FAILED
```

Snapshots concorrentes devem ser deduplicados por single-flight.

## 8.4 Rebuild

Quando a projeção perder confiança:

```text
DEGRADED
   ↓
SNAPSHOT
   ↓
RECONCILE
   ↓
READY
```

Não aplicar correções arbitrárias que façam o gateway inventar estado.

## 8.5 Eventos duplicados ou atrasados

Consumidores devem ser tolerantes a:

- duplicação;
- atraso;
- reconnect;
- reordenação quando o transporte permitir.

Handlers devem ser idempotentes sempre que possível.

---

# 9. Comandos do Control Plane

## 9.1 Resultado

Toda operação mutável deve ter resultado estruturado:

```text
SUCCESS
FAILED
TIMEOUT
UNKNOWN
```

## 9.2 `UNKNOWN`

`UNKNOWN` significa:

> o gateway não conseguiu confirmar se a operação foi aplicada.

Não significa automaticamente "falhou".

Fluxo:

```text
command
   ↓
timeout / resposta perdida
   ↓
UNKNOWN
   ↓
RECONCILING
   ↓
CONFIRMED / FAILED
```

## 9.3 Idempotência

Chave mínima:

```text
sessionId + requestId
```

A deduplicação deve possuir TTL e limite de memória (D-18):

```text
IDEMPOTENCY_TTL          = 60s
MAX_REQUESTS_PER_SESSION = 120
```

Durante o TTL:

```text
mesmo requestId + mesmo payload      → retorna resultado anterior
mesmo requestId + payload diferente  → IDEMPOTENCY_KEY_REUSE
```

Não é necessário introduzir Redis apenas para essa finalidade.

## 9.4 Timeouts

Timeouts devem ser definidos por operação.

Um timeout de rede não deve ser tratado como confirmação negativa.

## 9.5 Erros

Formato padrão:

```json
{
  "code": "CHANNEL_NOT_FOUND",
  "message": "Canal não encontrado",
  "retryable": false,
  "requestId": "req_123"
}
```

O frontend deve usar `code` e `retryable`, não interpretar texto livre.

---

# 10. Control Adapter

O adapter é responsável por traduzir o domínio Web para a integração
de controle do TS6.

Responsabilidades:

- conexão;
- autenticação;
- comandos;
- consulta de estado;
- eventos;
- health;
- reconnect;
- circuit breaker;
- timeout.

Não deve conter regras de UI.

## 10.1 Health

Estados:

```text
HEALTHY
DEGRADED
RECONNECTING
OFFLINE
```

## 10.2 Circuit breaker

Falhas consecutivas devem impedir tempestade de requests.

Fluxo conceitual:

```text
HEALTHY
   ↓ falhas
OPEN
   ↓ cooldown
HALF_OPEN
   ↓ sucesso
HEALTHY
```

---

# 11. Canais e presença

## 11.1 Channel model

O domínio Web deve possuir:

```text
Channel
 ├── id
 ├── parentId
 ├── name
 ├── order
 └── metadata necessária à UI
```

O frontend não precisa conhecer IDs internos específicos do protocolo.

## 11.2 Presença

Presença é separada de mensagens.

Eventos mínimos:

```text
participant.joined
participant.left
participant.moved
participant.updated
```

## 11.3 Troca de canal

Ao solicitar troca:

```text
Browser
 ↓
Gateway
 ↓
permission check
 ↓
TS6
 ↓
event
 ↓
projection
 ↓
broadcast
```

Falha de permissão deve produzir erro estruturado.

A UI não deve assumir que o move aconteceu apenas porque o request foi
enviado.

## 11.4 Capacidade

A capacidade de slots deve ser obtida do servidor/configuração real.

Não assumir que todo servidor possui uma quantidade fixa universal.

O gateway deve considerar seus próprios clientes virtuais no orçamento:

```text
TS6 capacity
  - external clients
  - gateway virtual clients
  - other reserved/known clients
```

---

# 12. Voice Plane

A voz é o principal risco técnico da v3.

O Voice Plane deve ser tratado como um subsistema independente.

```text
Browser
  |
  | WSS /voice
  v
Gateway
  |
  | IPC
  v
Voice Worker
  |
  | TS6 voice protocol / UDP
  v
TeamSpeak 6
```

## 12.1 Regra fundamental

Não considerar a implementação concluída apenas porque:

```text
Browser → Opus → UDP
```

funciona.

O cliente deve implementar o contrato real exigido pelo protocolo TS6,
incluindo handshake, sessão, identidade, framing, sequência, keepalive,
criptografia e lifecycle.

---

# 13. Voice Worker

## 13.1 Isolamento

O Voice Worker é um processo separado.

Objetivo:

```text
worker crash
   ↓
não derrubar gateway
```

## 13.2 Supervisor

O gateway deve supervisionar:

```text
start
health
heartbeat
restart
backoff
crash-loop
shutdown
```

## 13.3 Crash-loop

Não reiniciar indefinidamente sem controle.

Usar:

```text
exponential backoff
restart budget
degraded state
circuit breaker
```

## 13.4 IPC

Contrato mínimo:

```text
Gateway → Worker

CREATE_SESSION
CONNECT
JOIN_CHANNEL
SEND_AUDIO
SET_MUTE
SET_DEAF
DISCONNECT

Worker → Gateway

CONNECTED
AUDIO
SPEAKING
STATE_CHANGED
DISCONNECTED
ERROR
HEARTBEAT
```

Cada mensagem deve possuir:

```text
protocolVersion
sessionId
requestId quando aplicável
timestamp quando aplicável
```

---

# 14. Pipeline de áudio

## 14.1 Formato de referência

```text
48 kHz
2 canais
20 ms/frame
960 samples/frame
PCM 16-bit internamente
codec negociado no transporte; Opus somente se confirmado pelo F-1
```

Esses valores são referência de pipeline, não substituto da especificação
real do protocolo TS6.

## 14.2 Recepção

```text
TS6 UDP
 ↓
packet validation
 ↓
sequence handling
 ↓
reorder
 ↓
jitter buffer
 ↓
late packet policy
 ↓
Opus decode
 ↓
audio pacing
 ↓
Browser playback
```

## 14.3 Jitter buffer

O buffer deve possuir limites explícitos.

Frames excessivamente atrasados devem ser descartados em vez de aumentar
latência indefinidamente.

## 14.4 Packet loss

Parâmetros e comportamento (D-04):

- perda máxima tolerada: métricas contínuas em `voice_packet_loss` (§31.3);
- descarte de frames atrasados: `LATE_FRAME_THRESHOLD_MS` configurável por benchmark;
- PLC (Packet Loss Concealment): recurso nativo do decodificador Opus/PCM;
- comportamento em perda persistente: degradação observável com reconexão se o canal cair (D-16).

## 14.5 Clock drift

O pipeline deve controlar pacing e diferença entre clocks.

Não depender apenas de `setInterval` para áudio em tempo real.

---

# 15. Captura de voz no navegador


### Backlog de implementação

As tarefas normativas de implementação ficam consolidadas na **Seção 40 —
Prioridades e Backlog Canônico**. Esta seção não mantém uma segunda
numeração de tarefas.

## 15.1 AudioWorklet

O caminho principal de processamento deve usar `AudioWorklet` quando a
plataforma suportar.

Evitar processamento contínuo de áudio crítico no main thread.

## 15.2 Device lifecycle

Tratar:

- permissão negada;
- microfone ausente;
- troca de dispositivo;
- `devicechange`;
- perda do dispositivo;
- browser em background.

## 15.3 VAD

O estado "falando" deve refletir áudio real.

**Autoridade (D-09):** o estado `speaking` compartilhado é calculado pelo
**Voice Worker** a partir do áudio decodificado, nunca pelo browser:

```text
TS6 voice -> Worker decode -> PCM -> VAD -> speaking
    -> Gateway -> WebSocket -> UI
```

- a atividade do microfone no browser é apenas feedback local de UI;
- o browser não pode afirmar o estado `speaking` autoritativo de outro
usuário;
- o Gateway rejeita estado `speaking` autoritativo enviado pelo cliente;
- VAD usa debounce/hangover e estado stale expira automaticamente:

```text
VAD_ON_HOLD_MS      = 40
VAD_OFF_HOLD_MS     = 200
VAD_IDLE_TIMEOUT_MS = 500
```

Valores tunáveis por benchmark.

## 15.4 PTT

Estados:

```text
IDLE
PRESSED
TRANSMITTING
RELEASED
```

A liberação do PTT deve sempre encerrar a transmissão mesmo em casos de
erro/reconnect.

## 15.5 Mute / Deaf

Distinguir:

```text
mute = não transmitir microfone
deaf = não reproduzir voz recebida
```

A semântica deve ser consistente entre UI, gateway e worker.

---

# 16. Máquina de estados de voz

Estados de alto nível:

```text
DISCONNECTED
CONNECTING
CONNECTED
JOINING
IN_CHANNEL
RECONNECTING
VOICE_RECONNECT_EXHAUSTED
CLOSING
CLOSED
FAILED
```

Transições inválidas devem ser rejeitadas.

Exemplo:

```text
DISCONNECTED
  └── CONNECT → CONNECTING

CONNECTING
  ├── success → CONNECTED
  └── failure → FAILED

CONNECTED
  └── join → JOINING

JOINING
  ├── success → IN_CHANNEL
  └── failure → CONNECTED

IN_CHANNEL
  └── transport loss → RECONNECTING

RECONNECTING
  ├── reconnect success → IN_CHANNEL
  └── attempts exhausted → VOICE_RECONNECT_EXHAUSTED

VOICE_RECONNECT_EXHAUSTED
  ├── explicit/new connection → CONNECTING
  └── session shutdown → CLOSING

FAILED
  └── close → CLOSING

CLOSING
  └── cleanup complete → CLOSED
```

A implementação deve impedir operações em estado incompatível.

---

# 17. Reconnect de voz

## 17.1 Backoff

Usar backoff com jitter.

## 17.2 Limites

Definir (D-16):

```text
MAX_RECONNECT_ATTEMPTS = 5
MAX_BACKOFF            = 30s
GRACE_PERIOD           = 30s
```

Backoff exponencial com jitter. Após exceder as tentativas:

```text
VOICE_RECONNECT_EXHAUSTED
```

a VoiceSession entra em estado recuperável, exigindo nova conexão/reconciliação.

## 17.3 Sessão de controle

A VoiceSession não pode sobreviver indefinidamente à morte da sessão Web
de controle.

Regra:

```text
ControlSession lost
   ↓
VoiceSession enters grace period
   ↓
control restored → keep/rebind
control not restored → close voice
```

Isso evita recursos órfãos.

---

# 18. Áudio do compartilhamento de tela

**Decisão tomada (D-02):** o áudio da tela pertence ao **Media Plane** e
usa uma **track WebRTC dedicada**.

```text
screen
 + system audio
      ↓
Media Plane
      ↓
dedicated WebRTC audio track
```

Regras (D-02):

- independente do canal de voz do microfone no TS6;
- mute/deaf do microfone **não** muta implicitamente o áudio da tela;
- volumes do microfone e do áudio de tela são controlados
independentemente;
- sincronização A/V pertence à media session WebRTC;
- comportamento de captura/mixagem do browser é item de validação
(F-1), não fato assumido.

Não existe bifurcação Voice Plane para o áudio de tela na v3.

---

# 19. Media Plane

## 19.1 Topologia v3

A v3 usa:

```text
P2P WebRTC
```

para webcam e tela.

Não há SFU no escopo inicial.

Isso é uma decisão de escala, não uma afirmação de que P2P é superior em
qualquer cenário.

## 19.2 Custo P2P

Para um publisher:

```text
upload ≈ bitrate × viewers
```

Exemplo de referência (stress, diagnóstico apenas):

```text
2 Mbps × 19 viewers = 38 Mbps
```

por publisher.

Cenário de aceite (D-14):

```text
2 Mbps × 5 viewers = 10 Mbps
```

por publisher como limite operacional. Com `MAX_VIEWERS_PER_STREAM = 5`
e Click-to-Watch, o upload por publisher é limitado e previsível.

## 19.3 Fallback

Se o publisher não conseguir sustentar a política de mídia:

```text
degrade bitrate
    ↓
degrade resolution
    ↓
disable video
```

Não prometer qualidade fixa em rede insuficiente.

Uma futura versão pode adicionar SFU.

---

# 20. Signaling WebRTC

O gateway é a autoridade de signaling.

Fluxo:

```text
Publisher
   ↓
Gateway
   ↓
authorize
   ↓
Viewer
```

O gateway decide se um viewer pode receber determinado stream.

O viewer não pode criar uma assinatura arbitrária apenas conhecendo um
streamId.

## 20.1 Ownership

Cada stream possui:

```text
streamId
publisherSessionId
channelId
kind
createdAt
state
```

## 20.2 Estado

```text
CREATED
SIGNALING
ACTIVE
DEGRADED
STOPPING
CLOSED
```

## 20.3 Peer state

Cada relação P2P deve possuir:

```text
NEW
CONNECTING
CONNECTED
RECONNECTING
FAILED
CLOSED
```

---

# 21. Autorização de mídia

## 21.1 Regra

O publisher só pode publicar no contexto autorizado.

O viewer só pode receber um stream se:

```text
viewer autorizado
+
stream ativo
+
mesmo contexto/canal autorizado
```

## 21.2 Troca de canal

Ao mudar de canal:

```text
participant moves
   ↓
revoke media authorization
   ↓
close viewer/publisher media as applicable
   ↓
broadcast updated state
```

Não depender apenas do frontend para fechar o peer.

## 21.3 Revogação

A autorização deve ser invalidada no backend imediatamente após uma mudança
de contexto.

---

# 22. ICE, STUN e TURN

## 22.1 ICE

O lifecycle deve contemplar:

```text
gathering
checking
connected
completed
failed
disconnected
```

## 22.2 STUN

Usado para descoberta de caminhos quando possível.

## 22.3 TURN

TURN é fallback para NAT/rede que não permite caminho P2P direto.

A v3 deve usar:

- credenciais temporárias;
- expiração;
- limites de relay;
- métricas;
- proteção contra abuso.

TURN TCP/TLS deve ser considerado quando UDP não estiver disponível.

---

# 23. Renegociação WebRTC

Mudanças de mídia devem ser tratadas explicitamente:

- adicionar/remover câmera;
- iniciar/parar screen share;
- adicionar/remover áudio da tela;
- trocar dispositivo;
- ICE restart;
- mudança de codec quando suportada.

Regras (D-20):

```text
troca de canal                    → encerra media authorization
mudança de stream                 → renegociação se a sessão puder ser
                                     preservada sem alterar a autoridade
alteração estrutural de tracks    → renegociação
mudança de ICE/network            → ICE restart
falha de renegociação             → destruir media session e criar nova
timeout de negociação             → 10s
```

Não criar uma nova conexão inteira para toda alteração simples sem
necessidade, mas nunca manter uma conexão antiga autorizada após mudança
de contexto.

---

# 24. Adaptive bitrate

O Media Plane deve possuir limites de qualidade.

Estratégia mínima:

```text
NETWORK GOOD
    ↓
normal bitrate

NETWORK DEGRADED
    ↓
lower bitrate

NETWORK BAD
    ↓
lower resolution

NETWORK UNSUSTAINABLE
    ↓
video disabled
```

Os valores finais devem ser definidos durante o benchmark.

---

# 25. Chat

## 25.1 Decisão de arquitetura

A v3 separa o conceito de mensagem Web do estado de presença.

**Decisão tomada (D-07):** o chat de canal é **autoritativo pelo TS6**.

- envio: operação nativa de texto de canal do TS6;
- propagação: eventos de chat do TS6 através do Gateway;
- não existe fonte de verdade concorrente persistente de chat de canal.

O contrato de mensagens registra essa escolha. DM Web permanece efêmera
por padrão na v3 (ver §26).

## 25.2 Modelo

```text
Message
 ├── messageId
 ├── conversationId
 ├── senderId
 ├── createdAt
 ├── sequence
 └── body
```

## 25.3 Ordering

O ordering deve vir de uma autoridade clara.

Não usar `Date.now()` como sequência.

Se a origem for TS6, a sequência/origem do TS6 deve ser respeitada.

## 25.4 Limites

Definir:

```text
MAX_MESSAGE_LENGTH = 1.000 caracteres por mensagem
MESSAGE_RATE_LIMIT = 30 msgs / 10s / sessão (alinhado à D-15)
MAX_HISTORY        = 200 (D-17)
```

`MAX_MESSAGE_LENGTH` é limitado a 1.000 caracteres e o payload também é
validado estritamente em UTF-8 contra `MAX_CHAT_MESSAGE_BYTES = 4 KB` (D-15). `MESSAGE_RATE_LIMIT` alinha a `MAX_MESSAGES_PER_WINDOW`
da D-15. `MAX_HISTORY` limita a 200 mensagens carregadas por consulta e não
implica persistência automática; retenção de chat permanece decisão em aberto.

---

# 26. Mensagens privadas

DM precisa de uma decisão explícita de persistência.

A v3 adota como padrão:

```text
DM = ephemeral
```

se não houver requisito de histórico persistente.

Se o produto decidir persistir:

```text
Conversation
Message
ReadState
Retention
```

devem ser adicionados ao modelo.

Não deixar o protocolo com `conversationId` sugerindo persistência que o
backend não fornece.

---

# 27. Segurança

## 27.1 Web

Obrigatório:

- HTTPS em produção;
- cookies/tokens seguros;
- validação de origem;
- CSRF protection quando aplicável;
- rate limiting;
- payload validation;
- headers de segurança;
- limites de conexão.

## 27.2 WebSocket

Obrigatório:

```text
TLS
authentication
Origin validation
session binding
payload validation
rate limiting
connection limit
idle timeout
```

Nunca colocar credenciais sensíveis em:

```text
URL
query string
logs
```

## 27.3 Autorização

Toda operação deve verificar:

```text
authenticated user
+
session ownership
+
resource ownership
+
channel authorization
```

## 27.4 Multi-tenant

Mesmo com um servidor na v3, o código deve evitar APIs que aceitem um
`serverId` arbitrário sem validação.

---

# 28. Proteção contra abuso

Limites por usuário/sessão devem existir para:

```text
WebSocket connections
VoiceSessions
MediaSessions
streams
messages
commands
signaling
```

Exemplos:

```text
MAX_SESSIONS_PER_USER
MAX_VOICE_SESSIONS_PER_USER
MAX_MEDIA_SESSIONS_PER_USER
MAX_ACTIVE_STREAMS_PER_USER
MAX_MESSAGES_PER_WINDOW
MAX_COMMANDS_PER_WINDOW
```

---

# 29. SSRF e recursos externos

Se a aplicação aceitar URLs externas para mídia ou integrações, aplicar:

- allowlist de protocolos;
- bloqueio de localhost;
- bloqueio de redes privadas;
- bloqueio de metadata endpoints;
- proteção contra DNS rebinding;
- validação após resolução;
- controle de redirects;
- timeout;
- limite de resposta;
- limite de conexões.

---

# 30. Subprocessos de mídia

FFmpeg e ferramentas equivalentes devem possuir:

```text
timeout
kill tree
resource limit
output limit
concurrency limit
```

Um processo travado não pode manter indefinidamente:

- CPU;
- memória;
- sockets;
- arquivos temporários.

---

# 31. Observabilidade

## 31.1 Correlation IDs

Uma operação deve poder ser rastreada:

```text
browser
  ↓
gateway
  ↓
worker
  ↓
TS6
```

usando:

```text
requestId
correlationId
sessionId
```

quando aplicável.

## 31.2 Logs

Logs estruturados devem conter:

```text
timestamp
level
component
event
requestId
sessionId
errorCode
duration
```

Não registrar:

- senhas;
- tokens;
- chaves privadas;
- channel passwords;
- credenciais TS6.

## 31.3 Métricas

Mínimo:

```text
active_web_sessions
active_ts_clients
active_voice_sessions
voice_worker_restarts
voice_packet_loss
voice_jitter
voice_rtt
active_media_sessions
active_streams
turn_relay_ratio
websocket_connections
commands_timeout
commands_unknown
snapshot_rebuilds
```

---

# 32. Degraded states

O sistema deve distinguir:

```text
HEALTHY
DEGRADED
RECONNECTING
OFFLINE
```

Exemplo:

```text
TS6 control offline
    ↓
UI continua acessível
    ↓
ações mutáveis bloqueadas/limitadas
    ↓
estado mostra OFFLINE
```

Uma falha de voz não deve necessariamente derrubar o Control Plane.

Uma falha de Media Plane não deve derrubar voz ou presença.

---

# 33. Graceful shutdown

Sequência:

```text
SIGTERM
  ↓
stop accepting new sessions
  ↓
stop new commands
  ↓
close media signaling
  ↓
close voice sessions
  ↓
stop workers
  ↓
close TS6 connections
  ↓
flush logs/metrics
  ↓
exit
```

Deve existir timeout final:

```text
graceful shutdown
    ↓ timeout
force cleanup
    ↓
exit
```

---

# 34. Testes obrigatórios

## 34.1 Control Plane

- login/logout;
- expiração;
- reconnect;
- snapshot;
- evento durante snapshot;
- evento duplicado;
- evento atrasado;
- request duplicado;
- timeout;
- `unknown`;
- reconciliação;
- fencing;
- single-flight snapshot.

## 34.2 TeamSpeak

- servidor disponível;
- servidor indisponível;
- reconnect;
- capacidade insuficiente;
- permissão negada;
- channel password inválida;
- nickname collision;
- ghost client;
- evento do próprio cliente virtual.

## 34.3 Voice

- conectar;
- entrar em canal;
- enviar áudio;
- receber áudio;
- mute;
- deaf;
- PTT;
- packet loss;
- jitter;
- reorder;
- atraso;
- clock drift;
- reconnect;
- worker crash;
- crash-loop.

## 34.4 Media

- 1 publisher / 1 viewer;
- 1 publisher / N viewers;
- 5 publishers;
- limite de viewers;
- câmera;
- tela;
- áudio da tela;
- troca de dispositivo;
- troca de canal;
- ICE failure;
- TURN fallback;
- ICE restart;
- browser background;
- network change.

## 34.5 Chaos

Obrigatório simular:

```text
TS6 cai
TS6 volta
WSS cai
UDP cai
worker morre
browser dorme
network muda
ICE falha
TURN é necessário
evento duplica
evento chega atrasado
snapshot ocorre durante mutação
resposta de comando desaparece
```

---

# 35. Benchmark de referência

## 35.1 Control

Medir:

- tempo de conexão;
- tempo de snapshot;
- tempo de aplicação de eventos;
- tempo de comando;
- tempo de reconnect.

## 35.2 Voice

Medir:

- RTT;
- jitter;
- packet loss;
- atraso de reprodução;
- CPU do gateway;
- CPU do worker;
- memória;
- tempo de recuperação.

## 35.3 Media

Benchmark de aceite (D-14):

```text
20 usuários
20 em voz
5 publishers
5 viewers por publisher = 25 assinaturas P2P
```

Benchmark de stress (apenas diagnóstico):

```text
5 publishers
19 viewers por publisher = 95 assinaturas P2P
```

O stress registra o ponto de degradação e pode emitir
`STRESS_LIMIT_REACHED`, mas não é critério de aceite de produção.

Medir:

- upload de cada publisher;
- download de viewers;
- CPU;
- memória;
- número de PeerConnections;
- ICE failures;
- TURN usage;
- bitrate;
- perda;
- estabilidade.

Se o P2P ultrapassar os limites aceitáveis definidos antes do benchmark,
o resultado deve ser registrado como bloqueio para escala, e não escondido
por otimizações pontuais.

---

# 36. Fases de implementação

A ordem abaixo existe para reduzir risco.

## F-1 — Protocol Spike

**Objetivo:** provar que a integração de voz TS6 é viável.

Entregáveis:

- cliente mínimo;
- handshake;
- autenticação;
- identidade;
- conexão;
- join;
- envio de áudio;
- recepção de áudio;
- disconnect;
- reconnect.

**Critério:** não avançar para implementação completa de voz se o protocolo
não estiver demonstrado.

---

## F0 — Fundação e Control Plane

Implementar:

- projeto/monorepo;
- configuração;
- autenticação Web;
- WebSession;
- modelos;
- TS6 Control Adapter;
- conexão;
- eventos;
- snapshot;
- projeção;
- fencing;
- requestId;
- idempotência;
- timeout;
- `unknown`;
- reconciliação;
- error contract;
- health states;
- graceful shutdown.

**Saída:** navegador consegue conectar, receber estado e executar
operações de controle com consistência definida.

---

## F1A — Voice Protocol

Implementar o protocolo TS6 de voz isoladamente.

Entregáveis:

- handshake;
- sessão;
- identidade;
- UDP;
- framing;
- sequência;
- keepalive;
- criptografia;
- codec negociado no F-1 (ver D-10; Opus somente se confirmado pelo spike);
- send/receive.

**Saída:** Voice Worker consegue manter uma sessão de voz TS6 confiável.

---

## F1B — Audio Pipeline

Implementar:

- captura;
- AudioWorklet;
- PCM;
- codec negociado conforme F-1;
- Opus somente se confirmado pelo F-1;
- jitter buffer;
- reorder;
- late-frame discard;
- PLC;
- pacing;
- clock drift;
- backpressure.

**Saída:** áudio local/remoto estável e com latência mensurável.

---

## F1C — Browser Voice

Implementar:

- VoiceSession;
- WSS /voice;
- PTT;
- mute;
- deaf;
- VAD;
- device selection;
- devicechange;
- UI de estado;
- reconnect.

**Saída:** usuário Web consegue conversar com usuários TS6.

---

## F1D — Worker Recovery

Implementar:

- supervisor;
- heartbeat;
- restart;
- backoff;
- crash-loop protection;
- graceful shutdown;
- health metrics.

**Saída:** crash do worker não derruba o gateway.

---

## F1E — Voice Quality

Executar:

- testes de perda;
- jitter;
- reorder;
- atraso;
- network changes;
- 20 usuários;
- métricas;
- tuning.

**Saída:** parâmetros de qualidade documentados.

---

## F2 — Canais, presença e mensagens

Implementar:

- árvore de canais;
- presença;
- join/leave/move;
- permissões;
- chat;
- DM conforme decisão de persistência;
- ordering;
- unread state se aplicável;
- rate limits.

**Saída:** experiência de comunicação textual e de canais completa.

---

## F3 — Media Plane

Pré-condições arquiteturais já fechadas:

- `MAX_VIEWERS_PER_STREAM = 5` (D-14);
- screen audio = track WebRTC dedicada no Media Plane (D-02);
- autorização = Web capability + permissões TS6 (D-13);
- TURN = coturn próprio + credenciais efêmeras (D-11);
- política de fallback = degrade bitrate → resolução → disable (v3).

Valores definidos com tuning permitido pelo benchmark:

- `MAX_VIDEO_BITRATE_PER_STREAM = 2 Mbps` como cap operacional inicial;
- resolução por escalão do adaptive bitrate é definida empiricamente.

Implementar:

- MediaSession;
- stream ownership;
- signaling;
- P2P;
- ICE;
- STUN;
- TURN;
- renegociação;
- adaptive bitrate;
- revogação por troca de canal;
- device lifecycle.

**Saída:** webcam e tela funcionando dentro dos limites formais.

---

## F4 — Hardening e confiabilidade

Implementar:

- segurança WebSocket;
- quotas;
- SSRF;
- subprocess isolation;
- audit logs;
- métricas;
- dashboards básicos;
- chaos tests;
- backup/restore;
- retenção;
- revisão de licenciamento/proveniência.

**Saída:** sistema operacionalmente previsível.

---

## F5 — Aceite final

Executar o cenário completo:

```text
20 usuários
20 em voz
5 publishers
até o limite definido de viewers por stream
```

Validar:

- controle;
- presença;
- voz;
- texto;
- webcam;
- tela;
- reconnect;
- falhas;
- segurança;
- métricas;
- resource limits.

---

# 37. Critérios de aceite

## Control Plane

- [ ] autenticação funciona;
- [ ] sessão possui lifecycle definido;
- [ ] snapshot é consistente segundo mecanismo documentado;
- [ ] eventos são aplicados sem corromper projeção;
- [ ] fencing impede operações obsoletas;
- [ ] requests duplicados são deduplicados;
- [ ] timeout não é confundido com falha confirmada;
- [ ] `unknown` pode ser reconciliado;
- [ ] erros possuem códigos estruturados;
- [ ] health state é observável.

## TeamSpeak

- [ ] conexão funciona;
- [ ] reconnect funciona;
- [ ] capacidade é considerada;
- [ ] permissões são respeitadas;
- [ ] channel password não vaza;
- [ ] ghost clients são tratados;
- [ ] clientes virtuais são diferenciados de clientes remotos.

## Voice

- [ ] protocolo TS6 foi demonstrado no spike;
- [ ] worker é isolado;
- [ ] IPC possui contrato versionado;
- [ ] áudio possui backpressure;
- [ ] jitter/reorder/pacing estão definidos;
- [ ] PTT funciona;
- [ ] mute funciona;
- [ ] deaf funciona;
- [ ] VAD não depende de booleano não confiável;
- [ ] reconnect funciona;
- [ ] worker crash não derruba gateway.

## Media

- [ ] limites de publishers/viewers existem;
- [ ] bitrate máximo existe;
- [ ] signaling é autorizado;
- [ ] ownership é validado;
- [ ] troca de canal revoga mídia;
- [ ] ICE funciona;
- [ ] TURN fallback funciona;
- [ ] renegociação funciona;
- [ ] browser/device lifecycle é tratado;
- [ ] fallback de qualidade funciona.

## Segurança

- [ ] HTTPS/WSS;
- [ ] autenticação;
- [ ] autorização;
- [ ] Origin validation;
- [ ] rate limiting;
- [ ] connection limits;
- [ ] payload validation;
- [ ] SSRF protection;
- [ ] subprocess limits;
- [ ] secrets não aparecem em logs.

---

# 38. Fora de escopo da v3

Por decisão de escala:

- SFU;
- múltiplos gateways ativos;
- múltiplos servidores TeamSpeak;
- alta disponibilidade;
- Redis obrigatório;
- filas distribuídas;
- Kubernetes;
- escalabilidade horizontal;
- mobile app nativo;
- histórico persistente de DM, salvo decisão posterior;
- CDN para mídia;
- gravação de voz/vídeo;
- transcodificação distribuída.

Esses itens podem entrar em uma v3 caso os limites reais do produto
justifiquem.

---

# 39. Decisões fechadas no roadmap e pendências empíricas

Status das 24 decisões de fechamento (D-01 a D-23 + pendência empírica):

| # | Decisão | Status | Norma de fechamento |
|---|---|---|---|
| 1 | consistência snapshot/eventos | FECHADO | D-08 (Snapshot Stabilization) |
| 2 | protocolo de autenticação Web | FECHADO | §5.1 / §5.2 / D-01 |
| 3 | lifecycle da identidade TS6 | FECHADO | D-05 |
| 4 | política de múltiplas sessões | FECHADO | D-01 / §5.3 |
| 5 | ownership do cliente virtual | FECHADO | D-01 / §7.2 |
| 6 | contrato IPC do Voice Worker | FECHADO | §13.4 |
| 7 | política de backpressure | FECHADO | D-04 / §14.3 |
| 8 | jitter/reorder/pacing | FECHADO | D-04 / §14.2 |
| 9 | origem do VAD efetivo | FECHADO | D-09 (Voice Worker) |
| 10 | política de screen audio | FECHADO | D-02 / §18 (WebRTC dedicated track) |
| 11 | `MAX_VIEWERS_PER_STREAM` | FECHADO | D-14 (= 5) |
| 12 | bitrate máximo | EMPÍRICO | Depende do benchmark (§35.3 / F3) |
| 13 | política de fallback P2P | FECHADO | §19.3 (bitrate → res → disable) |
| 14 | ICE/STUN/TURN | FECHADO | D-11 (coturn próprio + efêmero) |
| 15 | renegociação | FECHADO | D-20 (10s timeout) |
| 16 | modelo Web chat vs TS6 chat | FECHADO | D-07 / §25.1 (TS6 autoritativo) |
| 17 | persistência de DM | FECHADO | D-07 / §26 (efêmero por padrão na v3) |
| 18 | rate limits | FECHADO | D-15 / §25.4 |
| 19 | payload limits | FECHADO | D-15 |
| 20 | shutdown timeout | FECHADO | D-12 (= 15s) |
| 21 | métricas mínimas | FECHADO | §31.3 / D-15 / D-21 |
| 22 | SLOs | FECHADO | D-21 |
| 23 | política de backup | FECHADO | D-22 (escopo v3) |
| 24 | proveniência/licenciamento | FECHADO | D-23 (pré-distribuição) |

---

# 40. Ordem de prioridade e Backlog Canônico

## P0 — bloquear desenvolvimento até validar

```text
P0-01 Protocol Spike
P0-02 Voice codec/handshake validation
P0-03 TS Identity lifecycle validation
P0-04 Voice ownership/fencing validation
P0-05 Snapshot/Event consistency validation
P0-06 P2P capacity validation
P0-07 Screen audio browser validation
P0-08 TURN/ICE path validation
```

## P1 — obrigatório para implementação robusta

```text
P1-01 Voice Worker IPC
P1-02 Audio backpressure
P1-03 Jitter/reorder/pacing
P1-04 ICE/STUN/TURN
P1-05 WebRTC renegotiation
P1-06 Adaptive bitrate
P1-07 Resource quotas
P1-08 Command antiflood
P1-09 Structured errors
P1-10 Reconciliation
P1-11 Health states
P1-12 Metrics
P1-13 SSRF/subprocess isolation
P1-14 Crash-loop protection
P1-15 Chaos tests
```

## P2 — evolução

```text
P2-01 Backup/restore avançado
P2-02 Log retention avançado
P2-03 Granular capabilities
P2-04 SLO dashboards
P2-05 SFU, somente se os benchmarks demonstrarem necessidade
```

---

# 41. Checklist de arquitetura fechada

O projeto só deve ser considerado "pronto para desenvolvimento completo"
quando os seguintes itens estiverem validados (decisão arquitetural fechada +
evidência empírica onde aplicável):

```text
[ ] protocolo TS6 de voz provado (depende do F-1 Protocol Spike)
[x] identidade definida (D-05)
[x] sessão definida (§5.1 / §5.2 / D-01)
[x] ownership definido (D-01 / §7.2)
[x] fencing definido (§7.1 / D-01)
[x] snapshot consistency definida (D-08)
[x] command semantics definida (§9.1 / §9.2 / D-18)
[x] unknown/reconciliation definida (§9.2 / D-08 / D-12)
[x] channel semantics definida (§11.1 / §11.3 / D-07)
[x] voice state machine definida (§16 / D-16)
[x] worker IPC definido (§13.4)
[x] audio pipeline definido (§14 / D-04 / D-10)
[x] backpressure definido (D-04 / §14.3)
[x] WebRTC topology definida (§19.1 / D-14)
[x] viewer limits definidos (D-14 = 5)
[x] bitrate inicial definido (2 Mbps; tuning por benchmark §35.3 / F3)
[x] screen audio definido (D-02 / §18 = track WebRTC dedicada)
[x] signaling authorization definido (§20 / §21 / D-14)
[x] ICE/TURN definido (D-11 = coturn próprio + efêmero)
[x] chat model definido (D-07 / §25.1 = TS6 autoritativo)
[x] DM model definido (D-07 / §26 = efêmero por padrão na v3)
[x] security model definido (§27 / D-13 / D-15)
[x] quotas definidas (D-15 / D-18)
[x] observability definida (§31 / D-15 / D-21)
[x] chaos scenarios definidos (§34.5)
[x] acceptance benchmark definido (cenário em §35.3 / D-14; resultados dependem de execução)
```

---

# 42. Regra de ouro da v3

O projeto não deve tratar:

```text
"funciona no happy path"
```

como evidência suficiente de que a arquitetura está pronta.

Para cada subsistema crítico, a pergunta é:

```text
O que acontece quando:
- a resposta some?
- o evento chega depois?
- a conexão cai?
- o processo morre?
- o usuário reconecta?
- a rede muda?
- a permissão muda?
- o recurso fica sem capacidade?
```

Se a resposta estiver definida em estado, contrato, timeout, reconciliação
ou política de fallback, o risco está controlado.

Se a resposta depender de "depois vemos", a arquitetura ainda não está
fechada.

---

# 43. Resultado esperado

Ao final da v3, o produto deve possuir esta separação:

```text
                         Browser
                            |
                +-----------+-----------+
                |                       |
             Control                   Media
                |                       |
                v                       v
             Gateway                 WebRTC P2P
                |
        +-------+-------+
        |               |
   Control Adapter   Voice Manager
        |               |
        v               v
       TS6         Voice Worker
                       |
                       v
                      TS6
```

Com as seguintes propriedades:

- TeamSpeak continua sendo a autoridade do estado TeamSpeak;
- o browser nunca recebe credenciais TS6;
- operações possuem identidade e podem ser reconciliadas;
- estado obsoleto não pode sobrescrever estado atual;
- voz está isolada em processo próprio;
- mídia não contamina o control plane;
- P2P possui limites mensuráveis;
- signaling é autorizado pelo gateway;
- falhas possuem estados explícitos;
- recursos possuem quotas;
- métricas permitem diagnosticar o caminho completo.

---

# 44. Nota de confiança

Este roadmap foi reescrito a partir da versão anterior do roadmap e das
análises técnicas realizadas sobre sua arquitetura. O objetivo é eliminar
ambiguidades conhecidas antes da implementação.

"100% de certeza" não é tecnicamente possível antes de validar o protocolo
TS6, navegadores, rede e comportamento real em benchmark. Por isso a v3
transforma as maiores incertezas em **spikes, contratos, limites, testes e
critérios de aceite**, em vez de assumir que funcionarão por definição.

O ponto mais importante é o `F-1 — Protocol Spike`: ele deve validar a
premissa mais arriscada antes que o restante do projeto dependa dela.

---

## Version 3.1 change log

This revision is a structural cleanup of v3.0.

- Removed the duplicated implementation backlog from the voice-capture section.
- Established Section 40 as the only canonical backlog and task-ID registry.
- Corrected WebSocket capacity to 6 per user: up to 5 control connections plus 1 voice connection.
- Corrected chat limits to 1,000 characters plus strict UTF-8 byte validation against the 4 KB payload ceiling.
- Clarified `MediaSession` as a WebRTC session that may be `PUBLISHER` or `VIEWER`; the 5-session quota therefore covers viewing as well as publishing.
- Unified Worker IPC terminology on `SPEAKING`.
- Unified VoiceSession terminal/recovery states, including `VOICE_RECONNECT_EXHAUSTED` and `CLOSED`.
- Renamed the architectural decision registry to a single D-01..D-23 normative section.
- Removed stale v3 references from the current roadmap scope.
- Removed unconditional Opus wording where the protocol spike remains authoritative.
- Kept empirical benchmark items explicitly empirical rather than reopening closed architecture decisions.

## Pre-Implementation Audit

Before starting code agents:

- [ ] F-1 proves the real TS6 voice handshake.
- [ ] F-1 identifies the negotiated codec and actual audio parameters.
- [ ] F-1 validates voice encryption/authentication requirements.
- [ ] Browser validation confirms screen-audio capture behavior.
- [ ] Benchmark validates or tunes the initial 2 Mbps media cap.
- [ ] Reference-load SLOs are measured rather than assumed.
- [ ] TURN relay behavior is measured under the acceptance scenario.
- [ ] Chaos tests cover snapshot races, command `UNKNOWN`, worker crash and network changes.
- [ ] No normative section contains unresolved contradictory wording.
- [ ] Section 40 is the only canonical backlog/ID registry.
