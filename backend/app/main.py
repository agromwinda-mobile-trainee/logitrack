from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from app.api import router
from app.auth_utils import hash_password
from app.config import settings
from app.db import Base, SessionLocal, engine
from app.models import User


def create_app() -> FastAPI:
    app = FastAPI(
        title="LogiTrack API",
        version="0.1.0",
        description="API simple pour tracking, maintenance, analytics, module client et optimisation.",
    )

    # CORS: le frontend Vite tourne sur 5173.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(router, prefix="/api")
    return app


app = create_app()


@app.on_event("startup")
def _startup() -> None:
    # Mode dev: on crée les tables automatiquement.
    # En production: migrations (Alembic) + contrôle de schéma.
    # On active PostGIS (ST_DistanceSphere, etc.) si nécessaire.
    # Sur certains devs, PostGIS peut ne pas être installé / compatible.
    # Dans ce cas, on garde le géofencing fonctionnel via fallback côté Python.
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
    except Exception:
        # PostGIS indisponible: le géofencing repasse en fallback Python.
        pass
    Base.metadata.create_all(bind=engine)

    # Schéma existant: ajoute la colonne `client_user_id` si la table deliveries est ancienne.
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    ALTER TABLE deliveries
                    ADD COLUMN IF NOT EXISTS client_user_id INTEGER
                    REFERENCES users(id) ON DELETE SET NULL;
                    """
                )
            )
    except Exception:
        pass

    # Compte admin initial si aucun admin en base.
    db = SessionLocal()
    try:
        has_admin = db.scalars(select(User).where(User.role == "admin").limit(1)).first()
        if not has_admin:
            u = User(
                email=settings.bootstrap_admin_email.strip().lower(),
                hashed_password=hash_password(settings.bootstrap_admin_password),
                role="admin",
            )
            db.add(u)
            db.commit()
    finally:
        db.close()

