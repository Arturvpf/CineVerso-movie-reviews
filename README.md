# CineVerso

Sistema de avaliação de filmes desenvolvido para a atividade Rocket Lab 2026.2. O administrador gerencia o catálogo; cada pessoa tem suas próprias listas e pode publicar avaliações. A interface React consome uma API FastAPI; os dados ficam em SQLite.

## Funcionalidades

- Catálogo paginado, pesquisa por título, elenco, direção, roteiro ou produtora, filtros por gênero e nota mínima, e detalhes dos filmes.
- Detalhes com elenco, equipe, produtoras, notas TMDB/IMDb, popularidade, orçamento e receita quando disponíveis nos CSVs.
- Contas individuais com cadastro, login e logout; Favoritos e Watchlist separados por conta.
- Interface responsiva com tema claro e escuro, preferência do sistema e escolha salva no navegador.
- Aba de tendências com rankings por popularidade, quantidade de avaliações e média de notas.
- Cadastro, edição e exclusão de filmes, com confirmação antes da exclusão.
- Histórico paginado de avaliações, notas visuais de 1 a 5 estrelas em passos de meia estrela, edição e exclusão de avaliações e média calculada a partir das avaliações salvas.
- Links próprios para cada filme, com abertura direta por `/filmes/{movie_id}` e navegação pelo histórico do navegador.
- Rascunhos locais para cadastro e edição de filmes e avaliações, separados por conta e recuperados ao reabrir o formulário.
- Aba **Minhas reviews** com histórico paginado, edição e exclusão das avaliações da conta.
- Aba **Relatar problema** com acompanhamento do status e caixa **Problemas recebidos** para o administrador resolver ou reabrir relatos.
- Relatório de qualidade dos dados com contagens, percentuais, exemplos para revisão e download em JSON.
- Estados de carregamento, erro, lista vazia e filme não encontrado.
- Importação dos CSVs fornecidos pela atividade.

## Tecnologias e pré-requisitos

| Camada | Tecnologias | Necessário para executar |
|---|---|---|
| Frontend | React, TypeScript, Vite | Node.js 22.12 ou superior e npm |
| Backend | Python, FastAPI, SQLAlchemy, Alembic | Python 3.11 ou superior |
| Banco | SQLite | Incluído no Python; não requer servidor próprio |

Instale também o Git para clonar o repositório. Os comandos abaixo usam **Windows PowerShell**. Execute os comandos de backend dentro de `backend/`: o caminho padrão do banco é relativo a essa pasta.

## Clonar o projeto

```powershell
git clone https://github.com/Arturvpf/rocketlab-movie-reviews.git
cd rocketlab-movie-reviews
```

## Configurar e iniciar o backend

No primeiro terminal, a partir da raiz do projeto:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
Copy-Item .env.example .env
.\.venv\Scripts\python -m alembic upgrade head
```

O Alembic cria as tabelas antes de iniciar a aplicação. Sem a importação dos CSVs, o catálogo começa vazio e o administrador pode cadastrar filmes pela interface. O arquivo `backend/.env` define `DATABASE_URL` e `BACKEND_CORS_ORIGINS`; o padrão cria `backend/rocketlab.db` e permite o frontend em `http://localhost:5173`.

### Criar o administrador inicial

Depois de aplicar a migration, execute em `backend/`:

```powershell
.\.venv\Scripts\python -m app.auth.create_admin
```

Informe email, nome e senha de pelo menos 12 caracteres. A senha é lida sem aparecer no terminal. Esta conta administra filmes e acessa o relatório de qualidade. Contas criadas pela página de cadastro são contas comuns. Ao migrar uma instalação existente, o comando atribui ao primeiro administrador as entradas antigas de Favoritos e Watchlist; as avaliações importadas continuam sem proprietário e só o administrador pode editá-las ou excluí-las.

### Importar os dados iniciais

