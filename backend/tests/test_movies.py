from collections.abc import AsyncIterator, Iterator
from datetime import date

import httpx
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth.service import create_admin
from app.core.config import get_settings
from app.db.session import enable_sqlite_foreign_keys, get_db
from app.main import create_app
from app.movies.models import (
    DimCompany,
    DimGenre,
    DimMovie,
    DimPerson,
    DimReview,
    FactMoviePerformance,
    MovieCollection,
    MovieReview,
    bridge_movie_company,
    bridge_movie_genre,
    bridge_movie_person,
)
from app.movies.service import get_movie


async def test_accounts_isolate_collections_and_review_permissions(client, user_client):
    movie = (await client.post("/api/v1/movies", json=PAYLOAD)).json()
    path = f"/api/v1/movies/{movie['sk_movie_id']}"

    assert (await client.put(path + "/collections/favorites")).status_code == 200
    assert (await user_client.get(path)).json()["is_favorite"] is False
    assert (await user_client.get("/api/v1/movies?collection=favorites")).json()["total"] == 0
    assert (await user_client.put(path + "/collections/watchlist")).status_code == 200
    assert (await client.get(path)).json()["in_watchlist"] is False

    review = (await user_client.post(path + "/reviews", json={
        "nome": "Leitora", "nota": 4, "comentario": "Gostei bastante.",
    })).json()
    assert review["user_id"] == (await user_client.get("/api/v1/auth/me")).json()["id"]
    assert (await user_client.patch(path + "/reviews/other", json={"nota": 5})).status_code == 404
    assert (await user_client.patch(path, json={"titulo": "Alterado"})).status_code == 403
    assert (await user_client.get("/api/v1/reports/data-quality")).status_code == 403
    assert (await client.patch(
        path + f"/reviews/{review['sk_movie_review_id']}", json={"nota": 3}
    )).status_code == 200

    second_user = await user_client.post("/api/v1/auth/register", json={
        "email": "second@example.com", "display_name": "Segunda pessoa",
        "password": "senha-segura-segunda",
    })
    assert second_user.status_code == 201
    user_client.headers["X-CSRF-Token"] = user_client.cookies["rocketlab_csrf"]
    assert (await user_client.patch(
        path + f"/reviews/{review['sk_movie_review_id']}", json={"nota": 2}
    )).status_code == 403
    assert (await user_client.delete(
        path + f"/reviews/{review['sk_movie_review_id']}"
    )).status_code == 403

    user_client.headers.pop("X-CSRF-Token")
    assert (await user_client.put(path + "/collections/favorites")).status_code == 403
    user_client.headers["X-CSRF-Token"] = user_client.cookies["rocketlab_csrf"]
    assert (await user_client.post("/api/v1/auth/logout")).status_code == 204
    assert (await user_client.get("/api/v1/auth/me")).status_code == 401


async def test_one_review_per_account_and_movie(client, user_client):
    movie_id = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    path = f"/api/v1/movies/{movie_id}/reviews"
    first = await user_client.post(path, json=REVIEW_PAYLOAD)
    assert first.status_code == 201
    assert (await user_client.post(path, json=REVIEW_PAYLOAD)).status_code == 409
    listed = (await user_client.get(path)).json()
    assert listed["total"] == 1
    assert listed["my_review_id"] == first.json()["sk_movie_review_id"]
    assert (await client.get(path)).json()["my_review_id"] is None
    assert (await client.post(path, json=REVIEW_PAYLOAD)).status_code == 201
    assert (await user_client.delete(path + "/" + listed["my_review_id"])).status_code == 204
    assert (await user_client.post(path, json=REVIEW_PAYLOAD)).status_code == 201


