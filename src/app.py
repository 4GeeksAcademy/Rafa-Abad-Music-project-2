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

# CORS (app-wide)
CORS(
    app,
    resources={r"/api/*": {"origins": ["https://music-match-tt10.onrender.com", "https://music-match-backend-1949.onrender.com"]}},
    supports_credentials=True,               # ok to keep or set False if not needed
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
)

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
