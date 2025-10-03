"""
This module takes care of starting the API Server, Loading the DB and Adding the endpoints
"""
from flask import Flask, request, jsonify, Blueprint
from flask_cors import CORS
from sqlalchemy import select, and_
from sqlalchemy.exc import IntegrityError
from datetime import datetime
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

from api.models import db, User, Offer, Match, Message, Review

api = Blueprint('api', __name__)
CORS(api)

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

# -------------------------
# auth
# -------------------------
def role_required_fields(role):
    # performer, venue (distributor), admin
    if role == "admin":
        return ["email", "password"]
    if role == "performer":
        return ["email", "password", "name", "city"]
    if role == "venue" or role == "distributor":
        return ["email", "password", "name", "city", "capacity", "venueName"]
    return ["email", "password"]  # fallback
# -------------------------
# Users
# -------------------------
@api.route('/users', methods=['GET'])
def get_users():
    rows = db.session.execute(db.select(User)).scalars().all()
    return jsonify([u.serialize() for u in rows]), 200

@api.route('/new-user', methods=['POST'])
def post_users():
    data = request.get_json() or {}
    required = ("email", "password", "role", "name", "city")
    if not all(k in data and data[k] for k in required):
        return jsonify({"message": "missing parameters"}), 400

    email = data["email"].strip().lower()
    if db.session.scalar(select(User).where(User.email == email)):
        return jsonify({"message": "email already registered"}), 409

    try:
        user = User(
            email=email,
            password=data["password"],
            role=data["role"].strip(),
            name=data["name"].strip(),
            city=data["city"].strip(),
            avatarUrl=data.get("avatarUrl"),
            capacity=data.get("capacity")  # optional on signup
        )
        db.session.add(user)
        db.session.commit()
        return jsonify(user.serialize()), 201
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": "email already registered"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "unexpected error", "detail": str(e)}), 500

@api.route('/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "user not found"}), 404
    return jsonify(user.serialize()), 200

# Using PUT per your preference (course style)
@api.route('/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"message": "user not found"}), 404

    data = request.get_json() or {}
    # Only allow updates to these fields
    allowed = ("email", "name", "city", "role", "avatarUrl", "capacity")
    for key in allowed:
        if key in data:
            setattr(user, key, data[key])

    try:
        db.session.commit()
        return jsonify(user.serialize()), 200
    except IntegrityError:
        db.session.rollback()
        return jsonify({"message": "conflict updating user"}), 409
#--------------------------
# ---- User-scoped offers ----
@api.route('/users/<int:user_id>/offers/created', methods=['GET'])
def offers_created_by_user(user_id):
    # Offers where this user is the distributor
    rows = db.session.execute(
        select(Offer).where(Offer.distributorId == user_id).order_by(Offer.createdAt.desc())
    ).scalars().all()
    return jsonify([o.serialize() for o in rows]), 200


@api.route('/users/<int:user_id>/offers/applied', methods=['GET'])
def offers_user_applied(user_id):
    """
    Offers this user (as performer) has interacted with via Matches.
    We return offers with the match status included.
    """
    q = (
        select(Offer, Match.status.label("match_status"), Match.matchId.label("match_id"))
        .join(Match, Match.offerId == Offer.offerId)
        .where(Match.performerId == user_id)
        .order_by(Offer.createdAt.desc())
    )
    rows = db.session.execute(q).all()

    # Flatten so the frontend gets offer fields + match info
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
@api.route('/offers', methods=['GET'])
def get_offers():
    rows = db.session.execute(db.select(Offer).order_by(Offer.createdAt.desc())).scalars().all()
    return jsonify([o.serialize() for o in rows]), 200

@api.route('/offers', methods=['POST'])
def create_offer():
    data = request.get_json() or {}
    required = ("distributorId", "title", "city", "venueName", "description", "eventDate")
    if not all(k in data and data[k] for k in required):
        return jsonify({"message": "missing parameters", "required": list(required)}), 400

    distributor_id = int(data["distributorId"])
    distributor = db.session.get(User, distributor_id)
    if not distributor:
        return jsonify({"message": "distributor not found"}), 404

    dt = _parse_iso_dt(str(data["eventDate"]))
    if not dt:
        return jsonify({"message": "invalid eventDate, expected ISO 8601 like 2025-11-15T21:00"}), 400

    # capacity: prefer payload, else distributor profile capacity
    capacity = data.get("capacity", distributor.capacity)
    if capacity is None:
        return jsonify({"message": "capacity required (in payload or on distributor profile)"}), 400

    offer = Offer(
        distributorId=distributor_id,
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
# Messages (kept from before)
# -------------------------
@api.route('/offers/<int:offer_id>/messages', methods=['GET'])
def get_messages_for_offer(offer_id):
    rows = db.session.execute(
        select(Message).where(Message.offerId == offer_id).order_by(Message.createdAt.asc())
    ).scalars().all()
    return jsonify([m.serialize() for m in rows]), 200

@api.route('/offers/<int:offer_id>/messages', methods=['POST'])
def post_message_for_offer(offer_id):
    data = request.get_json() or {}
    author_id = data.get("authorId")
    body = data.get("body")
    if not author_id or not body:
        return jsonify({"message": "authorId and body are required"}), 400

    offer = db.session.get(Offer, offer_id)
    author = db.session.get(User, author_id)
    if not offer or not author:
        return jsonify({"message": "offer or author not found"}), 404

    msg = Message(offerId=offer_id, authorId=author_id, body=body)
    db.session.add(msg)
    db.session.commit()
    return jsonify(msg.serialize()), 201

# -------------------------
# Reviews (kept from before)
# -------------------------
@api.route('/users/<int:user_id>/reviews', methods=['GET'])
def get_reviews_for_user(user_id):
    rows = db.session.execute(
        select(Review).where(Review.ratedId == user_id).order_by(Review.createdAt.desc())
    ).scalars().all()
    return jsonify([r.serialize() for r in rows]), 200

@api.route('/reviews', methods=['POST'])
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
def delete_review(review_id):
    review = db.session.get(Review, review_id)
    if not review:
        return jsonify({"message": "review not found"}), 404
    db.session.delete(review)
    db.session.commit()
    return jsonify({"deleted": review_id}), 200

#latest users
@api.route('/users/latest', methods=['GET'])
def users_latest():
    """
    GET /api/users/latest?role=distributor&limit=3
    role: "performer" | "distributor"
    limit: int (default 3, max 20)
    """
    role = (request.args.get("role") or "").strip().lower()
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
