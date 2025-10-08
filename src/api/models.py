from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import (
    String, Float, Integer, Numeric, DateTime, Text, ForeignKey,
    CheckConstraint, UniqueConstraint, Boolean
)
from datetime import datetime

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "user"
    userId: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(
        String(120), unique=True, nullable=False)
    password: Mapped[str] = mapped_column(nullable=False)
    # performer | distributor | admin
    role: Mapped[str] = mapped_column(String(), nullable=False)
    name: Mapped[str] = mapped_column(String(25), nullable=False)
    city: Mapped[str] = mapped_column(String(50), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(default=datetime.now)
    ratingAvg: Mapped[float] = mapped_column(
        Float(precision=2), nullable=True, default=0)
    ratingCount: Mapped[int] = mapped_column(Integer, nullable=True, default=0)
    avatarUrl: Mapped[str] = mapped_column(String(255), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, nullable=True)
    genre: Mapped[str] = mapped_column(String(80), nullable=True)
    slogan: Mapped[str] = mapped_column(String(140), nullable=True)
    bio: Mapped[str] = mapped_column(Text, nullable=True)
    musicians: Mapped[dict] = mapped_column(
        db.JSON, nullable=True)  # list[ {name, instrument} ]
    eventsFinalised: Mapped[int] = mapped_column(
        Integer, nullable=True, default=0)

    def serialize(self):
        return {
            "userId": self.userId,
            "email": self.email,
            "role": self.role,
            "name": self.name,
            "city": self.city,
            "createdAt": self.createdAt,
            "ratingAvg": self.ratingAvg,
            "ratingCount": self.ratingCount,
            "avatarUrl": self.avatarUrl,
            "capacity": self.capacity,
            "genre": self.genre,
            "slogan": self.slogan,
            "bio": self.bio,
            "musicians": self.musicians,
            "eventsFinalised": self.eventsFinalised,

        }


class Offer(db.Model):
    __tablename__ = "offers"
    offerId: Mapped[int] = mapped_column(primary_key=True)
    distributorId: Mapped[int] = mapped_column(
        ForeignKey("user.userId"), nullable=False)
    title: Mapped[str] = mapped_column(String(140), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(String(120), nullable=True)
    venueName: Mapped[str] = mapped_column(String(140), nullable=True)
    genre: Mapped[str] = mapped_column(String(80), nullable=True)
    budget: Mapped[float] = mapped_column(Numeric(10, 2), nullable=True)
    # open | closed | cancelled | concluded
    status: Mapped[str] = mapped_column(
        String(20), default="open", nullable=False)
    eventDate: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(default=datetime.now)

    # NEW: once venue accepts a performer, store it here
    acceptedPerformerId: Mapped[int | None] = mapped_column(
        ForeignKey("user.userId"), nullable=True
    )

    def serialize(self):
        return {
            "offerId": self.offerId,
            "distributorId": self.distributorId,
            "title": self.title,
            "description": self.description,
            "city": self.city,
            "venueName": self.venueName,
            "genre": self.genre,
            "budget": float(self.budget) if self.budget is not None else None,
            "status": self.status,
            "eventDate": self.eventDate,
            "capacity": self.capacity,
            "createdAt": self.createdAt,
            "acceptedPerformerId": self.acceptedPerformerId,
        }


class Match(db.Model):
    __tablename__ = "matches"
    __table_args__ = (
        UniqueConstraint("performerId", "offerId",
                         name="uq_match_performer_offer"),
    )

    matchId: Mapped[int] = mapped_column(primary_key=True)
    performerId: Mapped[int] = mapped_column(
        ForeignKey("user.userId"), nullable=False)
    offerId: Mapped[int] = mapped_column(
        ForeignKey("offers.offerId"), nullable=False)

    # pending | accepted | rejected | withdrawn
    status: Mapped[str] = mapped_column(
        String(20), default="pending", nullable=False)

    # performer’s proposed rate — required by business logic (nullable in DB for easy migration)
    rate: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    # venue must approve before chat is open
    chatApproved: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False)

    message: Mapped[str] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(default=datetime.now)

    def serialize(self):
        return {
            "matchId": self.matchId,
            "performerId": self.performerId,
            "offerId": self.offerId,
            "status": self.status,
            "rate": float(self.rate) if self.rate is not None else None,
            "chatApproved": self.chatApproved,
            "message": self.message,
            "createdAt": self.createdAt,
        }


class Message(db.Model):
    __tablename__ = "messages"

    messageId: Mapped[int] = mapped_column(primary_key=True)
    offerId: Mapped[int] = mapped_column(
        ForeignKey("offers.offerId"), nullable=False)
    authorId: Mapped[int] = mapped_column(
        ForeignKey("user.userId"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(default=datetime.now)

    def serialize(self):
        return {
            "messageId": self.messageId,
            "offerId": self.offerId,
            "authorId": self.authorId,
            "body": self.body,
            "createdAt": self.createdAt,
        }


class Review(db.Model):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("score >= 1 AND score <= 5",
                        name="ck_review_score_range"),
        UniqueConstraint("raterId", "ratedId", "offerId",
                         name="uq_review_pair_offer"),
    )

    reviewId: Mapped[int] = mapped_column(primary_key=True)
    raterId: Mapped[int] = mapped_column(
        ForeignKey("user.userId"), nullable=False)
    ratedId: Mapped[int] = mapped_column(
        ForeignKey("user.userId"), nullable=False)
    offerId: Mapped[int] = mapped_column(
        ForeignKey("offers.offerId"), nullable=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(default=datetime.now)

    def serialize(self):
        return {
            "reviewId": self.reviewId,
            "raterId": self.raterId,
            "ratedId": self.ratedId,
            "offerId": self.offerId,
            "score": self.score,
            "comment": self.comment,
            "createdAt": self.createdAt,
        }