async def test_profile_photo_upload_and_remove(user_client, client):
    user = (await user_client.get("/api/v1/auth/me")).json()
    path = f"/api/v1/auth/users/{user['id']}/avatar"
    assert (await client.get(path)).status_code == 404
    csrf = user_client.headers.pop("X-CSRF-Token")
    assert (await user_client.put("/api/v1/auth/me/avatar", files={
        "file": ("photo.png", b"\x89PNG\r\n\x1a\nmore", "image/png"),
    })).status_code == 403
    user_client.headers["X-CSRF-Token"] = csrf
    assert (await user_client.put("/api/v1/auth/me/avatar", files={
        "file": ("bad.svg", b"<svg></svg>", "image/svg+xml"),
    })).status_code == 422
    image = b"\x89PNG\r\n\x1a\nphoto"
    uploaded = await user_client.put("/api/v1/auth/me/avatar", files={
        "file": ("photo.png", image, "image/png"),
    })
    assert uploaded.status_code == 200
    assert uploaded.json()["avatar_url"].startswith(path)
    fetched = await client.get(path)
    assert fetched.status_code == 200
    assert fetched.content == image
    assert fetched.headers["content-type"] == "image/png"
    assert (await user_client.delete("/api/v1/auth/me/avatar")).json()["avatar_url"] is None
    assert (await client.get(path)).status_code == 404


async def test_registration_cannot_create_admin_and_trends_are_ranked(
    client, user_client, database
):
    duplicate = await user_client.post("/api/v1/auth/register", json={
        "email": "user@example.com", "display_name": "Outra",
        "password": "senha-segura-de-outra",
    })
    assert duplicate.status_code == 409
    unauthorized = await user_client.post("/api/v1/auth/register", json={
        "email": "another@example.com", "display_name": "Outra",
        "password": "senha-segura-de-outra", "role": "admin",
    })
    assert unauthorized.status_code == 422

    first = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    second = (await client.post("/api/v1/movies", json={
        **PAYLOAD, "titulo": "Outro filme",
    })).json()["sk_movie_id"]
    async with database() as db:
        db.add(FactMoviePerformance(sk_movie_id=first, popularidade=5))
        db.add(FactMoviePerformance(sk_movie_id=second, popularidade=25))
        await db.commit()
    popular = (await user_client.get("/api/v1/movies/trending?sort=popular")).json()
    assert [movie["sk_movie_id"] for movie in popular["items"]] == [second, first]
    for index in range(5):
        if index:
            registered = await client.post("/api/v1/auth/register", json={
                "email": f"trend{index}@example.com",
                "display_name": f"Trend {index}",
                "password": "a-strong-password-123",
            })
            assert registered.status_code == 201
            client.headers["X-CSRF-Token"] = client.cookies["rocketlab_csrf"]
        response = await client.post(f"/api/v1/movies/{first}/reviews", json={
            "nome": f"Pessoa {index}", "nota": 4, "comentario": "Vale assistir.",
        })
        assert response.status_code == 201
    assert (await client.post(f"/api/v1/movies/{second}/reviews", json={
        "nome": "Pessoa", "nota": 5, "comentario": "Excelente.",
    })).status_code == 201
    most_reviewed = (await user_client.get(
        "/api/v1/movies/trending?sort=most_reviewed"
    )).json()
    assert most_reviewed["items"][0]["sk_movie_id"] == first
    top_rated = (await user_client.get("/api/v1/movies/trending?sort=top_rated")).json()
    assert [movie["sk_movie_id"] for movie in top_rated["items"]] == [first]
    assert (await user_client.get("/api/v1/movies/trending?sort=wrong")).status_code == 422


async def test_my_reviews_are_scoped_to_the_current_account(client, user_client):
    movie_id = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    path = f"/api/v1/movies/{movie_id}/reviews"
    assert (await client.post(path, json={
        "nome": "Administrador", "nota": 5, "comentario": "Ótimo filme.",
    })).status_code == 201
    own = (await user_client.post(path, json={
        "nome": "Leitora", "nota": 4, "comentario": "Gostei do filme.",
    })).json()

    response = await user_client.get("/api/v1/reviews/mine")
    assert response.status_code == 200
    page = response.json()
    assert page["total"] == 1
    assert page["items"][0]["sk_movie_review_id"] == own["sk_movie_review_id"]
    assert page["items"][0]["movie_title"] == PAYLOAD["titulo"]
    assert page["items"][0]["nota"] == 4
    assert (await client.get("/api/v1/reviews/mine")).json()["total"] == 1

    assert (await user_client.patch(
        f"{path}/{own['sk_movie_review_id']}", json={"nota": 3}
    )).status_code == 200
    assert (await user_client.get("/api/v1/reviews/mine")).json()["items"][0]["nota"] == 3
    assert (await user_client.delete(f"{path}/{own['sk_movie_review_id']}")).status_code == 204
    assert (await user_client.get("/api/v1/reviews/mine")).json()["total"] == 0


