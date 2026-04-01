"""SQLAlchemy modeller for Stemmer fra Norddjus."""

import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Float, DateTime,
    ForeignKey, Index, Enum as SAEnum, JSON
)
from sqlalchemy.orm import relationship
from database import Base


def new_uuid():
    return str(uuid.uuid4())


class Forloeb(Base):
    """Forløb (projekt) — det øverste lag i hierarkiet over temaer/spørgsmål."""
    __tablename__ = "forloeb"

    id = Column(String, primary_key=True, default=new_uuid)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    slug = Column(String(100), unique=True, nullable=False)
    mode = Column(String(20), default="themes")          # 'themes' | 'questions'
    allow_citizen_questions = Column(Boolean, default=False)
    citizen_question_requires_approval = Column(Boolean, default=True)
    status = Column(String(20), default="draft")     # 'draft' | 'published'
    image_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    themes = relationship("Theme", back_populates="forloeb")
    direct_questions = relationship(
        "Question",
        primaryjoin="Question.forloeb_id == Forloeb.id",
        foreign_keys="[Question.forloeb_id]",
        back_populates="forloeb",
    )


class Theme(Base):
    __tablename__ = "themes"
    __table_args__ = (
        Index("ix_theme_forloeb_id", "forloeb_id"),
    )

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String(200), nullable=False)
    icon = Column(String(10), default="📋")
    sort_order = Column(Integer, default=0)
    forloeb_id = Column(String, ForeignKey("forloeb.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    questions = relationship("Question", back_populates="theme")
    forloeb = relationship("Forloeb", back_populates="themes")


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        Index("ix_question_theme_id", "theme_id"),
        Index("ix_question_forloeb_id", "forloeb_id"),
    )

    id = Column(String, primary_key=True, default=new_uuid)
    theme_id = Column(String, ForeignKey("themes.id"), nullable=True)
    forloeb_id = Column(String, ForeignKey("forloeb.id"), nullable=True)
    title = Column(String(300), nullable=False)
    body = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    allow_followup = Column(Boolean, default=True)
    followup_prompt = Column(Text, default="")
    sort_order = Column(Integer, default=0)
    is_citizen_submitted = Column(Boolean, default=False)
    submitted_by_citizen_id = Column(String, ForeignKey("citizens.id", ondelete="SET NULL"), nullable=True)
    is_approved = Column(Boolean, default=True)
    is_anonymous = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    theme = relationship("Theme", back_populates="questions")
    forloeb = relationship("Forloeb", foreign_keys=[forloeb_id], back_populates="direct_questions")
    responses = relationship("Response", back_populates="question")
    submitted_by = relationship("Citizen", foreign_keys=[submitted_by_citizen_id])


class Citizen(Base):
    __tablename__ = "citizens"

    id = Column(String, primary_key=True, default=new_uuid)
    email = Column(String(320), unique=True, nullable=False, index=True)
    password_hash = Column(String(200), nullable=False)
    consent_given = Column(Boolean, default=False)
    consent_given_at = Column(DateTime, nullable=True)
    consent_version = Column(Integer, default=1, nullable=False)
    frozen = Column(Boolean, default=False, nullable=False)
    must_change_password = Column(Boolean, default=False, nullable=False)
    temp_password_expires = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    responses = relationship("Response", back_populates="citizen", cascade="all, delete-orphan")
    citizen_metadata = relationship("ResponseMetadata", back_populates="citizen", cascade="all, delete-orphan", uselist=False)
    consent_logs = relationship("ConsentLog", back_populates="citizen", cascade="all, delete-orphan")


class Response(Base):
    __tablename__ = "responses"
    __table_args__ = (
        Index("ix_response_citizen_id", "citizen_id"),
        Index("ix_response_question_id", "question_id"),
        Index("ix_response_created_at", "created_at"),
    )

    id = Column(String, primary_key=True, default=new_uuid)
    question_id = Column(String, ForeignKey("questions.id"), nullable=False)
    citizen_id = Column(String, ForeignKey("citizens.id", ondelete="CASCADE"), nullable=True)
    session_id = Column(String(100), nullable=False, index=True)
    response_type = Column(String(20), default="text")  # text, audio, video
    text_content = Column(Text, nullable=True)
    audio_file_path = Column(String(500), nullable=True)
    media_duration_seconds = Column(Integer, nullable=True)
    is_followup = Column(Boolean, default=False)
    parent_response_id = Column(String, ForeignKey("responses.id"), nullable=True)
    followup_question_text = Column(Text, nullable=True)
    is_excluded = Column(Boolean, default=False, index=True)
    is_flagged = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    question = relationship("Question", back_populates="responses")
    citizen = relationship("Citizen", back_populates="responses")
    parent_response = relationship("Response", remote_side=[id])


class ResponseMetadata(Base):
    __tablename__ = "response_metadata"

    id = Column(String, primary_key=True, default=new_uuid)
    citizen_id = Column(String, ForeignKey("citizens.id", ondelete="CASCADE"), unique=True, nullable=True)
    session_id = Column(String(100), nullable=True)
    age_group = Column(String(20), nullable=True)
    area = Column(String(100), nullable=True)
    role = Column(String(100), nullable=True)
    device_type = Column(String(20), nullable=True)
    user_agent = Column(String(500), nullable=True)
    time_spent_seconds = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    citizen = relationship("Citizen", back_populates="citizen_metadata")


class AnalysisCache(Base):
    __tablename__ = "analysis_cache"
    __table_args__ = (
        Index("ix_analysis_cache_question_id", "question_id"),
        Index("ix_analysis_cache_theme_id", "theme_id"),
    )

    id = Column(String, primary_key=True, default=new_uuid)
    question_id = Column(String, ForeignKey("questions.id"), nullable=True)
    theme_id = Column(String, ForeignKey("themes.id"), nullable=True)
    analysis_type = Column(String(50), nullable=False)  # themes, sentiment, quotes, wordcloud, summary
    result_json = Column(JSON, nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow)
    response_count_at_generation = Column(Integer, default=0)


class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(String, primary_key=True, default=new_uuid)
    email = Column(String(320), unique=True, nullable=False)
    password_hash = Column(String(200), nullable=False)
    name = Column(String(200), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AISettings(Base):
    __tablename__ = "ai_settings"

    id = Column(String, primary_key=True, default="default")
    system_prompt = Column(Text, nullable=False)
    perspective_threshold = Column(Integer, default=30)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Area(Base):
    __tablename__ = "areas"

    id = Column(String(36), primary_key=True, default=new_uuid)
    name = Column(String(100), unique=True, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class ModerationRule(Base):
    __tablename__ = "moderation_rules"

    id = Column(String, primary_key=True, default=new_uuid)
    rule_type = Column(String(20), default="word")  # word, regex
    pattern = Column(String(500), nullable=False)
    description = Column(String(300), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class ConsentLog(Base):
    __tablename__ = "consent_logs"

    id = Column(String, primary_key=True, default=new_uuid)
    citizen_id = Column(String, ForeignKey("citizens.id", ondelete="CASCADE"), nullable=False, index=True)
    consent_given = Column(Boolean, nullable=False)
    consent_version = Column(Integer, nullable=False, default=1)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    citizen = relationship("Citizen", back_populates="consent_logs")


class PasswordResetLog(Base):
    __tablename__ = "password_reset_log"

    id = Column(String, primary_key=True, default=new_uuid)
    admin_user_id = Column(String, ForeignKey("admin_users.id"), nullable=False)
    target_citizen_id = Column(String, ForeignKey("citizens.id", ondelete="CASCADE"), nullable=False, index=True)
    reset_at = Column(DateTime, default=datetime.utcnow)
    temp_password_expires = Column(DateTime, nullable=False)

    admin = relationship("AdminUser")
    citizen = relationship("Citizen")
