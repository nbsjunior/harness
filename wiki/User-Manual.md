# Manual de uso — Harness of AI

**Harness of AI** é um orquestrador de agentes de IA para VS Code: um único painel para **Copilot**, **Claude**, **Cursor**, **Devin** e **Kiro**, com contexto de arquivos compartilhado e desenvolvimento orientado a specs (SDD).

---

## 1. Instalação

1. Baixe `harness-vscode-0.1.0.vsix` em [Releases](https://github.com/nbsjunior/harness/releases).
2. No VS Code / Cursor: `Ctrl+Shift+P` → **Extensions: Install from VSIX...**
3. **Developer: Reload Window**
4. Clique no ícone **Harness of AI** na barra de atividades (rosto estilizado).

---

## 2. Primeira execução (Welcome)

Na primeira abertura da configuração, o assistente de boas-vindas apresenta os recursos principais:

![Tela de boas-vindas](images/manual/03-welcome.png)

| Recurso | Descrição |
|---------|-----------|
| Chat unificado | Copilot, Claude, Devin, Cursor e Kiro no mesmo painel |
| Contexto | Clique direito → **Add to Harness of AI Context** |
| Specs (SDD) | Skills, Tools e Workflows em `.harness/specs/` |
| MCP | Servidores externos de ferramentas |

Clique em **Get started →** para configurar os agentes ou **Skip** para configurar depois.

---

## 3. Chat e contexto

O painel **Chat** fica na barra lateral **Harness of AI**:

![Chat com arquivos em contexto](images/manual/04-chat-context.png)

### Contexto de arquivos

- **Explorer** ou editor → clique direito → **Add to Harness of AI Context**
- Os arquivos aparecem como chips acima do compositor
- O mesmo contexto vale para **qualquer** provedor na próxima mensagem

### Ações do chat

| Botão | Ação |
|-------|------|
| **+ New chat** | Nova conversa (mantém o contexto) |
| **Clear context** | Remove apenas os arquivos do contexto |
| Ícone na barra do painel | **Clear Chat & Context** — limpa tudo |
| Engrenagem | Abre **Harness of AI Configuration** |

### Provedores (pílulas na parte inferior)

- **Auto** — Harness of AI escolhe o agente (ex.: Copilot para perguntas rápidas, Claude para código complexo)
- **Copilot**, **Claude**, **Cursor**, **Devin**, **Kiro** — força um provedor

### Modos (Copilot)

| Modo | Uso |
|------|-----|
| **Ask** | Perguntas e respostas, sem ferramentas |
| **Agent** | Loop com leitura/escrita de arquivos |
| **Spec+Agent** | Como Agent, com specs ativas injetadas |

Digite no campo *Describe what to build or change...* e pressione Enter.

---

## 4. Configuração — aba Agents

`Ctrl+Shift+P` → **Harness of AI: Open Configuration** (ou engrenagem no Chat).

![Configuração — Agents](images/manual/01-chat-and-config-agents.png)

Configure cada agente com **Configure**:

| Agente | Quando usar |
|--------|-------------|
| **GitHub Copilot** | Revisão e geração de código via GitHub |
| **Claude Code** | Contexto longo e raciocínio complexo |
| **Devin** | Tarefas autônomas de engenharia |
| **Cursor AI** | Cloud Agents API (chave em cursor.com/dashboard) |
| **Kiro (AI-DLC)** | CLI Kiro + regras em `.kiro/steering/` |

Estado **Not configured** (laranja) = falta API key ou login. Use **Test Connection** após colar a chave.

---

## 5. Configuração — API Servers

![Configuração — API Servers](images/manual/02-config-api-servers.png)

- **Built-in agents** — endpoints padrão (Copilot, Devin, Cursor)
- **Custom API servers** — adicione servidores OpenAI-compatíveis com **+ Add API server**

---

## 6. Outras abas

| Aba | Função |
|-----|--------|
| **MCP** | Servidores Model Context Protocol (stdio ou HTTP) |
| **Workspace** | Pasta padrão do workspace, agente padrão, otimização de prompt |
| **Spending** | Tokens, requisições e tempo por provedor |

---

## 7. Comandos úteis

| Comando | Atalho via paleta |
|---------|-------------------|
| Initialize Workspace | Cria `.harness/` e specs de exemplo |
| Open Configuration | Painel de configuração |
| Clear Chat & Context | Limpa chat e contexto |
| Check getGoat | Diagnóstico de todos os agentes |
| Run Setup | Kiro CLI + AI-DLC |

Categoria na paleta: **Harness of AI**

---

## 8. Solução de problemas

| Problema | Solução |
|----------|---------|
| Agente errado no Auto | Configure só os agentes que usa; veja [Auto Routing](Auto-Routing) |
| Cursor travado | Modo **Ask** primeiro; teste chave com `node scripts/test-cursor.mjs` |
| Copilot sem token | `gh auth refresh --scopes copilot` |
| CLI não encontrado | Reinstale o `.vsix` da release oficial |

Mais detalhes: [Troubleshooting](Troubleshooting)

---

## Links

- [Getting Started](Getting-Started)
- [Chat Interface](Chat-Interface)
- [Configuration](Configuration)
- [Repositório](https://github.com/nbsjunior/harness)