async def test_problem_report_reaches_admin_inbox_and_status_returns_to_user(client, user_client):
    movie_id = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    payload = {
        "category": "movie", "subject": "Pôster incorreto",
        "description": "A imagem exibida pertence a outro filme.", "movie_id": movie_id,
    }
    response = await user_client.post("/api/v1/reports/problems", json=payload)
    assert response.status_code == 201
    report = response.json()
    assert report["status"] == "open"
    assert report["movie_title"] == PAYLOAD["titulo"]
    assert report["reporter_email"] == "user@example.com"
    assert (await user_client.get("/api/v1/reports/problems/mine")).json()["total"] == 1
    assert (await user_client.get("/api/v1/reports/problems/inbox")).status_code == 403
    assert (await user_client.patch(
        f"/api/v1/reports/problems/{report['id']}", json={"status": "resolved"}
    )).status_code == 403

    inbox = (await client.get("/api/v1/reports/problems/inbox?status=open")).json()
    assert inbox["total"] == 1
    assert inbox["items"][0]["id"] == report["id"]
    updated = await client.patch(
        f"/api/v1/reports/problems/{report['id']}", json={"status": "resolved"}
    )
    assert updated.status_code == 200
    assert updated.json()["resolved_at"] is not None
    assert (await client.get("/api/v1/reports/problems/inbox?status=open")).json()["total"] == 0
    assert (await user_client.get("/api/v1/reports/problems/mine")).json()["items"][0][
        "status"
    ] == "resolved"
    assert (await user_client.post("/api/v1/reports/problems", json={
        **payload, "movie_id": "inexistente",
    })).status_code == 404

    other = await user_client.post("/api/v1/auth/register", json={
        "email": "other@example.com", "display_name": "Outra pessoa",
        "password": "senha-segura-de-outra",
    })
    assert other.status_code == 201
    assert (await user_client.get("/api/v1/reports/problems/mine")).json()["total"] == 0

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
        async with database() as session:
            await create_admin(
                session, "admin@example.com", "Administrador", "senha-de-teste-segura"
            )
        login = await client.post("/api/v1/auth/login", json={
            "email": "admin@example.com", "password": "senha-de-teste-segura",
        })
        assert login.status_code == 200
        client.headers["X-CSRF-Token"] = client.cookies["rocketlab_csrf"]
        yield client


@pytest.fixture
async def user_client(database) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()

    async def override_db():
        async with database() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as ordinary:
        registered = await ordinary.post("/api/v1/auth/register", json={
            "email": "user@example.com", "display_name": "Leitora",
            "password": "senha-segura-da-leitora",
        })
        assert registered.status_code == 201
        ordinary.headers["X-CSRF-Token"] = ordinary.cookies["rocketlab_csrf"]
        yield ordinary


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


async def test_delete_movie_removes_it_from_detail_and_catalog(client):
    created = (await client.post("/api/v1/movies", json=PAYLOAD)).json()
    path = f"/api/v1/movies/{created['sk_movie_id']}"
    response = await client.delete(path)
    assert response.status_code == 204
    assert response.content == b""
    assert (await client.get(path)).status_code == 404
    assert (await client.patch(path, json={"titulo": "Outro"})).status_code == 404
    assert (await client.delete(path)).status_code == 404
    catalog = (await client.get("/api/v1/movies")).json()
    assert catalog["items"] == []
    assert catalog["total"] == 0


