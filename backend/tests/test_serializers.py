"""Unit tests for backend/serializers.py."""

import uuid
from datetime import datetime
from unittest.mock import MagicMock

from serializers import citizen_dict, question_dict, response_dict, meta_dict, rule_dict


def _make_citizen(**kwargs):
    c = MagicMock()
    c.id = str(uuid.uuid4())
    c.email = "test@example.com"
    c.consent_given = True
    c.consent_version = 1
    c.frozen = False
    c.must_change_password = False
    c.created_at = datetime(2025, 1, 1)
    for k, v in kwargs.items():
        setattr(c, k, v)
    return c


def _make_question(**kwargs):
    q = MagicMock()
    q.id = str(uuid.uuid4())
    q.theme_id = str(uuid.uuid4())
    q.forloeb_id = None
    q.title = "Spørgsmålstitel"
    q.body = "Spørgsmålstekst"
    q.is_active = True
    q.allow_followup = True
    q.followup_prompt = ""
    q.sort_order = 1
    q.is_citizen_submitted = False
    q.submitted_by_citizen_id = None
    q.is_approved = True
    q.is_anonymous = False
    for k, v in kwargs.items():
        setattr(q, k, v)
    return q


def _make_response(**kwargs):
    r = MagicMock()
    r.id = str(uuid.uuid4())
    r.question_id = str(uuid.uuid4())
    r.citizen_id = str(uuid.uuid4())
    r.session_id = "sess123"
    r.response_type = "text"
    r.text_content = "En besvarelse"
    r.audio_file_path = None
    r.is_followup = False
    r.parent_response_id = None
    r.followup_question_text = None
    r.is_excluded = False
    r.is_flagged = False
    r.created_at = datetime(2025, 1, 1)
    for k, v in kwargs.items():
        setattr(r, k, v)
    return r


class TestCitizenDict:
    def test_required_fields_present(self):
        d = citizen_dict(_make_citizen())
        for field in ("id", "email", "consent_given", "consent_version", "frozen", "must_change_password", "created_at"):
            assert field in d, f"Felt mangler: {field}"

    def test_created_at_is_isoformat(self):
        d = citizen_dict(_make_citizen())
        assert isinstance(d["created_at"], str)
        assert "2025" in d["created_at"]

    def test_frozen_field(self):
        d = citizen_dict(_make_citizen(frozen=True))
        assert d["frozen"] is True


class TestQuestionDict:
    def test_required_fields_present(self):
        d = question_dict(_make_question())
        for field in ("id", "theme_id", "title", "body", "is_active", "allow_followup", "sort_order"):
            assert field in d, f"Felt mangler: {field}"

    def test_citizen_submitted_fields(self):
        d = question_dict(_make_question(is_citizen_submitted=True, is_approved=False))
        assert d["is_citizen_submitted"] is True
        assert d["is_approved"] is False


class TestResponseDict:
    def test_required_fields_present(self):
        d = response_dict(_make_response())
        for field in ("id", "question_id", "session_id", "response_type", "text_content",
                      "is_followup", "is_excluded", "is_flagged", "created_at"):
            assert field in d, f"Felt mangler: {field}"

    def test_created_at_is_isoformat(self):
        d = response_dict(_make_response())
        assert isinstance(d["created_at"], str)


class TestMetaDict:
    def test_returns_none_for_none(self):
        assert meta_dict(None) is None

    def test_returns_dict_with_fields(self):
        m = MagicMock()
        m.age_group = "30-39"
        m.area = "Grenaa"
        m.role = None
        d = meta_dict(m)
        assert d["age_group"] == "30-39"
        assert d["area"] == "Grenaa"


class TestRuleDict:
    def test_required_fields_present(self):
        r = MagicMock()
        r.id = str(uuid.uuid4())
        r.rule_type = "word"
        r.pattern = "idiot"
        r.description = "Bandeord"
        r.is_active = True
        r.created_at = datetime(2025, 1, 1)
        d = rule_dict(r)
        for field in ("id", "rule_type", "pattern", "description", "is_active", "created_at"):
            assert field in d, f"Felt mangler: {field}"
