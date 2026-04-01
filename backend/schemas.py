"""Pydantic request/response-schemas for Stemmer fra Norddjurs."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class CitizenRegister(BaseModel):
    email: EmailStr
    password: str


class CitizenLogin(BaseModel):
    email: str
    password: str


class AdminLogin(BaseModel):
    email: str
    password: str


class ConsentUpdate(BaseModel):
    consent_given: bool


class MetadataUpdate(BaseModel):
    age_group: Optional[str] = None
    area: Optional[str] = None
    role: Optional[str] = None


class QuestionCreate(BaseModel):
    theme_id: Optional[str] = None
    forloeb_id: Optional[str] = None
    title: str
    body: str
    is_active: bool = True
    allow_followup: bool = True
    followup_prompt: str = ""
    sort_order: int = 0


class QuestionUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    theme_id: Optional[str] = None
    is_active: Optional[bool] = None
    allow_followup: Optional[bool] = None
    followup_prompt: Optional[str] = None
    sort_order: Optional[int] = None


class ThemeCreate(BaseModel):
    name: str
    icon: str = "📋"
    sort_order: int = 99


class SubmitResponse(BaseModel):
    question_id: str
    session_id: str
    text_content: str
    response_type: str = "text"
    is_followup: bool = False
    parent_response_id: Optional[str] = None
    followup_question_text: Optional[str] = None


class FollowupRequest(BaseModel):
    answer: str
    question_id: str
    theme_name: str
    question_text: str


class AISettingsUpdate(BaseModel):
    system_prompt: Optional[str] = None
    perspective_threshold: Optional[int] = None


class AnalysisRequest(BaseModel):
    analysis_type: str  # sentiment, themes, quotes, summary
    theme_id: Optional[str] = None
    question_id: Optional[str] = None


class AreaCreate(BaseModel):
    name: str


class ModerationRuleCreate(BaseModel):
    rule_type: str = "word"  # word, regex
    pattern: str
    description: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    new_password: str
    confirm_password: str


class ForloebCreate(BaseModel):
    title: str
    description: Optional[str] = None
    slug: str
    mode: str = "themes"   # 'themes' | 'questions'
    status: str = "draft"  # 'draft' | 'published'
    image_url: Optional[str] = None
    allow_citizen_questions: bool = False
    citizen_question_requires_approval: bool = True
    is_active: bool = True
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    sort_order: int = 0


class ForloebUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    slug: Optional[str] = None
    mode: Optional[str] = None
    status: Optional[str] = None
    image_url: Optional[str] = None
    allow_citizen_questions: Optional[bool] = None
    citizen_question_requires_approval: Optional[bool] = None
    is_active: Optional[bool] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    sort_order: Optional[int] = None


class ReorderItem(BaseModel):
    id: str
    sort_order: int


class QuestionFork(BaseModel):
    theme_id: Optional[str] = None
    forloeb_id: Optional[str] = None


class CitizenQuestionCreate(BaseModel):
    body: str
    is_anonymous: bool = False