async def test_delete_missing_movie(client):
    response = await client.delete("/api/v1/movies/inexistente")
    assert response.status_code == 404
    assert response.json()["detail"] == "Filme não encontrado."


async def test_delete_cascades_dependencies_and_preserves_shared_records(client, database):
    first = (await client.post("/api/v1/movies", json=PAYLOAD)).json()
    second = (await client.post("/api/v1/movies", json=PAYLOAD)).json()
    movie_ids = [first["sk_movie_id"], second["sk_movie_id"]]
    async with database() as db:
        company = DimCompany(nome_produtora="Produtora compartilhada")
        db.add(company)
        await db.flush()
        for movie_id in movie_ids:
            await db.execute(
                bridge_movie_company.insert().values(
                    sk_movie_id=movie_id, sk_company_id=company.sk_company_id
                )
            )
            db.add_all(
                [
                    MovieReview(
                        sk_movie_id=movie_id, nome="Pessoa", nota=8, comentario="Bom filme"
                    ),
                    DimReview(
                        sk_movie_id=movie_id, qtd_avaliacoes_usuarios=1, nota_media_usuarios=8
                    ),
                    FactMoviePerformance(sk_movie_id=movie_id),
                ]
            )
        await db.commit()

    assert (await client.delete(f"/api/v1/movies/{movie_ids[0]}")).status_code == 204
    assert (await client.get(f"/api/v1/movies/{movie_ids[1]}")).json() == {
        **second,
        "total_avaliacoes": 1,
        "media_avaliacoes": 4.0,
    }
    async with database() as db:
        for table in (
            MovieReview.__table__,
            DimReview.__table__,
            FactMoviePerformance.__table__,
            bridge_movie_company,
            bridge_movie_genre,
            bridge_movie_person,
        ):
            remaining = (await db.scalars(select(table.c.sk_movie_id))).all()
            assert remaining
            assert set(remaining) == {movie_ids[1]}
        assert await db.scalar(select(func.count()).select_from(DimCompany)) == 1
        assert await db.scalar(select(func.count()).select_from(DimGenre)) == 2
        assert await db.scalar(select(func.count()).select_from(DimPerson)) == 1
        assert (await db.execute(text("PRAGMA foreign_key_check"))).all() == []


async def test_delete_integrity_conflict_rolls_back_relationship_changes(client, database):
    created = (await client.post("/api/v1/movies", json=PAYLOAD)).json()
    # Simula uma restrição do banco depois da remoção dos vínculos pelo ORM.
    async with database() as db:
        await db.execute(
            text(
                "CREATE TRIGGER prevent_movie_delete BEFORE DELETE ON dim_movies "
                "BEGIN SELECT RAISE(ABORT, 'delete blocked'); END"
            )
        )
        await db.commit()
    path = f"/api/v1/movies/{created['sk_movie_id']}"
    response = await client.delete(path)
    assert response.status_code == 409
    assert (await client.get(path)).json() == created
    assert (await client.get("/api/v1/movies")).json()["total"] == 1


REVIEW_PAYLOAD = {"nome": "Artur", "nota": 4, "comentario": "Gostei do filme."}


