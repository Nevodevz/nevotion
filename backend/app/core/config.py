import sys
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_SECRET = "CHANGE_ME_IN_PRODUCTION_use_openssl_rand_hex_32"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    POSTGRES_USER: str = "nevodevs"
    POSTGRES_PASSWORD: str = "nevodevs_pass"
    POSTGRES_DB: str = "nevodevs"
    POSTGRES_HOST: str = "db"
    POSTGRES_PORT: int = 5432

    SECRET_KEY: str = _DEFAULT_SECRET
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    FRONTEND_URL: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"  # "production" triggers security checks

    # ── Media (avatars) ──────────────────────────────────────────
    # Directory must live on a persistent volume; served at MEDIA_URL_PREFIX.
    MEDIA_ROOT: str = "/app/media"
    MEDIA_URL_PREFIX: str = "/media"
    MAX_AVATAR_BYTES: int = 5 * 1024 * 1024  # 5 MB

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    def check_production_security(self):
        """Call on startup in production — fail fast on insecure defaults."""
        if self.ENVIRONMENT == "production":
            if self.SECRET_KEY == _DEFAULT_SECRET:
                print("FATAL: SECRET_KEY is default value. Set a strong SECRET_KEY in .env", file=sys.stderr)
                sys.exit(1)

settings = Settings()
