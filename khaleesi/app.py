"""Builds the FastAPI application and serves the web interface."""

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from khaleesi import actuators, auth, bench, devices, events
from khaleesi.commands import (
    ActuatorNotFoundError,
    CommandService,
    DeviceBusyError,
    InvalidTargetError,
    SensorNotFoundError,
)
from khaleesi.config import Settings
from khaleesi.database import Database
from khaleesi.device_store import DeviceStore

_WEB_DIR = Path(__file__).parent / "web"

_ERROR_RESPONSES = {
    ActuatorNotFoundError: (404, "This actuator no longer exists"),
    SensorNotFoundError: (404, "This sensor no longer exists"),
    DeviceBusyError: (409, "Another operation is in progress on this device"),
    InvalidTargetError: (422, "This state is not valid for this actuator"),
}


def _register_error_handlers(app: FastAPI) -> None:
    def handler_for(status_code: int, detail: str):
        async def handle(_: Request, __: Exception) -> JSONResponse:
            return JSONResponse(status_code=status_code, content={"detail": detail})

        return handle

    for error_type, (status_code, detail) in _ERROR_RESPONSES.items():
        app.add_exception_handler(error_type, handler_for(status_code, detail))


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    database = Database(settings.db_path)
    database.initialize()
    device_store = DeviceStore(settings.devices_path)
    device_store.initialize()

    app = FastAPI(title="Khaleesi", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings = settings
    app.state.db = database
    app.state.devices = device_store
    app.state.sessions = auth.SessionManager(settings.session_hours * 3600)
    app.state.throttle = auth.LoginThrottle(
        settings.login_max_failures, settings.login_block_seconds
    )
    app.state.hub = events.EventHub(app.state.sessions)
    app.state.commands = CommandService(device_store, app.state.hub)

    _register_error_handlers(app)
    for module in (auth, actuators, bench, devices, events):
        app.include_router(module.router)

    def is_logged_in(request: Request) -> bool:
        return app.state.sessions.get(request.cookies.get(auth.SESSION_COOKIE)) is not None

    @app.get("/", include_in_schema=False)
    async def index(request: Request) -> Response:
        if not is_logged_in(request):
            return RedirectResponse("/login", status_code=303)
        return FileResponse(_WEB_DIR / "index.html")

    @app.get("/login", include_in_schema=False)
    async def login_page(request: Request) -> Response:
        if is_logged_in(request):
            return RedirectResponse("/", status_code=303)
        return FileResponse(_WEB_DIR / "login.html")

    app.mount("/css", StaticFiles(directory=_WEB_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=_WEB_DIR / "js"), name="js")
    return app