async def test_create_list_reviews_and_average(client, database):
    movie = (await client.post("/api/v1/movies", json=PAYLOAD)).json()
    movie_id = movie["sk_movie_id"]
    path = f"/api/v1/movies/{movie_id}"
    assert movie["total_avaliacoes"] == 0
    assert movie["media_avaliacoes"] is None
    assert (await client.get(path + "/reviews")).json() == {
        "items": [],
        "total": 0,
        "media_avaliacoes": None,
        "page": 1,
        "page_size": 10,
        "total_pages": 0,
        "my_review_id": None,
    }
    created = []
    for index, score in enumerate((1, 3.5, 5)):
        if index:
            registered = await client.post("/api/v1/auth/register", json={
                "email": f"reviewer{index}@example.com",
                "display_name": f"Reviewer {index}",
                "password": "a-strong-password-123",
            })
            assert registered.status_code == 201
            client.headers["X-CSRF-Token"] = client.cookies["rocketlab_csrf"]
        response = await client.post(
            path + "/reviews", json={**REVIEW_PAYLOAD, "nota": score, "nome": " Artur "}
        )
        assert response.status_code == 201
        review = response.json()
        assert review["nota"] == score
        assert review["nome"] == "Artur"
        assert review["sk_movie_id"] == movie_id
        assert review["created_at"]
        created.append(review)
    result = (await client.get(path + "/reviews")).json()
    assert result["total"] == 3
    assert result["media_avaliacoes"] == pytest.approx(9.5 / 3)
    assert {item["sk_movie_review_id"] for item in result["items"]} == {
        item["sk_movie_review_id"] for item in created
    }
    assert [item["created_at"] for item in result["items"]] == sorted(
        (item["created_at"] for item in created), reverse=True
    )
    login = await client.post("/api/v1/auth/login", json={
        "email": "admin@example.com", "password": "senha-de-teste-segura",
    })
    assert login.status_code == 200
    client.headers["X-CSRF-Token"] = client.cookies["rocketlab_csrf"]
    for data in (
        (await client.get(path)).json(),
        (await client.get("/api/v1/movies")).json()["items"][0],
        (await client.patch(path, json={"titulo": "Título editado"})).json(),
    ):
        assert data["total_avaliacoes"] == 3
        assert data["media_avaliacoes"] == pytest.approx(9.5 / 3)
    async with database() as db:
        scores = (await db.scalars(select(MovieReview.nota).order_by(MovieReview.nota))).all()
        assert scores == [2, 7, 10]
        assert await db.scalar(select(func.count()).select_from(DimReview)) == 0
    assert (await client.delete(path)).status_code == 204
    assert (await client.get(path + "/reviews")).status_code == 404
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(MovieReview)) == 0


async def test_imported_reviews_use_same_scale_and_are_isolated_per_movie(client, database):
    first = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    second = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    async with database() as db:
        db.add_all(
            [
                MovieReview(sk_movie_id=first, nome="Histórico", nota=0, comentario="Nota zero"),
                MovieReview(sk_movie_id=first, nome="Histórico", nota=9.8, comentario="Ótimo"),
                MovieReview(sk_movie_id=second, nome="Outro", nota=10, comentario="Outro filme"),
                DimReview(sk_movie_id=first, qtd_avaliacoes_usuarios=100, nota_media_usuarios=10),
            ]
        )
        await db.commit()
    path = f"/api/v1/movies/{first}"
    assert (await client.post(path + "/reviews", json=REVIEW_PAYLOAD)).status_code == 201
    result = (await client.get(path + "/reviews")).json()
    assert result["total"] == 3
    assert sorted(review["nota"] for review in result["items"]) == [0, 4, 4.9]
    assert result["media_avaliacoes"] == pytest.approx(8.9 / 3)
    detail = (await client.get(path)).json()
    assert detail["media_avaliacoes"] == pytest.approx(8.9 / 3)
    catalog = (await client.get("/api/v1/movies")).json()
    by_id = {movie["sk_movie_id"]: movie for movie in catalog["items"]}
    assert by_id[first]["media_avaliacoes"] == pytest.approx(8.9 / 3)
    assert by_id[second]["media_avaliacoes"] == 5
    assert (await client.get(f"/api/v1/movies/{second}/reviews")).json()["total"] == 1


@pytest.mark.parametrize(
    "changes",
    [
        {"nota": 0},
        {"nota": 5.1},
        {"nota": -1},
        {"nota": True},
        {"nota": "4"},
        {"nota": None},
        {"nota": "NaN"},
        {"nome": " "},
        {"nome": "x" * 121},
        {"comentario": " "},
        {"comentario": "x" * 4001},
        {"sk_movie_id": "outro"},
    ],
)
async def test_invalid_review_does_not_persist(client, database, changes):
    movie_id = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    response = await client.post(
        f"/api/v1/movies/{movie_id}/reviews", json={**REVIEW_PAYLOAD, **changes}
    )
    assert response.status_code == 422
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(MovieReview)) == 0


