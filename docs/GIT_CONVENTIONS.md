# Git & Branching Conventions

Neste projeto de agentes semi-autônomos, um controle de versão impecável dita a capacidade de fazer rollback seguro de alucinações de código.

## 1. Estrutura de Branches

- `main` : Reflete o último estado aceitável, aprovado e testado.
- `epic/numero-descriçao` : Branch correspondente a um Épico do ROADMAP. Ex: `epic/0-fundacao`.
- `feat/tarefa-id` : Cada task de um épico deverá possuir um commit atrelado ou, se extensa, possuir sua própria sub-branch.

O trabalho das IAs decorrerá fazendo spawn de `epic/...` bifurcadas de `main`.

## 2. Conventional Commits (Obrigatório)

Todos os commits gerados por humanos e agentes deverão respeitar a semântica convencional, para garantir _changelog generation_.

**Sintaxe Básica:**
`<tipo>([escopo opcional]): <mensagem>`

**Tipos predefinidos:**
- `feat`: Uma nova funcionalidade ou regra de negócio validada.
- `fix`: Resolução de um bug ou inconsistência em código já entregue anterior.
- `refactor`: Limpeza ou mudança de escopo (re-arquitetura) que não altera comportamento externo.
- `chore`: Atualização de pacotes, build tasks, gitignores.
- `docs`: Modificação de Roadmaps ou Arquiteturas.
- `test`: Criação e estabilização de suítes de teste.

**Exemplos de commits de IA bem feitos:**
`feat(auth): [Task 0.2] impl JWT session boundary guard`
`refactor(voice): encapsula ponte audioBridge para worker-thread isolada`
`fix(p2p): limita ice candidates emitidos ao client para prevenir overflow de SDP`

## 3. Atomicidade e "Mensagem de Estado"

- Agentes devem disparar commits na conclusão precisa do alvo da tarefa.
- NUNCA submeter um commit gigantesco `feat: done everything`.
- Para arquivos marcados como 'Impedimento' temporário, use um commit prefixado: `WIP: bloqueado em...`.
