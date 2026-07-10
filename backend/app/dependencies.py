from functools import lru_cache

from app.agent.compiler import AgentCompiler
from app.agent.service import AgentService
from app.core.config import get_settings
from app.hardware.service import HardwareService
from app.motion.planner import MotionPlanner
from app.motion.safety import SafetyValidator
from app.motion.state import RobotStateStore
from app.panel.service import PanelService
from app.pin.service import PinService
from app.robot.ik_solver import IKSolver
from app.robot.urdf_loader import RobotModel, load_robot_model
from app.voice.service import VoiceService


@lru_cache
def get_robot_model() -> RobotModel:
    settings = get_settings()
    return load_robot_model(settings.urdf_path)


@lru_cache
def get_motion_planner() -> MotionPlanner:
    settings = get_settings()
    model = get_robot_model()
    solver = IKSolver(
        model,
        tolerance_m=settings.ik_tolerance_m,
        max_iterations=settings.ik_max_iterations,
        damping=settings.ik_damping,
    )
    safety = SafetyValidator(
        workspace_radius_m=settings.workspace_radius_m,
        min_z_m=settings.min_z_m,
        max_z_m=settings.max_z_m,
    )
    return MotionPlanner(model, solver, safety, trajectory_steps=settings.trajectory_steps)


@lru_cache
def get_state_store() -> RobotStateStore:
    return RobotStateStore(get_robot_model())


@lru_cache
def get_panel_service() -> PanelService:
    return PanelService(get_settings().panel_config_path)


@lru_cache
def get_pin_service() -> PinService:
    return PinService(get_panel_service(), get_motion_planner())


@lru_cache
def get_voice_service() -> VoiceService:
    return VoiceService(get_settings())


@lru_cache
def get_agent_compiler() -> AgentCompiler:
    return AgentCompiler(get_robot_model(), get_motion_planner(), get_panel_service())


@lru_cache
def get_agent_service() -> AgentService:
    return AgentService(get_settings(), get_robot_model(), get_panel_service(), get_agent_compiler())


@lru_cache
def get_hardware_service() -> HardwareService:
    return HardwareService()
