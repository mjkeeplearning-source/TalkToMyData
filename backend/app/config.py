from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    anthropic_api_key: str
    tableau_server_url: str
    tableau_site_name: str
    tableau_pat_name: str
    tableau_pat_secret: str
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
