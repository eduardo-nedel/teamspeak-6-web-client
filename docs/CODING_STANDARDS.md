# Coding Standards & Guidelines

Este projeto usa padrões estritos para garantir qualidade e manutenibilidade.

## 1. Stack e Idioma de Backend
- **Node.js**: v20+
- **TypeScript**: v5+, `strict: true` ativado no `tsconfig.json`. Sem excepções para o flag `noImplicitAny` ou `strictNullChecks`.
- **Imports**: Usar ES Modules (`type: "module"`) ou paths padronizados.

## 2. Lidando com Result / Erros Pragmáticos
Evite lançar _Exceptions_ (`throw new Error()`) para controle de fluxo lógico (ex: usuário não encontrado, sem permissão, timeout).

**O que fazer:** Usar padrão de Roteamento de Erros, seja mapeando com interfaces puras ou Promises que resolvem em tipagem discriminante.
Exceptions só devem ser disparadas para erros não recuperáveis no sistema (Panic).

## 3. Interfaces vs Types
- Usar `interface` para modelagem de objetos padrão de negócio (Modelos).
- Usar `type` (Type Alias) para Union Types, cruzamentos e Primitivas (ex: `type UserId = string;`).

## 4. Estilo de Nomenclatura
- Classes: `PascalCase`
- Funções, Métodos, Instâncias e Variáveis: `camelCase`
- Constantes Hardcoded e Retornos Ambientais: `UPPER_SNAKE_CASE`
- Handlers/Eventos: Prefixo `on` + nome_evento ou `handle` + Ação (ex: `handleVoicePacket()`).

## 5. Pureza de Funções ("Side Effects")
Sempre que possível, desenhar funções que sejam puras (recebem `A` e gospem `B`).
Qualquer função que alterne estado de Sessões, I/O ou DB, deve ter uma menção clara no nome de que não é pura (Ex: `updateSession()`, `fetchParticipants()`).

## 6. Configuração e Variáveis
100% das variáveis de ambiente devem ser tipadas e validadas na inicialização do serviço.
> Use `Zod` (ou equivalente) para criar o schema em `/config.ts`. Se as variáveis não obedecerem o schema no boot, o serviço trava em fatal error (`process.exit(1)`).

## 7. Não existe "TODO: Depois eu vejo"
Se uma feature depende de algo incerto, levante o impedimento formal. Códigos de agent não devem possuir comentários `// TODO: ...` a menos que seja temporariamente registrado no documento de bloqueio ativo.