Obtenha com os materiais da atividade os arquivos **`bases-1.zip`** e **`bases-2.zip`**. Eles não estão no GitHub. Coloque ambos na pasta `Downloads` do seu usuário ou ajuste os caminhos no comando. Depois de aplicar a migration, execute em `backend/`:

```powershell
.\.venv\Scripts\python -m app.import_csv "$env:USERPROFILE\Downloads\bases-1.zip" "$env:USERPROFILE\Downloads\bases-2.zip"
```

O importador lê os dez CSVs diretamente dos ZIPs, sem extração. Aguarde a mensagem `Importação concluída e confirmada.`; a carga completa pode levar alguns minutos. Se preferir, passe os caminhos de dois diretórios com os CSVs extraídos. A carga ocorre em uma transação e verifica as chaves estrangeiras. Repetir o comando preserva registros existentes e edições locais, mas pode recriar dados do CSV que tenham sido excluídos depois da carga.

Os arquivos fornecidos nesta atividade contêm 95.645 filmes e 43.666 avaliações individuais. O banco local e os ZIPs não são versionados neste repositório. Evite alterar filmes pela API enquanto a importação estiver em andamento, pois a transação ocupa a escrita do SQLite.

Depois da importação, ou logo após a migration se você quiser começar com um catálogo vazio, inicie a API no mesmo terminal, ainda em `backend/`:

```powershell
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Configurar e iniciar o frontend

Em **outro terminal**, a partir da raiz do projeto:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env
npm run dev
```

`VITE_API_URL` em `frontend/.env` deve apontar para a URL raiz do backend, sem `/api/v1`; o valor padrão é `http://localhost:8000`. Se mudar a origem ou porta do frontend, atualize também `BACKEND_CORS_ORIGINS` em `backend/.env` e reinicie os servidores. A porta de desenvolvimento do Vite é 5173.

| Serviço | Endereço local |
|---|---|
| Frontend | <http://localhost:5173> |
| API | <http://localhost:8000> |
| Swagger/OpenAPI | <http://localhost:8000/docs> |
| Saúde da API | <http://localhost:8000/health> |

Entre com a conta de administrador criada no terminal ou crie uma conta comum na página. No catálogo, pesquise por título, ator, diretor, roteirista ou produtora e combine a busca com os filtros de gênero e nota mínima. Filmes sem avaliações não aparecem quando há filtro de nota. As abas **Favoritos** e **Watchlist** mostram as listas da conta conectada; os botões nos cards e nos detalhes adicionam ou removem filmes. A pesquisa, os filtros e a paginação também funcionam dentro de cada lista. Só o administrador pode usar **Cadastrar filme** e **Editar filme**; separe vários diretores ou gêneros por ponto e vírgula. Em **Ver detalhes**, você pode consultar o histórico paginado, publicar uma avaliação escolhendo estrelas inteiras ou meias estrelas e editar ou excluir suas avaliações. O administrador também pode gerenciar avaliações antigas e de outras contas. A exclusão de avaliações e filmes pede confirmação.

Cada filme tem um endereço `/filmes/{movie_id}` que pode ser copiado e aberto diretamente. O acesso à tela de detalhes ocorre após o login. Os formulários de filmes e avaliações guardam automaticamente os campos alterados no armazenamento local do navegador, por conta e por filme ou avaliação. Ao reabrir, use **Descartar rascunho** para voltar aos valores originais. O rascunho é apagado após salvar com sucesso; ele não é sincronizado entre dispositivos ou navegadores.

Em uma hospedagem estática, configure o servidor para entregar `index.html` também nas URLs `/filmes/*`, permitindo abrir links de filmes diretamente.

Em **Tendências**, escolha entre popularidade fornecida pela base, quantidade de avaliações cadastradas ou melhor média entre filmes com pelo menos cinco avaliações. São rankings calculados sobre os dados disponíveis, sem atualização em tempo real.