async def test_review_missing_movie_and_required_fields(client):
    assert (await client.get("/api/v1/movies/inexistente/reviews")).status_code == 404
    response = await client.post("/api/v1/movies/inexistente/reviews", json=REVIEW_PAYLOAD)
    assert response.status_code == 404
    movie_id = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    assert (await client.post(f"/api/v1/movies/{movie_id}/reviews", json={})).status_code == 422


async def test_review_integrity_conflict_rolls_back(client, database):
    movie_id = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    async with database() as db:
        await db.execute(
            text(
                "CREATE TRIGGER prevent_review_insert BEFORE INSERT ON movie_reviews "
                "BEGIN SELECT RAISE(ABORT, 'insert blocked'); END"
            )
        )
        await db.commit()
    path = f"/api/v1/movies/{movie_id}/reviews"
    assert (await client.post(path, json=REVIEW_PAYLOAD)).status_code == 409
    assert (await client.get(path)).json()["total"] == 0


async def test_review_pagination_keeps_global_average(client, database):
    movie_id = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    async with database() as db:
        db.add_all([
            MovieReview(
                sk_movie_id=movie_id, nome=f"Pessoa {number}",
                nota=number % 6, comentario="Avaliação histórica"
            ) for number in range(12)
        ])
        await db.commit()

    pages = []
    for page in (1, 2, 3):
        response = await client.get(
            f"/api/v1/movies/{movie_id}/reviews", params={"page": page, "page_size": 5}
        )
        assert response.status_code == 200
        result = response.json()
        assert result["total"] == 12
        assert result["total_pages"] == 3
        assert result["page"] == page
        assert result["page_size"] == 5
        assert result["media_avaliacoes"] == pytest.approx(1.25)
        pages.extend(result["items"])
    assert len(pages) == 12
    assert len({review["sk_movie_review_id"] for review in pages}) == 12
    assert (await client.get(
        f"/api/v1/movies/{movie_id}/reviews", params={"page": 4, "page_size": 5}
    )).json()["items"] == []
    for params in ({"page": 0}, {"page_size": 0}, {"page_size": 101}):
        assert (await client.get(
            f"/api/v1/movies/{movie_id}/reviews", params=params
        )).status_code == 422


async def test_review_edit_delete_and_movie_scope(client, database):
    first = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    second = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    review = (await client.post(
        f"/api/v1/movies/{first}/reviews", json=REVIEW_PAYLOAD
    )).json()
    path = f"/api/v1/movies/{first}/reviews/{review['sk_movie_review_id']}"
    wrong_path = f"/api/v1/movies/{second}/reviews/{review['sk_movie_review_id']}"

    assert (await client.patch(wrong_path, json={"nota": 5})).status_code == 404
    assert (await client.delete(wrong_path)).status_code == 404
    for invalid in ({"nota": 0}, {"nota": None}, {"nome": " "},
                    {"comentario": None}, {"unknown": "x"}):
        assert (await client.patch(path, json=invalid)).status_code == 422
    assert (await client.get(f"/api/v1/movies/{first}/reviews")).json()["items"] == [review]

    response = await client.patch(path, json={
        "nome": "  Outra pessoa  ", "nota": 2.5, "comentario": "  Revisado  "
    })
    assert response.status_code == 200
    updated = response.json()
    assert updated == {
        **review, "nome": "Outra pessoa", "nota": 2.5, "comentario": "Revisado"
    }
    assert (await client.get(f"/api/v1/movies/{first}")).json()["media_avaliacoes"] == 2.5
    assert (await client.get(f"/api/v1/movies/{first}/reviews")).json()["items"] == [updated]
    assert (await client.patch(path, json={})).json() == updated

    assert (await client.delete(path)).status_code == 204
    assert (await client.delete(path)).status_code == 404
    assert (await client.patch(path, json={"nota": 4})).status_code == 404
    summary = (await client.get(f"/api/v1/movies/{first}")).json()
    assert summary["total_avaliacoes"] == 0
    assert summary["media_avaliacoes"] is None
    async with database() as db:
        assert await db.scalar(select(func.count()).select_from(MovieReview)) == 0


