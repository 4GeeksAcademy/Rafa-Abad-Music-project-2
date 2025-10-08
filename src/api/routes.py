"""
This module takes care of starting the API Server, Loading the DB and Adding the endpoints
"""
from flask import request, jsonify, Blueprint
from flask_cors import CORS
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from datetime import datetime
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, get_jwt
import os

from api.models import db, User, Offer, Match, Message, Review
from .utils import hash_password, verify_password

api = Blueprint('api', __name__)
CORS(
    api,
    resources={r"/*": {"origins": "http://localhost:3000"}},
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
)

# We store roles as: performer | distributor | admin
# (UI can label "distributor" as "venue")
ALLOWED_ROLES = {"performer", "distributor", "admin"}

# -------------------------
# Utilities
# -------------------------
def _parse_iso_dt(s: str):
    """Accepts 'YYYY-MM-DDTHH:MM' or 'YYYY-MM-DDTHH:MM:SS[Z]'."""
    try:
        s = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except Exception:
        return None

def _normalize_role(role_raw: str) -> str:
    role = (role_raw or "").strip().lower()
    if role == "venue":
        role = "distributor"
    return role

def _current_user_id() -> int | None:
    try:
        return int(get_jwt_identity())
    except Exception:
        return None

def _current_role() -> str:
    claims = get_jwt() if get_jwt else {}
    return (claims.get("role") or "").lower()

def _ensure_offer(offer_id: int) -> Offer | None:
    return db.session.get(Offer, offer_id)

def _is_offer_owner(user_id: int, offer: Offer) -> bool:
    return offer and offer.distributorId == user_id
def _role_from_claims() -> str:
    claims = get_jwt() or {}
    return (claims.get("role") or "").lower()

def _can_view_or_send_messages(user_id: int, role: str, offer: Offer) -> bool:
    """
    Venues/Admins: allowed on their offers.
    Performers: allowed only if they have a Match on this offer and:
      - chatApproved == True, or
      - they are the accepted performer for the offer.
    """
    # Admin can view any
    if role == "admin":
        return True

    # Distributor (venue) can view/send only for their offers
    if role in ("distributor", "venue"):
        return offer.distributorId == user_id

    # Performers need an approved chat OR be the accepted performer
    if role == "performer":
        # accepted performer can always chat
        if offer.acceptedPerformerId and int(offer.acceptedPerformerId) == int(user_id):
            return True

        # else require chat approval on their match
        m = db.session.execute(
            select(Match).where(
                Match.offerId == offer.offerId,
                Match.performerId == user_id
            )
        ).scalar_one_or_none()
        return bool(m and m.chatApproved)

    return False

# -------------------------
# Auth
# -------------------------
@api.route("/login", methods=["POST"])
def login():
    """
    Signin: verifies credentials and returns { user, token }.
    Body: { email, password }
    """
    if not request.is_json:
        return jsonify({"msg": "content-type must be application/json"}), 415

    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = db.session.scalar(select(User).where(User.email == email))
    if not user or not verify_password(user.password, password):
        return jsonify({"msg": "invalid credentials"}), 401

    token = create_access_token(identity=str(user.userId), additional_claims={"role": user.role})
    return jsonify({"user": user.serialize(), "token": token}), 200


@api.route("/auth/me", methods=["GET"])
@jwt_required()
def auth_me():
    ident = _current_user_id()
    if not ident:
        return jsonify({"msg": "invalid token"}), 401
    user = db.session.get(User, ident)
    if not user:
        return jsonify({"msg": "user not found"}), 404
    return jsonify(user.serialize()), 200

# -------------------------
# Users
# -------------------------
@api.route('/users', methods=['GET'])
def get_users():
    rows = db.session.execute(db.select(User)).scalars().all()
    return jsonify([u.serialize() for u in rows]), 200


