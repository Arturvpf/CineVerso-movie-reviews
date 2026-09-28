# Rocket Lab Movie Reviews

Sistema de avaliação de filmes desenvolvido para a atividade Rocket Lab 2026.2. O administrador gerencia um catálogo de filmes e registra notas e resenhas. A interface React consome uma API FastAPI; os dados ficam em SQLite.

## Funcionalidades

- Catálogo paginado, pesquisa por título e detalhes dos filmes.
- Cadastro, edição e exclusão de filmes, com confirmação antes da exclusão.
- Histórico de avaliações, cadastro de notas de 1 a 5 estrelas com comentário e média calculada a partir das avaliações salvas.
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

O Alembic cria as tabelas antes de iniciar a aplicação. Sem a importação dos CSVs, o catálogo começa vazio e você pode cadastrar filmes pela interface. O arquivo `backend/.env` define `DATABASE_URL` e `BACKEND_CORS_ORIGINS`; o padrão cria `backend/rocketlab.db` e permite o frontend em `http://localhost:5173`.

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

No catálogo, use a pesquisa e a paginação para localizar filmes. **Cadastrar filme** e **Editar filme** abrem o formulário; separe vários diretores ou gêneros por ponto e vírgula. Em **Ver detalhes**, você pode consultar o histórico, publicar uma avaliação e editar ou excluir o filme. A exclusão pede confirmação.

## Banco de dados e avaliações

Os models SQLAlchemy preservam as dimensões, associações e métricas da base da atividade. O Alembic controla o schema; o importador apenas insere dados em tabelas já criadas. A API usa `sk_movie_id` como identificador dos filmes nas rotas.

A migration `0002_movie_titles` corrige aspas duplicadas em títulos já importados. Novas importações aplicam a mesma correção antes de gravar os filmes.

O CSV `movies_reviews.csv` alimenta a tabela `movie_reviews`. Os CSVs e o banco guardam notas na escala **0 a 10**. A API e o frontend exibem estrelas de **0 a 5**; novas avaliações aceitam notas de **1 a 5**, inclusive decimais. A conversão é feita pela API. Por isso, uma avaliação histórica pode aparecer com menos de 1 estrela, inclusive zero.

A média é calculada somente a partir das avaliações individuais armazenadas em `movie_reviews`. Sem avaliações, a API retorna quantidade `0` e média `null`; o resumo importado em `dim_reviews` não entra nesse cálculo.

Rotas principais, todas sob `/api/v1`:

| Método | Rota | Ação |
|---|---|---|
| GET | `/movies` | Listar, paginar e pesquisar com `page`, `page_size` e `q` |
| GET | `/movies/{movie_id}` | Consultar detalhes |
| POST | `/movies` | Cadastrar filme |
| PATCH | `/movies/{movie_id}` | Editar campos enviados |
| DELETE | `/movies/{movie_id}` | Excluir filme |
| GET | `/movies/{movie_id}/reviews` | Listar avaliações e média |
| POST | `/movies/{movie_id}/reviews` | Cadastrar avaliação |

O Swagger em `/docs` mostra os campos, as validações e exemplos de resposta.

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
npm run build
```

O build do frontend é gerado em `frontend/dist/`.