async def test_collections_persist_filter_and_remove_independently(client, database):
    movies = {}
    for title in ("Star Wars", "Star Trek", "Outro"):
        movies[title] = (await client.post(
            "/api/v1/movies", json={**PAYLOAD, "titulo": title}
        )).json()

    wars = movies["Star Wars"]["sk_movie_id"]
    trek = movies["Star Trek"]["sk_movie_id"]
    wars_favorites = f"/api/v1/movies/{wars}/collections/favorites"
    wars_watchlist = f"/api/v1/movies/{wars}/collections/watchlist"
    trek_favorites = f"/api/v1/movies/{trek}/collections/favorites"

    for path in (wars_favorites, wars_favorites, wars_watchlist, trek_favorites):
        response = await client.put(path)
        assert response.status_code == 200
    assert (await client.get(f"/api/v1/movies/{wars}")).json() == {
        **movies["Star Wars"], "is_favorite": True, "in_watchlist": True
    }

    first = (await client.get("/api/v1/movies", params={
        "collection": "favorites", "q": "star", "page_size": 1, "page": 1
    })).json()
    second = (await client.get("/api/v1/movies", params={
        "collection": "favorites", "q": "star", "page_size": 1, "page": 2
    })).json()
    assert first["total"] == second["total"] == 2
    assert first["total_pages"] == second["total_pages"] == 2
    assert [first["items"][0]["titulo"], second["items"][0]["titulo"]] == [
        "Star Trek", "Star Wars"
    ]
    assert (await client.get("/api/v1/movies", params={
        "collection": "watchlist"
    })).json()["items"][0]["sk_movie_id"] == wars

    assert (await client.delete(wars_favorites)).status_code == 204
    assert (await client.delete(wars_favorites)).status_code == 204
    updated = (await client.get(f"/api/v1/movies/{wars}")).json()
    assert updated["is_favorite"] is False
    assert updated["in_watchlist"] is True
    assert (await client.get("/api/v1/movies", params={
        "collection": "favorites"
    })).json()["total"] == 1

    assert (await client.delete(f"/api/v1/movies/{wars}")).status_code == 204
    async with database() as db:
        remaining = (await db.scalars(select(MovieCollection.sk_movie_id))).all()
        assert remaining == [trek]


async def test_collections_reject_invalid_names_and_missing_movies(client):
    movie_id = (await client.post("/api/v1/movies", json=PAYLOAD)).json()["sk_movie_id"]
    assert (await client.get("/api/v1/movies", params={
        "collection": "unknown"
    })).status_code == 422
    assert (await client.put(
        f"/api/v1/movies/{movie_id}/collections/unknown"
    )).status_code == 422
    assert (await client.delete(
        f"/api/v1/movies/{movie_id}/collections/unknown"
    )).status_code == 422
    assert (await client.put(
        "/api/v1/movies/missing/collections/favorites"
    )).status_code == 404
    assert (await client.delete(
        "/api/v1/movies/missing/collections/watchlist"
    )).status_code == 404


