from collections.abc import AsyncIterator, Iterator

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.db.session import enable_sqlite_foreign_keys, get_db
from app.main import create_app
from app.movies.models import DimGenre, DimMovie, DimPerson
from app.movies.service import get_movie

PAYLOAD = {
    "titulo": "Interestelar",
    "ano_lancamento": 2014,
    "sinopse": "Uma equipe viaja pelo espaço em busca de um novo lar.",
    "generos": ["Ficção científica", "Drama"],
    "diretores": ["Christopher Nolan"],
    "duracao_minutos": 169,
}


@pytest.fixture
def database_url(tmp_path, monkeypatch) -> Iterator[str]:
    url = f"sqlite+aiosqlite:///{(tmp_path / 'movies.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    command.upgrade(Config("alembic.ini"), "head")
    command.check(Config("alembic.ini"))
    yield url
    get_settings.cache_clear()


@pytest.fixture
async def database(database_url):
    engine = create_async_engine(database_url)
    enable_sqlite_foreign_keys(engine)
    sessions = async_sessionmaker(engine, expire_on_commit=False, autoflush=False)
    yield sessions
    await engine.dispose()


@pytest.fixture
async def client(database) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()

    async def override_db():
        async with database() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client


async def test_create_read_and_partial_update(client):
    response = await client.post("/api/v1/movies", json=PAYLOAD)
    assert response.status_code == 201
    created = response.json()
    movie_id = created["sk_movie_id"]
    assert len(movie_id) == 64
    assert created["id_filme"]
    assert created["generos"] == ["Drama", "Ficção científica"]
    assert created["diretores"] == PAYLOAD["diretores"]

    response = await client.get(f"/api/v1/movies/{movie_id}")
    assert response.status_code == 200
    assert response.json() == created

    changes = {"titulo": "  Interestelar — edição especial  ", "duracao_minutos": None}
    response = await client.patch(f"/api/v1/movies/{movie_id}", json=changes)
    assert response.status_code == 200
    expected = {**created, "titulo": changes["titulo"].strip(), "duracao_minutos": None}
    assert response.json() == expected
    assert (await client.get(f"/api/v1/movies/{movie_id}")).json() == expected
    assert (await client.patch(f"/api/v1/movies/{movie_id}", json={})).json() == expected


async def test_relationship_reuse_and_edit_preserves_other_people(client, database):
    first = (await client.post("/api/v1/movies", json=PAYLOAD)).json()
    second = (
        await client.post(
            "/api/v1/movies",
            json={**PAYLOAD, "generos": ["Drama", "Drama"], "diretores": ["Novo diretor"]},
        )
    ).json()
    async with database() as db:
        actor = DimPerson(nome_pessoa="Ator de teste", tipo_pessoa="Ator")
        writer = DimPerson(nome_pessoa="Roteirista de teste", tipo_pessoa="Roteirista")
        movie = await get_movie(db, first["sk_movie_id"])
        movie.people.extend([actor, writer])
        await db.commit()

    response = await client.patch(
        f"/api/v1/movies/{first['sk_movie_id']}",
        json={"diretores": ["Novo diretor", "Novo diretor"], "generos": ["Drama"]},
    )
    assert response.status_code == 200
    assert response.json()["diretores"] == ["Novo diretor"]
    assert response.json()["generos"] == ["Drama"]
    assert (await client.get(f"/api/v1/movies/{second['sk_movie_id']}")).json() == second
    async with database() as db:
        movie = await get_movie(db, first["sk_movie_id"])
        assert {person.tipo_pessoa for person in movie.people} == {"Ator", "Diretor", "Roteirista"}
        assert await db.scalar(select(func.count()).select_from(DimGenre)) == 2
        assert await db.scalar(select(func.count()).select_from(DimPerson)) == 4


@pytest.mark.parametrize(
    "changes",
    [
        {"titulo": " "},
        {"titulo": "x" * 501},
        {"sinopse": ""},
        {"ano_lancamento": 0},
        {"ano_lancamento": True},
        {"ano_lancamento": 2014.5},
        {"generos": []},
        {"generos": [" "]},
        {"diretores": []},
        {"diretores": ["x" * 256]},
        {"duracao_minutos": -1},
        {"data_lancamento": "2025-02-30"},
        {"url_poster": "javascript:alert(1)"},
        {"campo_desconhecido": "valor"},
        {"sk_movie_id": "outro-id"},
        *[
            {field: None}
            for field in ("titulo", "sinopse", "ano_lancamento", "generos", "diretores")
        ],
    ],
)
async def test_invalid_create_and_patch_do_not_change_data(client, database, changes):
    created = (await client.post("/api/v1/movies", json=PAYLOAD)).json()
    response = await client.post("/api/v1/movies", json={**PAYLOAD, **changes})
    assert response.status_code == 422
    response = await client.patch(f"/api/v1/movies/{created['sk_movie_id']}", json=changes)
    assert response.status_code == 422
    assert (await client.get(f"/api/v1/movies/{created['sk_movie_id']}")).json() == created
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(DimMovie)) == 1