Em **Minhas reviews**, cada conta vê somente as avaliações que publicou no site. É possível editar, excluir ou abrir o filme correspondente. Avaliações importadas dos CSVs não pertencem a uma conta e não aparecem nessa aba.

Em **Meu perfil**, altere o nome de exibição da conta ou envie e remova uma foto PNG, JPEG ou WebP de até 2 MB. O nome e a foto aparecem no cabeçalho e o nome atualizado fica salvo para os próximos acessos. Cada conta pode manter uma avaliação ativa por filme; quem já avaliou pode editar ou excluir a avaliação em **Minhas reviews**. Após excluir, é possível publicar outra.

Em **Relatar problema**, escolha o tipo, descreva o ocorrido e, se for relacionado a um filme, cole o link dele. O relato aparece em **Meus relatos** com status aberto ou resolvido. O administrador recebe todos os relatos na aba **Problemas recebidos**, pode filtrar por status, resolver ou reabrir. Os relatos são armazenados no banco e aparecem na caixa de entrada do site; o sistema não envia emails.

Nos detalhes de cada filme, **Relatar problema deste filme** abre o mesmo formulário com o tipo e o link do filme preenchidos.

Para o administrador, **Qualidade dos dados** verifica títulos, pôsteres, sinopses, anos e durações ausentes; filmes sem gênero ou direção; divergência entre data e ano de lançamento; possíveis duplicatas pelo mesmo título e ano; e filmes sem avaliações. Cada indicador mostra até cinco exemplos que abrem os detalhes do filme. Use **Atualizar** para refazer a análise e **Baixar JSON** para guardar os resultados. Possíveis duplicatas exigem revisão manual; filmes sem avaliações indicam cobertura, não erro de cadastro. Em uma base grande, a análise pode levar alguns segundos.

## Banco de dados e avaliações

Os models SQLAlchemy preservam as dimensões, associações e métricas da base da atividade. O Alembic controla o schema; o importador apenas insere dados em tabelas já criadas. A API usa `sk_movie_id` como identificador dos filmes nas rotas.

A migration `0002_movie_titles` corrige aspas duplicadas em títulos já importados. Novas importações aplicam a mesma correção antes de gravar os filmes.

A migration `0003_movie_collections` cria a tabela `movie_collections`. A `0004_user_authentication` adiciona usuários, sessões e o vínculo das listas e novas avaliações à conta. Ela preserva as listas anteriores para atribuição ao administrador inicial.

A migration `0005_problem_reports` cria a tabela dos relatos enviados ao administrador. Aplique `alembic upgrade head` ao atualizar uma instalação existente.

A migration `0006_avatars_unique_reviews` adiciona fotos de perfil e garante uma avaliação ativa por conta e filme. Se houver avaliações repetidas anteriores, mantém a mais recente e preserva as demais em `archived_duplicate_reviews`. Faça backup do banco antes de atualizar.

A migration `0007_clean_imported_movie_data` remove aspas duplicadas de sinopses quando a estrutura é inequívoca e trata duração `0` dos filmes importados como informação ausente. A importação futura aplica o mesmo tratamento. Sinopses com aspas incompletas permanecem intactas e aparecem no relatório de qualidade para revisão.

Os vínculos `bridge_movie_person` e `bridge_movie_company` ligam os IDs dos CSVs às pessoas e produtoras exibidas nos detalhes. Elenco, roteiro, direção, produtoras, indicadores financeiros e notas TMDB/IMDb são dados da base original. O resumo de avaliações da base é mostrado separadamente das avaliações publicadas no site; as duas fontes não são somadas.

O CSV `movies_reviews.csv` alimenta a tabela `movie_reviews`. Os CSVs e o banco guardam notas na escala **0 a 10**. A API e o frontend exibem estrelas de **0 a 5**; novas avaliações aceitam notas de **1 a 5**, inclusive decimais. A conversão é feita pela API. Por isso, uma avaliação histórica pode aparecer com menos de 1 estrela, inclusive zero.

