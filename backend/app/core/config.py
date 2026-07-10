from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "IUT Techathon Robot Backend"
    api_prefix: str = "/api"
    urdf_path: Path = Path("../6_dof_arm.urdf")
    panel_config_path: Path = Path("../key.config.json")
    ik_tolerance_m: float = 0.002
    ik_max_iterations: int = 300
    ik_damping: float = 0.04
    trajectory_steps: int = 30
    workspace_radius_m: float = 1.7
    min_z_m: float = -0.25
    max_z_m: float = 1.6

    # Speech-to-text. The key never reaches the browser: Next.js inlines any
    # NEXT_PUBLIC_* var into the client bundle, so the audio round-trips through
    # this backend instead. Set ROBOT_ELEVENLABS_API_KEY (note the env prefix).
    elevenlabs_api_key: str | None = None
    elevenlabs_stt_url: str = "https://api.elevenlabs.io/v1/speech-to-text"
    elevenlabs_stt_model: str = "scribe_v1"
    elevenlabs_timeout_s: float = 30.0
    max_audio_bytes: int = 10 * 1024 * 1024

    model_config = SettingsConfigDict(env_prefix="ROBOT_", env_file=".env")


@lru_cache
def get_settings() -> Settings:
    return Settings()