async def test_search_by_director_and_combined_genre_rating_filters(client):
    samples = [
        ("Viagem espacial", "Ficção científica", "Ana Duarte", 5),
        ("Outra viagem", "Drama", "Ana Duarte", 2),
        ("Filme terrestre", "Ficção científica", "Bruno Lima", 4),
    ]
    created = []
    for title, genre, director, rating in samples:
        movie = (await client.post("/api/v1/movies", json={
            **PAYLOAD, "titulo": title, "generos": [genre], "diretores": [director]
        })).json()
        created.append(movie)
        assert (await client.post(
            f"/api/v1/movies/{movie['sk_movie_id']}/reviews",
            json={**REVIEW_PAYLOAD, "nota": rating},
        )).status_code == 201

    assert (await client.get("/api/v1/movies/genres")).json() == [
        "Drama", "Ficção científica"
    ]
    director_result = (await client.get("/api/v1/movies", params={
        "q": "ana duarte"
    })).json()
    assert {movie["titulo"] for movie in director_result["items"]} == {
        "Viagem espacial", "Outra viagem"
    }
    filtered = (await client.get("/api/v1/movies", params={
        "q": "ana", "genre": "Ficção científica", "min_rating": 4
    })).json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["sk_movie_id"] == created[0]["sk_movie_id"]
    for movie in created[:2]:
        assert (await client.put(
            f"/api/v1/movies/{movie['sk_movie_id']}/collections/favorites"
        )).status_code == 200
    saved_result = (await client.get("/api/v1/movies", params={
        "collection": "favorites", "q": "ana", "genre": "Ficção científica",
        "min_rating": 4,
    })).json()
    assert saved_result["total"] == 1
    assert saved_result["items"][0]["sk_movie_id"] == created[0]["sk_movie_id"]
    assert (await client.get("/api/v1/movies", params={
        "genre": "Ficção científica", "min_rating": 4.5
    })).json()["total"] == 1
    assert (await client.get("/api/v1/movies", params={
        "genre": "Drama", "min_rating": 4
    })).json()["total"] == 0
    assert (await client.get("/api/v1/movies", params={"min_rating": 6})).status_code == 422
    assert (await client.get("/api/v1/movies", params={"genre": "x" * 51})).status_code == 422


async def test_data_quality_report_empty_and_with_catalog_changes(client, database):
    path = "/api/v1/reports/data-quality"
    empty = (await client.get(path)).json()
    assert empty["total_movies"] == 0
    assert empty["total_reviews"] == 0
    assert all(check["count"] == 0 and check["examples"] == [] for check in empty["checks"])

    movies = []
    for title in ("Duplicado", "duplicado", "Outro"):
        response = await client.post("/api/v1/movies", json={
            **PAYLOAD, "titulo": title, "ano_lancamento": 2000,
            "url_poster": "https://example.com/poster.jpg",
            "generos": ["Drama"], "diretores": ["Diretora"],
        })
        assert response.status_code == 201
        movies.append(response.json())
    first_id = movies[0]["sk_movie_id"]
    assert (await client.post(
        f"/api/v1/movies/{first_id}/reviews", json=REVIEW_PAYLOAD
    )).status_code == 201
    async with database() as db:
        first = await get_movie(db, first_id)
        first.url_poster = None
        first.sinopse = None
        first.duracao_minutos = None
        first.data_lancamento = date(2001, 1, 1)
        first.genres = []
        first.people = []
        third = await get_movie(db, movies[2]["sk_movie_id"])
        third.titulo = ""
        await db.commit()

    response = await client.get(path)
    assert response.status_code == 200
    report = response.json()
    assert report["generated_at"]
    assert report["total_movies"] == 3
    assert report["total_reviews"] == 1
    checks = {check["key"]: check for check in report["checks"]}
    assert len(checks) == 10
    for key in (
        "missing_poster", "missing_synopsis", "missing_duration", "year_mismatch",
        "missing_genre", "missing_director", "missing_title",
    ):
        assert checks[key]["count"] == 1
        assert checks[key]["percentage"] == pytest.approx(33.333)
        assert checks[key]["examples"][0]["movie_id"] in {
            first_id, movies[2]["sk_movie_id"]
        }
    assert checks["missing_year"]["count"] == 0
    assert checks["possible_duplicates"]["count"] == 2
    assert {item["movie_id"] for item in checks["possible_duplicates"]["examples"]} == {
        movies[0]["sk_movie_id"], movies[1]["sk_movie_id"]
    }
    assert checks["no_reviews"]["count"] == 2
    assert checks["no_reviews"]["percentage"] == pytest.approx(66.667)

    assert (await client.patch(
        f"/api/v1/movies/{first_id}", json={"url_poster": "https://example.com/new.jpg"}
    )).status_code == 200
    updated = (await client.get(path)).json()
    assert {check["key"]: check["count"] for check in updated["checks"]}["missing_poster"] == 0
