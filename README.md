# RocketLab 2026.2 — repositório base

Base inicial para evoluir a atividade do RocketLab 2026.2. Ela preserva a organização do backend,
o modelo relacional do catálogo de filmes em SQLAlchemy 2.0 e o histórico de
migrações com Alembic, sem incluir interface, dados CSV, endpoints de negócio
ou rotinas de carga.

> **Nota:** `RocketLab` é apenas o nome de referência desta base. O diretório,
> nome do pacote, título da API e arquivo do banco podem ser renomeados para o
> que preferirem; eles não representam uma exigência da
> estrutura-base.

## Estrutura

```text
.
├── backend/
│   ├── app/
│   │   ├── api/v1/        # ponto de composição dos futuros routers
│   │   ├── core/          # configurações e logging
│   │   ├── db/            # Base ORM, engine e sessões
│   │   └── movies/        # modelos SQLAlchemy do domínio de filmes
│   ├── migrations/        # ambiente e revisões Alembic
│   └── tests/
└── README.md
```

## Execução

Requer Python 3.11 ou superior.

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
cp .env.example .env
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload
```

A API mínima ficará disponível em `http://localhost:8000`; use
`http://localhost:8000/docs` para a documentação automática. O endpoint
`GET /health` permite conferir se a aplicação iniciou corretamente.

## Banco de dados e migrações

O modelo usa um esquema estrela para o catálogo de filmes:

- dimensões de filmes, gêneros, pessoas, produtoras e resumo de avaliações;
- fato de desempenho financeiro e de engajamento;
- tabelas de associação N:N entre filmes, gêneros, produtoras e pessoas;

O schema corresponde aos nove arquivos CSV atuais da camada Diamond, com a
adição de `movie_reviews`: uma avaliação individual por linha, na escala 0–10.
A tabela aceita diretamente as colunas `sk_movie_review_id`, `sk_movie_id`,
`nome`, `nota` e `comentario` do CSV enviado separadamente. `created_at` é
gerado pelo banco. O contexto generativo não faz parte desta base.

O repositório não inclui CSVs nem rotinas de carga. Para usar avaliações,
importe primeiro os filmes em `dim_movies` e depois o CSV de `movie_reviews`.

As tabelas são criadas exclusivamente pelo Alembic. Para evoluir os modelos,
crie uma revisão e aplique-a:

```bash
cd backend
.venv/bin/alembic revision --autogenerate -m "descreva a alteração"
.venv/bin/alembic upgrade head
```

O banco padrão é SQLite local em `backend/rocketlab.db`. Ajuste
`DATABASE_URL` no arquivo `.env` para usar outro banco compatível.

## Avaliações na API

- `POST /api/v1/movies/{movie_id}/reviews`: cadastra uma avaliação e retorna `201`.
- `GET /api/v1/movies/{movie_id}/reviews`: retorna `items`, `total` e
  `media_avaliacoes`, com as avaliações mais recentes primeiro.
- O catálogo e os detalhes do filme também retornam `total_avaliacoes` e
  `media_avaliacoes`. Sem avaliações, a quantidade é `0` e a média é `null`.

Exemplo do corpo de cadastro:

```json
{
  "nome": "Artur",
  "nota": 4.5,
  "comentario": "Gostei do filme."
}
```

Na API, novas notas devem estar entre **1 e 5 estrelas**, admitindo decimais.
Nome e comentário são obrigatórios. O banco e os CSVs usam a escala **0–10**:
a API multiplica a nota por dois ao gravar e divide por dois ao consultar.
Assim, notas históricas abaixo de 2 aparecem com menos de 1 estrela, incluindo
zero, sem alterar os dados originais. A média usa somente as avaliações
individuais de `movie_reviews`, sem misturar o resumo importado de `dim_reviews`.
Nenhuma coluna de média é criada ou atualizada.

Filmes inexistentes retornam `404`; entradas inválidas retornam `422`;
conflitos de integridade no cadastro retornam `409` com rollback da operação.
