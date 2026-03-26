from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Configuration minimale.

    En prod (Linux), on passe ces variables via l'environnement.
    En local, les valeurs par défaut sont pensées pour `docker-compose.yml`.
    """

    model_config = SettingsConfigDict(env_prefix="LOGITRACK_", extra="ignore")

    database_url: str = "postgresql+psycopg://logitrack:logitrack@localhost:5432/logitrack"
    cors_allow_origins: str = "*"

    # JWT (changer jwt_secret en production)
    jwt_secret: str = "change-me-in-production-use-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24

    # Compte admin initial (créé au démarrage si aucun admin)
    bootstrap_admin_email: str = "admin@logitrack.local"
    bootstrap_admin_password: str = "changeme123"


settings = Settings()

