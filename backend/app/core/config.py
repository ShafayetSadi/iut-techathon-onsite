from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "IUT Techathon Robot Backend"
    api_prefix: str = "/api"
    urdf_path: Path = Path("../6_dof_arm.urdf")
    panel_config_path: Path = Path("../key.config.json")
    ik_tolerance_m: float = 0.005
    ik_max_iterations: int = 300
    ik_damping: float = 0.04
    trajectory_steps: int = 30
    workspace_radius_m: float = 1.7
    min_z_m: float = -0.25
    max_z_m: float = 1.6

    model_config = SettingsConfigDict(env_prefix="ROBOT_", env_file=".env")


@lru_cache
def get_settings() -> Settings:
    return Settings()