A média é calculada somente a partir das avaliações individuais armazenadas em `movie_reviews`. Sem avaliações, a API retorna quantidade `0` e média `null`; o resumo importado em `dim_reviews` não entra nesse cálculo.

Rotas principais, todas sob `/api/v1`:

| Método | Rota | Ação |
|---|---|---|
| POST | `/auth/register` | Criar conta comum e iniciar sessão |
| POST | `/auth/login` | Entrar na conta |
| GET | `/auth/me` | Consultar a conta conectada |
| PATCH | `/auth/me` | Alterar o nome de exibição da conta |
| PUT | `/auth/me/avatar` | Enviar foto de perfil em `multipart/form-data` |
| DELETE | `/auth/me/avatar` | Remover a foto de perfil |
| GET | `/auth/users/{user_id}/avatar` | Consultar a foto de uma conta |
| POST | `/auth/logout` | Encerrar a sessão |
| GET | `/movies` | Listar e paginar com `page`, `page_size`, `q`, `collection`, `genre` e `min_rating` |
| GET | `/movies/genres` | Listar gêneros disponíveis para o filtro |
| GET | `/movies/trending` | Consultar rankings com `sort=popular`, `most_reviewed` ou `top_rated` |
| GET | `/reviews/mine` | Listar avaliações da conta conectada, com filme e paginação |
| GET | `/movies/{movie_id}` | Consultar detalhes |
| POST | `/movies` | Cadastrar filme |
| PATCH | `/movies/{movie_id}` | Editar campos enviados |
| DELETE | `/movies/{movie_id}` | Excluir filme |
| PUT | `/movies/{movie_id}/collections/{collection}` | Adicionar aos Favoritos ou à Watchlist |
| DELETE | `/movies/{movie_id}/collections/{collection}` | Remover dos Favoritos ou da Watchlist |
| GET | `/movies/{movie_id}/reviews` | Listar avaliações paginadas, média geral e `my_review_id` da conta atual |
| POST | `/movies/{movie_id}/reviews` | Cadastrar uma avaliação por conta e filme |
| PATCH | `/movies/{movie_id}/reviews/{review_id}` | Editar campos enviados de uma avaliação |
| DELETE | `/movies/{movie_id}/reviews/{review_id}` | Excluir avaliação |
| GET | `/reports/data-quality` | Gerar o relatório de qualidade com indicadores e exemplos |
| POST | `/reports/problems` | Enviar um relato de problema |
| GET | `/reports/problems/mine` | Listar relatos da conta conectada |
| GET | `/reports/problems/inbox` | Caixa de entrada do administrador, com filtro por status |
| PATCH | `/reports/problems/{report_id}` | Resolver ou reabrir um relato (administrador) |

O Swagger em `/docs` mostra os campos, as validações e exemplos de resposta.

As operações de escrita autenticadas usam cookie de sessão e o cabeçalho `X-CSRF-Token`, com o valor do cookie `rocketlab_csrf`. O frontend envia ambos automaticamente. Clientes de API precisam manter os cookies recebidos no login e enviar esse cabeçalho em POST, PUT, PATCH e DELETE. O catálogo e as avaliações podem ser lidos sem login; as listas pessoais exigem uma conta.

## Estrutura do projeto

```text
.
├── backend/
│   ├── app/                  # API, regras de negócio, models e importador
│   ├── migrations/           # revisões Alembic
│   ├── tests/                # testes do backend e da importação
│   └── pyproject.toml
├── frontend/
│   ├── src/components/       # catálogo, formulários e detalhes
│   ├── src/services/         # chamadas HTTP para a API
│   ├── src/types/            # contratos TypeScript
│   └── package.json
└── README.md
```

## Verificações de desenvolvimento

Em `backend/`, após instalar as dependências com `.[dev]`:

```powershell
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python -m ruff check .
```

Em `frontend/`:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
```

O build do frontend é gerado em `frontend/dist/`.
