# app.py
import os
from pathlib import Path
from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager

from api.models import db
from api import api_bp

app = Flask(__name__, instance_relative_config=True)

# ensure instance dir
BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"
INSTANCE_DIR.mkdir(parents=True, exist_ok=True)

# DB URI
db_url = os.getenv("DATABASE_URL")
if db_url:
    db_url = db_url.replace("postgres://", "postgresql://")
    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
else:
    DB_FILE = (INSTANCE_DIR / "app.db").resolve()
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{DB_FILE.as_posix()}"

app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# JWT (header-based)
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "dev-secret-change-me")
jwt = JWTManager(app)

# Init extensions
db.init_app(app)
Migrate(app, db)

#initiate db
with app.app_context():
    if os.getenv("AUTO_CREATE_DB", "0") == "1":
        from src.models import db
        db.create_all()
# CORS (app-wide)
allowed = os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
if allowed:
    ORIGINS = [o.strip() for o in allowed.split(",") if o.strip()]
else:
    # Safe defaults: prod frontend + local dev
    ORIGINS = [
        "https://music-match-tt10.onrender.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

CORS(
    app,
    resources={r"/api/*": {"origins": ORIGINS}},
    # We use Authorization header tokens, not cookies → simpler CORS:
    supports_credentials=False,
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Authorization", "Content-Type"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
)

# Ensure CORS headers are present even on errors / edge cases
@app.after_request
def _add_cors_headers(resp):
    resp.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    resp.headers.setdefault("Access-Control-Allow-Headers", "Authorization, Content-Type")
    return resp

# Register API
app.register_blueprint(api_bp)

@app.get("/")
def root():
    return jsonify({"message": "Music project backend is running!"})

@app.get("/health")
def health():
    return jsonify({"ok": True})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=3001, debug=True)
