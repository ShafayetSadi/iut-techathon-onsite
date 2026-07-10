FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    ROBOT_URDF_PATH=/app/6_dof_arm.urdf \
    ROBOT_PANEL_CONFIG_PATH=/app/key.config.json

WORKDIR /app/backend

COPY --from=ghcr.io/astral-sh/uv:0.5.31 /uv /uvx /bin/

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/app ./app
COPY backend/scripts ./scripts
COPY backend/README.md ./README.md
COPY 6_dof_arm.urdf /app/6_dof_arm.urdf
COPY key.config.json /app/key.config.json

EXPOSE 8000

CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

