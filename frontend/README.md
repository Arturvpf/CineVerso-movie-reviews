# Frontend — CineVerso

Base em Vite, React e TypeScript. Instruções de execução no [README principal](../README.md).

- `src/types/movie.ts`: contratos da API, incluindo valores nulos e notas em estrelas.
- `src/services/http.ts`: URL, requisições, cancelamento, timeout e erros HTTP.
- `src/services/movies.ts`: operações de filmes e avaliações.
- `src/App.tsx`: estrutura visual da aplicação.
- `src/components/Catalog.tsx`: catálogo, busca, paginação e cartões com dados reais.
- `src/components/MovieEditor.tsx`: modal e carregamento do filme para edição.
- `src/components/MovieForm.tsx`: formulário compartilhado de cadastro e edição parcial.
- `src/components/MovieDetails.tsx`: detalhes, histórico, média, cadastro de avaliações, edição e confirmação de exclusão.

Comandos: `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm run test` e `npm run test:e2e`.

Os testes de componentes usam Vitest e React Testing Library. Os testes E2E usam Playwright/Chromium com API e banco temporário reais; consulte os pré-requisitos e as portas no README principal.