@api.route("/new-user", methods=["POST"])
def post_users():
    """
    Signup: creates a user and returns { user, token } so the client is logged in immediately.
    Admin creation rule:
      - If no admin exists yet, allow creating the FIRST admin with no code.
      - If an admin already exists, require 'adminCode' to match ADMIN_SIGNUP_CODE.
    """
    if not request.is_json:
        return jsonify({"msg": "content-type must be application/json"}), 415

    data = request.get_json() or {}
    role = _normalize_role(data.get("role"))

    if role not in ALLOWED_ROLES:
        return jsonify({"msg": f"invalid role '{role}'"}), 400

    # Admin guard
    if role == "admin":
        existing_admin = db.session.scalar(select(User).where(User.role == "admin"))
        if existing_admin:
            provided_code = (data.get("adminCode") or "").strip()
            expected_code = os.getenv("ADMIN_SIGNUP_CODE", "")
            if not expected_code or provided_code != expected_code:
                return jsonify({"msg": "admin signup not allowed"}), 403

    # Required fields by role
    if role == "admin":
        required = ["email", "password"]
    elif role == "performer":
        required = ["email", "password", "name", "city"]
    elif role == "distributor":
        required = ["email", "password", "name", "city", "capacity"]
    else:
        required = ["email", "password"]

    missing = [k for k in required if not data.get(k)]
    if missing:
        return jsonify({"msg": f"missing parameters: {', '.join(missing)}"}), 400

    email = (data["email"] or "").strip().lower()

    capacity = None
    if role == "distributor":
        try:
            capacity = int(data.get("capacity", 0))
            if capacity < 0:
                raise ValueError()
        except Exception:
            return jsonify({"msg": "capacity must be a non-negative integer"}), 400

    if db.session.scalar(select(User).where(User.email == email)):
        return jsonify({"msg": "email already registered"}), 409

    try:
        user = User(
            email=email,
            password=hash_password(data["password"]),
            role=role,
            name=(data.get("venueName") or data.get("name") or role.capitalize()).strip(),
            city=(data.get("city") or "N/A").strip(),
            avatarUrl=data.get("avatarUrl"),
            capacity=capacity if role == "distributor" else None,
        )
        db.session.add(user)
        db.session.commit()

        token = create_access_token(identity=str(user.userId), additional_claims={"role": user.role})
        return jsonify({"user": user.serialize(), "token": token}), 201

    except IntegrityError:
        db.session.rollback()
        return jsonify({"msg": "email already registered"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"msg": "unexpected error", "detail": str(e)}), 500