async def test_required_fields_and_missing_movie(client):
    assert (await client.post("/api/v1/movies", json={})).status_code == 422
    assert (await client.get("/api/v1/movies/inexistente")).status_code == 404
    response = await client.patch("/api/v1/movies/inexistente", json={"titulo": "Outro"})
    assert response.status_code == 404


async def test_optional_fields_and_urls(client):
    payload = {
        **PAYLOAD,
        "data_lancamento": "2014-11-06",
        "status_filme": "Lançado",
        "url_poster": "https://example.com/poster.jpg",
        "url_backdrop": "https://example.com/backdrop.jpg",
    }
    response = await client.post("/api/v1/movies", json=payload)
    assert response.status_code == 201
    created = response.json()
    for field in ("data_lancamento", "status_filme", "url_poster", "url_backdrop"):
        assert created[field] == payload[field]
    assert (await client.get(f"/api/v1/movies/{created['sk_movie_id']}")).json() == created


async def test_empty_catalog(client):
    response = await client.get("/api/v1/movies")
    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "total": 0,
        "page": 1,
        "page_size": 20,
        "total_pages": 0,
    }


async def test_catalog_pagination_and_relationships(client):
    created = []
    for title in ("Zodíaco", "Avatar", "Avatar", "Interestelar", "Duna"):
        response = await client.post("/api/v1/movies", json={**PAYLOAD, "titulo": title})
        assert response.status_code == 201
        created.append(response.json())
    expected = sorted(created, key=lambda movie: (movie["titulo"], movie["sk_movie_id"]))
    all_items = []
    for page in range(1, 4):
        response = await client.get("/api/v1/movies", params={"page": page, "page_size": 2})
        assert response.status_code == 200
        result = response.json()
        assert result["page"] == page
        assert result["page_size"] == 2
        assert result["total"] == 5
        assert result["total_pages"] == 3
        assert result["items"] == expected[(page - 1) * 2 : page * 2]
        all_items.extend(result["items"])
    assert all_items == expected
    beyond = (await client.get("/api/v1/movies", params={"page": 4, "page_size": 2})).json()
    assert beyond["items"] == []
    assert beyond["total"] == 5
    assert beyond["total_pages"] == 3


async def test_title_search_filters_before_pagination(client):
    for title in ("Star Wars", "Star Trek", "Interestelar"):
        assert (
            await client.post("/api/v1/movies", json={**PAYLOAD, "titulo": title})
        ).status_code == 201
    for page, expected_title in ((1, "Star Trek"), (2, "Star Wars")):
        response = await client.get(
            "/api/v1/movies", params={"q": "  sTaR  ", "page": page, "page_size": 1}
        )
        assert response.status_code == 200
        result = response.json()
        assert result["total"] == 2
        assert result["total_pages"] == 2
        assert [movie["titulo"] for movie in result["items"]] == [expected_title]
    assert (await client.get("/api/v1/movies", params={"q": "inexistente"})).json()["total"] == 0
    assert (await client.get("/api/v1/movies", params={"q": "  "})).json()["total"] == 3


@pytest.mark.parametrize("term", ["%", "_", "/", "' OR 1=1 --"])
async def test_search_treats_special_characters_as_literal_text(client, term):
    title = f"Filme {term} especial"
    for name in (title, "Outro filme"):
        assert (
            await client.post("/api/v1/movies", json={**PAYLOAD, "titulo": name})
        ).status_code == 201
    response = await client.get("/api/v1/movies", params={"q": term})
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["titulo"] == title


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page": -1},
        {"page": "abc"},
        {"page_size": 0},
        {"page_size": 101},
        {"page_size": "1.5"},
        {"q": "x" * 501},
    ],
)
async def test_invalid_catalog_parameters(client, params):
    assert (await client.get("/api/v1/movies", params=params)).status_code == 422
