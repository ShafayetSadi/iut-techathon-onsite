from __future__ import annotations

from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.dependencies import get_motion_planner, get_panel_service


def main() -> None:
    planner = get_motion_planner()
    panel = get_panel_service().get_keys()
    current_joints = None

    for key in panel.keys:
        response = planner.solve_target(key.position, current_joints)
        status = "PASS" if response.success else "FAIL"
        print(
            f"{status} key={key.digit} target={key.position.model_dump()} "
            f"tip={response.tip} error={response.error_meters:.6f} iterations={response.iterations}"
        )
        if response.success:
            current_joints = response.joints


if __name__ == "__main__":
    main()
