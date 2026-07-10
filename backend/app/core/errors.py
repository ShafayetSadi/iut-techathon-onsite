class RobotBackendError(Exception):
    """Base error for domain failures that should become API responses."""


class ValidationError(RobotBackendError):
    """Raised when an input command is malformed or unsafe."""


class KinematicsError(RobotBackendError):
    """Raised when the robot model or solver cannot complete a request."""

