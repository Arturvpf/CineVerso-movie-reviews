# RocketLab 2026.2 — repositório base

Backend do sistema de avaliação de filmes, desenvolvido sobre a base do RocketLab 2026.2.
Preserva o modelo relacional em SQLAlchemy e as migrations Alembic, com cadastro,
consulta, edição, exclusão, pesquisa, paginação, avaliações e importação dos CSVs.
O frontend será implementado na próxima etapa. Os CSVs são fornecidos separadamente.

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

O repositório não inclui os CSVs. Use a rotina abaixo para importar os dois ZIPs
fornecidos pela atividade na ordem correta dos relacionamentos.

As tabelas são criadas exclusivamente pelo Alembic. Para evoluir os modelos,
crie uma revisão e aplique-a:

```bash
cd backend
.venv/bin/alembic revision --autogenerate -m "descreva a alteração"
.venv/bin/alembic upgrade head
```

O banco padrão é SQLite local em `backend/rocketlab.db`. Ajuste
`DATABASE_URL` no arquivo `.env` para usar outro banco compatível.

## Importação dos CSVs (SQLite)

Com o ambiente virtual e as dependências instalados, execute no PowerShell,
a partir da raiz do projeto. Os exemplos consideram os ZIPs na pasta Downloads:

```powershell
cd backend
.\.venv\Scripts\python -m alembic upgrade head
.\.venv\Scripts\python -m app.import_csv "$env:USERPROFILE\Downloads\bases-1.zip" "$env:USERPROFILE\Downloads\bases-2.zip"
```

Os caminhos são argumentos: ajuste-os para onde os arquivos estiverem.
Também é possível informar diretórios com os CSVs extraídos:

```powershell
.\.venv\Scripts\python -m app.import_csv .\dados\bases_atv_dev1 .\dados\bases_atv_dev_2
```

A rotina requer os dez CSVs dos dois pacotes, usa `DATABASE_URL` e não cria
tabelas; aplique as migrations primeiro. Ela lê os ZIPs sem extraí-los,
converte datas, números e campos opcionais vazios, preserva as notas originais
de 0 a 10 e importa `movies_reviews.csv` na tabela `movie_reviews`.

A carga é feita em lotes dentro de uma única transação. Se ocorrer erro, nenhuma
alteração da carga é salva. Ao final, as chaves estrangeiras são verificadas.
Os totais impressos durante a execução só são confirmados na mensagem final.
Evite editar dados pela API enquanto a carga está em andamento: a importação
mantém o bloqueio de escrita do SQLite até terminar.

É possível repetir o comando: registros existentes são preservados, inclusive
edições locais. Gêneros e produtoras com o mesmo nome, pessoas com o mesmo nome
e papel e filmes com o mesmo `id_filme` são reaproveitados, ajustando os vínculos
para seus IDs locais. A rotina não sobrescreve registros nem sincroniza exclusões;
reexecutá-la pode recriar registros do CSV que tenham sido excluídos localmente.
`created_at` das avaliações recebe a data da importação, pois não consta nos CSVs.

Os dados oficiais contêm 95.645 filmes e 43.666 avaliações individuais.
O banco local e eventuais cópias com extensão `.db` são ignorados pelo Git.

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
