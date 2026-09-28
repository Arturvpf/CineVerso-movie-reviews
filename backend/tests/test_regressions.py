from datetime import datetime
from io import BytesIO

import pytest
from PIL import Image, PngImagePlugin
from sqlalchemy import text, update

from app.auth.models import UserSession
from app.core.config import get_settings
from app.movies.models import DimPerson
from app.movies.service import get_movie
from tests.test_movies import PAYLOAD


@pytest.mark.parametrize("query", ["AÇÃO", "ação", "acao", "AcAo"])
async def test_search_normalizes_unicode(client, query):
    movie = (await client.post('/api/v1/movies', json={**PAYLOAD, 'titulo': 'AÇÃO'})).json()
    found = (await client.get('/api/v1/movies', params={'q': query})).json()
    assert [item['sk_movie_id'] for item in found['items']] == [movie['sk_movie_id']]


async def test_broad_search_matches_over_500_people_without_duplicate_movies(client, database):
    movie = (await client.post('/api/v1/movies', json=PAYLOAD)).json()
    async with database() as db:
        saved = await get_movie(db, movie['sk_movie_id'])
        saved.people.extend([
            DimPerson(nome_pessoa=f'Átora {index}', tipo_pessoa='Ator') for index in range(510)
        ])
        await db.commit()
        plan = (await db.execute(text(
            'EXPLAIN QUERY PLAN SELECT sk_movie_id FROM bridge_movie_person '
            'WHERE sk_person_id = :person'
        ), {'person': 'any'})).all()
        assert any('COVERING INDEX ix_bridge_person_movie' in row[3] for row in plan)
    response = (await client.get('/api/v1/movies', params={'q': 'atora', 'page_size': 1})).json()
    assert response['total'] == response['total_pages'] == 1
    assert response['items'][0]['sk_movie_id'] == movie['sk_movie_id']
    assert (await client.get('/api/v1/movies', params={
        'q': 'atora', 'page': 2, 'page_size': 1,
    })).json()['items'] == []


async def test_logout_expired_and_absent_sessions_is_idempotent(client, database):
    async with database() as db:
        await db.execute(update(UserSession).values(expires_at=datetime(2000, 1, 1)))
        await db.commit()
    assert (await client.post('/api/v1/auth/logout')).status_code == 204
    assert not client.cookies.get('rocketlab_session')
    assert not client.cookies.get('rocketlab_csrf')
    assert (await client.post('/api/v1/auth/logout')).status_code == 204


async def test_logout_keeps_csrf_and_origin_protection(client):
    csrf = client.headers.pop('X-CSRF-Token')
    assert (await client.post('/api/v1/auth/logout')).status_code == 403
    assert (await client.get('/api/v1/auth/me')).status_code == 200
    client.headers['X-CSRF-Token'] = csrf
    assert (await client.post('/api/v1/auth/logout', headers={
        'Origin': 'https://untrusted.example',
    })).status_code == 403
    assert (await client.post('/api/v1/auth/logout')).status_code == 204


async def test_logout_deletes_host_prefixed_cookies_with_secure_attribute(client, monkeypatch):
    monkeypatch.setattr(get_settings(), 'environment', 'production')
    response = await client.post('/api/v1/auth/login', json={
        'email': 'admin@example.com', 'password': 'senha-de-teste-segura',
    })
    assert response.status_code == 200
    csrf = response.headers['x-csrf-token']
    token = response.cookies['__Host-rocketlab_session']
    response = await client.post('/api/v1/auth/logout', headers={
        'Cookie': f'__Host-rocketlab_session={token}; __Host-rocketlab_csrf={csrf}',
        'X-CSRF-Token': csrf,
    })
    assert response.status_code == 204
    cookies = response.headers.get_list('set-cookie')
    assert len(cookies) == 2
    assert all('Secure' in cookie and 'Max-Age=0' in cookie for cookie in cookies)


async def test_csrf_header_can_be_read_by_allowed_frontend(user_client):
    response = await user_client.get('/api/v1/auth/me', headers={
        'Origin': 'http://localhost:5173',
    })
    assert response.headers['x-csrf-token'] == user_client.cookies['rocketlab_csrf']
    assert 'x-csrf-token' in response.headers['access-control-expose-headers'].lower()
    assert response.headers['cache-control'] == 'no-store'
    token = response.headers['x-csrf-token']
    response = await user_client.patch('/api/v1/auth/me', json={'display_name': 'Novo'},
                                      headers={'X-CSRF-Token': token})
    assert response.status_code == 200


@pytest.mark.parametrize('content', [b'\x89PNG\r\n\x1a\n', b'\xff\xd8\xff\xff\xd9',
                                    b'RIFF0000WEBP', b'<svg></svg>'])
async def test_reject_corrupt_avatar(user_client, content):
    response = await user_client.put('/api/v1/auth/me/avatar', files={
        'file': ('photo.png', content, 'image/png'),
    })
    assert response.status_code == 422
    assert (await user_client.get('/api/v1/auth/me')).json()['avatar_url'] is None


@pytest.mark.parametrize('image_format', ['PNG', 'JPEG', 'WEBP'])
async def test_avatar_is_decoded_resized_and_metadata_removed(user_client, image_format):
    original = BytesIO()
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text('Comment', 'private metadata')
    Image.new('RGB', (600, 300), 'red').save(
        original, format=image_format,
        **({'pnginfo': metadata} if image_format == 'PNG' else {}),
    )
    response = await user_client.put('/api/v1/auth/me/avatar', files={
        'file': ('photo', original.getvalue(), 'application/octet-stream'),
    })
    assert response.status_code == 200
    fetched = await user_client.get(response.json()['avatar_url'])
    assert fetched.headers['content-type'] == 'image/png'
    with Image.open(BytesIO(fetched.content)) as avatar:
        avatar.load()
        assert avatar.size == (512, 256)
        assert 'Comment' not in avatar.info


async def test_avatar_limits_dimensions_and_bytes(user_client):
    original = BytesIO()
    Image.new('RGB', (8193, 1)).save(original, format='PNG')
    for content, status in [(original.getvalue(), 422), (b'x' * (2 * 1024 * 1024 + 1), 413)]:
        assert (await user_client.put('/api/v1/auth/me/avatar', files={
            'file': ('photo.png', content, 'image/png'),
        })).status_code == status
