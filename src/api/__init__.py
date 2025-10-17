# api/__init__.py
from flask import Blueprint, jsonify

# Single, shared blueprint for the whole API
api_bp = Blueprint("api", __name__, url_prefix="/api")

@api_bp.get("/ping")
def ping():
    return jsonify({"pong": True})

from . import routes  # noqa: F401