@api.route('/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "user not found"}), 404
    return jsonify(user.serialize()), 200


@api.route('/users/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "user not found"}), 404

    data = request.get_json() or {}
    allowed = ("email", "name", "city", "role", "avatarUrl", "capacity")
    for key in allowed:
        if key in data:
            if key == "role":
                setattr(user, key, _normalize_role(data[key]))
            else:
                setattr(user, key, data[key])

    try:
        db.session.commit()
        return jsonify(user.serialize()), 200
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": "conflict updating user"}), 409

# -------------------------
# ---- User-scoped offers ----
# -------------------------
@api.route('/users/<int:user_id>/offers/created', methods=['GET'])
@jwt_required()
def offers_created_by_user(user_id):
    rows = db.session.execute(
        select(Offer).where(Offer.distributorId == user_id).order_by(Offer.createdAt.desc())
    ).scalars().all()
    return jsonify([o.serialize() for o in rows]), 200


@api.route('/users/<int:user_id>/offers/applied', methods=['GET'])
@jwt_required()
def offers_user_applied(user_id):
    q = (
        select(Offer, Match.status.label("match_status"), Match.matchId.label("match_id"))
        .join(Match, Match.offerId == Offer.offerId)
        .where(Match.performerId == user_id)
        .order_by(Offer.createdAt.desc())
    )
    rows = db.session.execute(q).all()

    out = []
    for offer, match_status, match_id in rows:
        item = offer.serialize()
        item["matchStatus"] = match_status
        item["matchId"] = match_id
        out.append(item)
    return jsonify(out), 200

# -------------------------
# Offers (public + protected)
# -------------------------
@api.route('/offers/latest', methods=['GET'])
def offers_latest():
    """Public: latest N offers (default 10)"""
    try:
        limit = int(request.args.get("limit", 10))
    except ValueError:
        limit = 10
    limit = max(1, min(limit, 50))
    rows = (
        db.session.execute(
            select(Offer).order_by(Offer.createdAt.desc()).limit(limit)
        ).scalars().all()
    )
    return jsonify([o.serialize() for o in rows]), 200


@api.route('/offers/<int:offer_id>', methods=['GET'])
def get_offer(offer_id):
    offer = _ensure_offer(offer_id)
    if not offer:
        return jsonify({"message": "offer not found"}), 404
    return jsonify(offer.serialize()), 200


@api.route('/offers', methods=['GET'])
@jwt_required()
def get_offers():
    rows = db.session.execute(db.select(Offer).order_by(Offer.createdAt.desc())).scalars().all()
    return jsonify([o.serialize() for o in rows]), 200


@api.route('/offers', methods=['POST'])
@jwt_required()
def create_offer():
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"message": "invalid token identity"}), 401

    role = _current_role()
    if role not in ("distributor", "admin"):
        return jsonify({"message": "only venues/distributors can create offers"}), 403

    data = request.get_json() or {}
    required = ("title", "city", "venueName", "description", "eventDate")
    if not all(k in data and data[k] for k in required):
        return jsonify({"message": "missing parameters", "required": list(required)}), 400

    distributor = db.session.get(User, user_id)
    if not distributor:
        return jsonify({"message": "distributor not found"}), 404

    dt = _parse_iso_dt(str(data["eventDate"]))
    if not dt:
        return jsonify({"message": "invalid eventDate, expected ISO 8601 like 2025-11-15T21:00"}), 400

    capacity = data.get("capacity", distributor.capacity)
    if capacity is None:
        return jsonify({"message": "capacity required (in payload or on distributor profile)"}), 400

    offer = Offer(
        distributorId=user_id,
        title=data["title"].strip(),
        description=data["description"].strip(),
        city=data["city"].strip(),
        venueName=data["venueName"].strip(),
        genre=(data.get("genre") or None),
        budget=(data.get("budget") or None),
        status=(data.get("status") or "open"),
        eventDate=dt,
        capacity=int(capacity)
    )
    db.session.add(offer)
    db.session.commit()
    return jsonify(offer.serialize()), 201

# -------------------------
# Step 2 — Matching workflow
# -------------------------

@api.route('/offers/<int:offer_id>/apply', methods=['POST'])
@jwt_required()
def apply_offer(offer_id):
    """
    Performer applies to an offer with a required 'rate' and optional 'message'.
    Body: { rate: number, message?: string }
    """
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"message": "invalid token"}), 401
    if _current_role() not in ("performer", "admin"):
        return jsonify({"message": "only performers can apply"}), 403

    offer = _ensure_offer(offer_id)
    if not offer:
        return jsonify({"message": "offer not found"}), 404
    if offer.status != "open":
        return jsonify({"message": "offer is not open"}), 400

    data = request.get_json() or {}
    if data.get("rate") in (None, ""):
        return jsonify({"message": "rate is required"}), 400
    try:
        rate = float(data["rate"])
        if rate < 0:
            raise ValueError()
    except Exception:
        return jsonify({"message": "invalid rate"}), 400

    message_txt = (data.get("message") or "").strip() or None

    # Upsert match (unique performerId + offerId)
    existing = db.session.scalar(
        select(Match).where(Match.performerId == user_id, Match.offerId == offer_id)
    )
    if existing:
        existing.rate = rate
        if message_txt:
            existing.message = message_txt
        existing.status = "pending"
        db.session.commit()
        return jsonify(existing.serialize()), 200

    m = Match(
        performerId=user_id,
        offerId=offer_id,
        status="pending",
        rate=rate,
        message=message_txt,
        chatApproved=False
    )
    db.session.add(m)
    db.session.commit()
    return jsonify(m.serialize()), 201


