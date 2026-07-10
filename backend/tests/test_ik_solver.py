from app.dependencies import get_motion_planner, get_panel_service, get_robot_model


def test_ik_reaches_all_panel_keys_within_tolerance() -> None:
    planner = get_motion_planner()
    panel = get_panel_service().get_keys()
    current_joints = None

    for key in panel.keys:
        response = planner.solve_target(key.position, current_joints)
        assert response.success, response.reason
        assert response.error_meters is not None
        assert response.error_meters <= 0.005
        current_joints = response.joints


def test_ik_rejects_unreachable_workspace_target() -> None:
    planner = get_motion_planner()

    try:
        planner.solve_target(type("Target", (), {"x": 5.0, "y": 0.0, "z": 0.0})())
    except Exception as exc:
        assert "workspace" in str(exc)
    else:
        raise AssertionError("Expected workspace validation failure")


def test_ik_outputs_stay_within_joint_limits() -> None:
    planner = get_motion_planner()
    model = get_robot_model()
    key = get_panel_service().get_keys().keys[0]
    response = planner.solve_target(key.position)

    assert response.success
    assert response.joints is not None
    limits = model.joint_limits()
    for name, value in response.joints.items():
        assert limits[name].lower <= value <= limits[name].upper

