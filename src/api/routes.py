from datetime import datetime
import os
from flask import request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity, get_jwt
from sqlalchemy import select, update as sa_update, delete as sa_delete, or_
from sqlalchemy.exc import IntegrityError

# Use the SINGLE shared blueprint from api.__init__
from . import api_bp as api

# Use the SINGLE db instance defined in models.py
from api.models import db, User, Offer, Match, Message, Review
from .utils import hash_password, verify_password


# We store roles as: performer | distributor | admin
# (UI can label "distributor" as "venue")
ALLOWED_ROLES = {"performer", "distributor", "admin"}

# -------------------------
# Utilities
# -------------------------

def _parse_iso_dt(s: str):
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
    if role == "admin":
        return True
    if role in ("distributor", "venue"):
        return offer.distributorId == user_id
    if role == "performer":
        if offer.acceptedPerformerId and int(offer.acceptedPerformerId) == int(user_id):
            return True
        m = db.session.execute(
            select(Match).where(Match.offerId == offer.offerId, Match.performerId == user_id)
        ).scalar_one_or_none()
        return bool(m and m.chatApproved)
    return False

def _recompute_user_ratings(user_id: int):
    """Recalculate ratingAvg and ratingCount for a user."""
    rows = db.session.execute(
        select(Review.score).where(Review.ratedId == user_id)
    ).scalars().all()
    count = len(rows)
    avg = (sum(rows) / count) if count else 0.0
    u = db.session.get(User, user_id)
    if u:
        u.ratingCount = count
        u.ratingAvg = round(float(avg), 2)
        db.session.commit()

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
    allowed = ("email", "name", "city", "role", "avatarUrl", "capacity",
               "genre", "slogan", "bio", "musicians", "eventsFinalised")
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

# delete user (manual cascade)
@api.route('/users/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    current_id = _current_user_id()
    role = _current_role()

    if not current_id:
        return jsonify({"message": "invalid token"}), 401

    if role != "admin" and current_id != user_id:
        return jsonify({"message": "forbidden"}), 403

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "user not found"}), 404

    if user.role == "admin":
        admin_count = db.session.query(User).filter_by(role="admin").count()
        if admin_count <= 1:
            return jsonify({"message": "cannot delete the last admin"}), 409

    try:
        offer_ids = db.session.execute(
            select(Offer.offerId).where(Offer.distributorId == user_id)
        ).scalars().all()

        if offer_ids:
            db.session.execute(sa_delete(Message).where(Message.offerId.in_(offer_ids)))
        db.session.execute(sa_delete(Message).where(Message.authorId == user_id))

        if offer_ids:
            db.session.execute(sa_delete(Match).where(Match.offerId.in_(offer_ids)))
        db.session.execute(sa_delete(Match).where(Match.performerId == user_id))

        cond = or_(Review.raterId == user_id, Review.ratedId == user_id)
        if offer_ids:
            cond = or_(cond, Review.offerId.in_(offer_ids))
        db.session.execute(sa_delete(Review).where(cond))

        db.session.execute(
            sa_update(Offer)
            .where(Offer.acceptedPerformerId == user_id)
            .values(acceptedPerformerId=None)
        )

        if offer_ids:
            db.session.execute(sa_delete(Offer).where(Offer.offerId.in_(offer_ids)))

        db.session.delete(user)
        db.session.commit()
        return ("", 204)

    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "failed to delete user", "detail": str(e)}), 500

# -------------------------
# User-scoped offers
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
# Offers
# -------------------------

@api.route('/offers/latest', methods=['GET'])
def offers_latest():
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
# Matching workflow
# -------------------------

@api.route('/offers/<int:offer_id>/apply', methods=['POST'])
@jwt_required()
def apply_offer(offer_id):
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

    target = db.session.scalar(
        select(Match).where(Match.offerId == offer_id, Match.performerId == performer_id)
    )
    if not target:
        return jsonify({"message": "match not found"}), 404

    target.status = "accepted"
    offer.acceptedPerformerId = performer_id

    # reject the rest (BUGFIX: use sa_update)
    db.session.execute(
        sa_update(Match)
        .where(Match.offerId == offer_id, Match.performerId != performer_id)
        .values(status="rejected")
    )
    db.session.commit()
    return jsonify({"offer": offer.serialize(), "accepted": target.serialize()}), 200

@api.route('/offers/<int:offer_id>/conclude', methods=['POST'])
@jwt_required()
def conclude_offer(offer_id):
    """
    Venue/admin marks the offer as concluded (closed) or cancelled.
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
# Reviews (bilateral, post-conclusion)
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
    # required
    try:
        rater_id = int(data.get("raterId"))
        rated_id = int(data.get("ratedId"))
        offer_id = int(data.get("offerId"))
        score = int(data.get("score"))
    except Exception:
        return jsonify({"message": "raterId, ratedId, offerId, score are required"}), 400

    if score < 1 or score > 5:
        return jsonify({"message": "score must be between 1 and 5"}), 400
    if rater_id == rated_id:
        return jsonify({"message": "you cannot review yourself"}), 400

    # auth: rater must match token identity or be admin
    current_id = _current_user_id()
    role = _current_role()
    if not current_id:
        return jsonify({"message": "invalid token"}), 401
    if role != "admin" and current_id != rater_id:
        return jsonify({"message": "forbidden"}), 403

    # offer must exist & be closed
    offer = db.session.get(Offer, offer_id)
    if not offer:
        return jsonify({"message": "offer not found"}), 404
    if (offer.status or "").lower() != "closed":
        return jsonify({"message": "reviews allowed only after offer is closed"}), 409

    # only accepted performer & distributor can review each other
    venue_id = offer.distributorId
    perf_id = offer.acceptedPerformerId
    if not venue_id or not perf_id:
        return jsonify({"message": "no accepted performer for this offer"}), 409

    is_valid_pair = (
        (rater_id == venue_id and rated_id == perf_id) or
        (rater_id == perf_id and rated_id == venue_id)
    )
    if not is_valid_pair:
        return jsonify({"message": "you can only review your counterpart on this offer"}), 403

    comment = (data.get("comment") or "").strip() or None

    try:
        review = Review(
            raterId=rater_id,
            ratedId=rated_id,
            offerId=offer_id,
            score=score,
            comment=comment
        )
        db.session.add(review)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": "you already reviewed this user for this offer"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "failed to create review", "detail": str(e)}), 500

    # update aggregates on rated user
    _recompute_user_ratings(rated_id)
    return jsonify(review.serialize()), 201

@api.route('/reviews/<int:review_id>', methods=['DELETE'])
@jwt_required()
def delete_review(review_id):
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({"message": "review not found"}), 404
    rated_id = review.ratedId
    db.session.delete(review)
    db.session.commit()
    _recompute_user_ratings(rated_id)
    return jsonify({"deleted": review_id}), 200

# -------------------------
# Latest users
# -------------------------

@api.route('/users/latest', methods=['GET'])
def users_latest():
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