@api.route('/offers/<int:offer_id>/matches', methods=['GET'])
@jwt_required()
def list_offer_matches(offer_id):
    """
    Venue/admin can list all matches (applications) for the offer.
    """
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"message": "invalid token"}), 401
    role = _current_role()

    offer = _ensure_offer(offer_id)
    if not offer:
        return jsonify({"message": "offer not found"}), 404

    if not (role == "admin" or _is_offer_owner(user_id, offer)):
        return jsonify({"message": "forbidden"}), 403

    rows = db.session.execute(
        select(Match).where(Match.offerId == offer_id).order_by(Match.createdAt.desc())
    ).scalars().all()
    return jsonify([m.serialize() for m in rows]), 200


@api.route('/offers/<int:offer_id>/approve-chat', methods=['POST'])
@jwt_required()
def approve_chat(offer_id):
    """
    Venue/admin approves chat for a specific performer on this offer.
    Body: { performerId: number, approved?: boolean }  (default approved=True)
    """
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"message": "invalid token"}), 401
    role = _current_role()

    offer = _ensure_offer(offer_id)
    if not offer:
        return jsonify({"message": "offer not found"}), 404
    if not (role == "admin" or _is_offer_owner(user_id, offer)):
        return jsonify({"message": "forbidden"}), 403

    data = request.get_json() or {}
    try:
        performer_id = int(data.get("performerId"))
    except Exception:
        return jsonify({"message": "performerId required"}), 400
    approved = bool(data.get("approved", True))

    match = db.session.scalar(
        select(Match).where(Match.offerId == offer_id, Match.performerId == performer_id)
    )
    if not match:
        return jsonify({"message": "match not found"}), 404

    match.chatApproved = approved
    db.session.commit()
    return jsonify(match.serialize()), 200


@api.route('/offers/<int:offer_id>/accept', methods=['POST'])
@jwt_required()
def accept_performer(offer_id):
    """
    Venue/admin accepts a given performer -> marks their match accepted and rejects others.
    Body: { performerId: number }
    """
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"message": "invalid token"}), 401
    role = _current_role()

    offer = _ensure_offer(offer_id)
    if not offer:
        return jsonify({"message": "offer not found"}), 404
    if not (role == "admin" or _is_offer_owner(user_id, offer)):
        return jsonify({"message": "forbidden"}), 403

    data = request.get_json() or {}
    try:
        performer_id = int(data.get("performerId"))
    except Exception:
        return jsonify({"message": "performerId required"}), 400

    # accept one, reject others
    target = db.session.scalar(
        select(Match).where(Match.offerId == offer_id, Match.performerId == performer_id)
    )
    if not target:
        return jsonify({"message": "match not found"}), 404

    target.status = "accepted"
    offer.acceptedPerformerId = performer_id

    # reject the rest
    db.session.execute(
        update(Match)
        .where(Match.offerId == offer_id, Match.performerId != performer_id)
        .values(status="rejected")
    )
    db.session.commit()
    return jsonify({"offer": offer.serialize(), "accepted": target.serialize()}), 200


@api.route('/offers/<int:offer_id>/conclude', methods=['POST'])
@jwt_required()
def conclude_offer(offer_id):
    """
    Venue/admin marks the offer as concluded (closed).
    Optional body: { status: "closed" | "cancelled" }  (default "closed")
    """
    user_id = _current_user_id()
    if not user_id:
        return jsonify({"message": "invalid token"}), 401
    role = _current_role()

    offer = _ensure_offer(offer_id)
    if not offer:
        return jsonify({"message": "offer not found"}), 404
    if not (role == "admin" or _is_offer_owner(user_id, offer)):
        return jsonify({"message": "forbidden"}), 403

    data = request.get_json() or {}
    new_status = (data.get("status") or "closed").strip().lower()
    if new_status not in ("closed", "cancelled"):
        return jsonify({"message": "invalid status"}), 400

    offer.status = new_status
    db.session.commit()
    return jsonify(offer.serialize()), 200

