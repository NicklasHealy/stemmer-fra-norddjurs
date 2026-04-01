"""Unit tests for backend/utils.py — password-validering, moderation og temp-kodeord."""

import uuid
import pytest
from unittest.mock import MagicMock

from utils import validate_citizen_password, check_moderation, generate_temp_password


class TestValidateCitizenPassword:
    def test_valid_password(self):
        assert validate_citizen_password("Abcde1!x") is None

    def test_too_short(self):
        err = validate_citizen_password("Ab1!")
        assert err is not None
        assert "8" in err

    def test_missing_uppercase(self):
        err = validate_citizen_password("abcde1!x")
        assert err is not None
        assert "stort" in err.lower()

    def test_missing_lowercase(self):
        err = validate_citizen_password("ABCDE1!X")
        assert err is not None
        assert "lille" in err.lower()

    def test_missing_digit(self):
        err = validate_citizen_password("Abcdefgh!")
        assert err is not None
        assert "tal" in err.lower()

    def test_exactly_minimum_length(self):
        assert validate_citizen_password("Abcde1!x") is None


class TestGenerateTempPassword:
    def test_meets_password_requirements(self):
        for _ in range(20):
            pw = generate_temp_password()
            assert validate_citizen_password(pw) is None, f"Temp-kodeord opfylder ikke krav: {pw}"

    def test_minimum_length(self):
        pw = generate_temp_password()
        assert len(pw) >= 8

    def test_uniqueness(self):
        passwords = {generate_temp_password() for _ in range(10)}
        assert len(passwords) > 1


class TestCheckModeration:
    def _make_db_with_rules(self, rules):
        """Hjælper der laver et mock-db med ModerationRule-objekter."""
        mock_db = MagicMock()
        mock_rules = []
        for rule_type, pattern in rules:
            rule = MagicMock()
            rule.rule_type = rule_type
            rule.pattern = pattern
            rule.is_active = True
            mock_rules.append(rule)
        mock_db.query.return_value.filter.return_value.all.return_value = mock_rules
        return mock_db

    def test_no_rules_returns_false(self):
        db = self._make_db_with_rules([])
        assert check_moderation("en helt normal tekst", db) is False

    def test_word_rule_matches(self):
        db = self._make_db_with_rules([("word", "idiot")])
        assert check_moderation("du er en idiot", db) is True

    def test_word_rule_case_insensitive(self):
        db = self._make_db_with_rules([("word", "idiot")])
        assert check_moderation("du er en IDIOT", db) is True

    def test_word_rule_no_match(self):
        db = self._make_db_with_rules([("word", "idiot")])
        assert check_moderation("en positiv besked", db) is False

    def test_regex_rule_matches(self):
        db = self._make_db_with_rules([("regex", r"\bdræb\b")])
        assert check_moderation("dræb alle", db) is True

    def test_regex_rule_no_match(self):
        db = self._make_db_with_rules([("regex", r"\bdræb\b")])
        assert check_moderation("hjælp alle", db) is False

    def test_short_text_returns_false(self):
        db = self._make_db_with_rules([("word", "idiot")])
        assert check_moderation("abc", db) is False

    def test_empty_text_returns_false(self):
        db = self._make_db_with_rules([("word", "idiot")])
        assert check_moderation("", db) is False
        assert check_moderation(None, db) is False
