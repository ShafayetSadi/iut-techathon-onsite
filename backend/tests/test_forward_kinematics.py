from app.dependencies import get_robot_model
from app.robot.kinematics import forward_kinematics


def test_forward_kinematics_neutral_pose_is_finite() -> None:
    model = get_robot_model()
    result = forward_kinematics(model, model.neutral_pose())

    assert result.tip.shape == (3,)
    assert all(abs(value) < 2.0 for value in result.tip)


def test_robot_model_loads_controlled_joints() -> None:
    model = get_robot_model()

    assert model.tcp_link == "stylus_tip"
    assert model.controlled_joint_names == (
        "joint_1",
        "joint_2",
        "joint_3",
        "joint_4",
        "joint_5",
        "joint_6",
        "stylus_pitch",
    )
    assert set(model.joint_limits()) == set(model.controlled_joint_names)