# -------------------------
# Messages (with chat gating)
# -------------------------
@api.route('/offers/<int:offer_id>/messages', methods=['GET'])
@jwt_required()
def get_messages_for_offer(offer_id):
    try:
        user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"message": "invalid token identity"}), 401

    role = _role_from_claims()
    offer = db.session.get(Offer, offer_id)
    if not offer:
        return jsonify({"message": "offer not found"}), 404

    if not _can_view_or_send_messages(user_id, role, offer):
        return jsonify({"message": "chat not approved for this offer"}), 403

    rows = db.session.execute(
        select(Message).where(Message.offerId == offer_id).order_by(Message.createdAt.asc())
    ).scalars().all()
    return jsonify([m.serialize() for m in rows]), 200


@api.route('/offers/<int:offer_id>/messages', methods=['POST'])
@jwt_required()
def post_message_for_offer(offer_id):
    try:
        user_id = int(get_jwt_identity())
    except Exception:
        return jsonify({"message": "invalid token identity"}), 401

    role = _role_from_claims()
    offer = db.session.get(Offer, offer_id)
    if not offer:
        return jsonify({"message": "offer not found"}), 404

    data = request.get_json() or {}
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"message": "body is required"}), 400

    if not _can_view_or_send_messages(user_id, role, offer):
        return jsonify({"message": "chat not approved for this offer"}), 403

    msg = Message(offerId=offer.offerId, authorId=user_id, body=body)
    db.session.add(msg)
    db.session.commit()
    return jsonify(msg.serialize()), 201

# -------------------------
# Reviews
# -------------------------
@api.route('/users/<int:user_id>/reviews', methods=['GET'])
def get_reviews_for_user(user_id):
    rows = db.session.execute(
        select(Review).where(Review.ratedId == user_id).order_by(Review.createdAt.desc())
    ).scalars().all()
    return jsonify([r.serialize() for r in rows]), 200


@api.route('/reviews', methods=['POST'])
@jwt_required()
def create_review():
    data = request.get_json() or {}
    required = ("raterId", "ratedId", "score")
    if not all(k in data and data[k] is not None for k in required):
        return jsonify({"message": "raterId, ratedId and score are required"}), 400

    rater_id, rated_id, score = int(data["raterId"]), int(data["ratedId"]), int(data["score"])
    if rater_id == rated_id:
        return jsonify({"message": "you cannot review yourself"}), 400
    if score < 1 or score > 5:
        return jsonify({"message": "score must be between 1 and 5"}), 400

    if not db.session.get(User, rater_id) or not db.session.get(User, rated_id):
        return jsonify({"message": "rater or rated user not found"}), 404
    offer_id = data.get("offerId")
    if offer_id and not db.session.get(Offer, offer_id):
        return jsonify({"message": "offer not found"}), 404

    try:
        review = Review(
            raterId=rater_id,
            ratedId=rated_id,
            offerId=offer_id,
            score=score,
            comment=data.get("comment")
        )
        db.session.add(review)
        db.session.commit()
        return jsonify(review.serialize()), 201
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": "review already exists for this pair/offer"}), 409


@api.route('/reviews/<int:review_id>', methods=['DELETE'])
@jwt_required()
def delete_review(review_id):
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({"message": "review not found"}), 404
    db.session.delete(review)
    db.session.commit()
    return jsonify({"deleted": review_id}), 200

# -------------------------
# Latest users
# -------------------------
@api.route('/users/latest', methods=['GET'])
def users_latest():
    """
    GET /api/users/latest?role=distributor&limit=3
    role: "performer" | "distributor"
    limit: int (default 3, max 20)
    """
    role = _normalize_role(request.args.get("role"))
    try:
        limit = int(request.args.get("limit", 3))
    except ValueError:
        limit = 3
    limit = max(1, min(limit, 20))

    if role not in ("performer", "distributor"):
        return jsonify({"message": "invalid or missing role"}), 400

    rows = (
        db.session.execute(
            db.select(User)
              .where(User.role == role)
              .order_by(User.createdAt.desc())
              .limit(limit)
        ).scalars().all()
    )
    return jsonify([u.serialize() for u in rows]), 200
