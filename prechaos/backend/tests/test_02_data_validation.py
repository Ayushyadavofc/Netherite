"""Data validation tests for PreChaos backend."""
from __future__ import annotations

import pytest
from fastapi import status


class TestUserIdValidation:
    """Tests for user_id validation."""

    def test_user_id_valid_patterns(self, test_client, auth_headers, valid_collect_payload):
        """Test valid user_id patterns are accepted."""
        valid_ids = [
            "test-user",
            "test-user-123",
            "user_123",
            "user:123",
            "a" * 64,  # Max length
        ]
        for user_id in valid_ids:
            payload = {**valid_collect_payload, "user_id": user_id}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            assert response.status_code == status.HTTP_200_OK, f"Failed for user_id: {user_id}"

    def test_user_id_invalid_characters(self, test_client, auth_headers, valid_collect_payload):
        """Test invalid characters in user_id are rejected."""
        invalid_ids = [
            "test user",  # Space
            "test$user",  # Dollar sign
            "test@user",  # At sign
            "test!user",  # Exclamation
            "a" * 65,  # Too long
        ]
        for user_id in invalid_ids:
            payload = {**valid_collect_payload, "user_id": user_id}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY, f"Should reject: {user_id}"

    def test_user_id_empty(self, test_client, auth_headers, valid_collect_payload):
        """Test empty user_id is rejected."""
        payload = {**valid_collect_payload, "user_id": ""}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestSessionIdValidation:
    """Tests for session_id validation."""

    def test_session_id_valid_patterns(self, test_client, auth_headers, valid_collect_payload):
        """Test valid session_id patterns are accepted."""
        valid_ids = [
            "session-123",
            "session_456",
            "session:789",
            "a" * 128,  # Max length
        ]
        for session_id in valid_ids:
            payload = {**valid_collect_payload, "session_id": session_id}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            assert response.status_code == status.HTTP_200_OK, f"Failed for session_id: {session_id}"

    def test_session_id_invalid_patterns(self, test_client, auth_headers, valid_collect_payload):
        """Test invalid session_id patterns are rejected."""
        invalid_ids = [
            "",  # Empty
            "a" * 129,  # Too long
        ]
        for session_id in invalid_ids:
            payload = {**valid_collect_payload, "session_id": session_id}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestTimestampValidation:
    """Tests for timestamp validation."""

    def test_timestamp_valid_range(self, test_client, auth_headers, valid_collect_payload):
        """Test timestamps in valid range (2000-2100) are accepted."""
        valid_timestamps = [
            946684800000,  # Jan 1, 2000
            1700000000000,  # Some date in 2023
            4102444800000,  # Jan 1, 2100
        ]
        for ts in valid_timestamps:
            events = [{**valid_collect_payload["events"][0], "timestamp": ts}]
            payload = {**valid_collect_payload, "events": events}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            assert response.status_code == status.HTTP_200_OK, f"Failed for timestamp: {ts}"

    def test_timestamp_before_2000(self, test_client, auth_headers, valid_collect_payload):
        """Test timestamp before year 2000 is rejected."""
        payload = {**valid_collect_payload, "events": [
            {**valid_collect_payload["events"][0], "timestamp": 946684799999}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_timestamp_after_2100(self, test_client, auth_headers, valid_collect_payload):
        """Test timestamp after year 2100 is rejected."""
        payload = {**valid_collect_payload, "events": [
            {**valid_collect_payload["events"][0], "timestamp": 4102444800001}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestEventsValidation:
    """Tests for events array validation."""

    def test_events_empty(self, test_client, auth_headers, valid_collect_payload):
        """Test empty events array is rejected."""
        payload = {**valid_collect_payload, "events": []}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_events_too_many(self, test_client, auth_headers, valid_collect_payload):
        """Test events exceeding max limit are rejected."""
        base_time = 1700000000000
        events = [
            {"timestamp": base_time + i * 100, "type": "focus", "route": "/test"}
            for i in range(241)  # Max is 240
        ]
        payload = {**valid_collect_payload, "events": events}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_events_max_allowed(self, test_client, auth_headers, valid_collect_payload):
        """Test exactly max events (240) is accepted."""
        base_time = 1700000000000
        events = [
            {"timestamp": base_time + i * 100, "type": "focus", "route": "/test"}
            for i in range(240)
        ]
        payload = {**valid_collect_payload, "events": events}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK


class TestEventTypeValidation:
    """Tests for individual event type validation."""

    def test_key_down_requires_key_class(self, test_client, auth_headers, valid_collect_payload):
        """Test key_down events require key_class."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "key_down", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_key_down_valid_key_class(self, test_client, auth_headers, valid_collect_payload):
        """Test key_down with valid key_class is accepted."""
        valid_key_classes = ["character", "backspace", "delete", "enter", "modifier", "navigation", "other"]
        for key_class in valid_key_classes:
            payload = {**valid_collect_payload, "events": [
                {"timestamp": 1700000000000, "type": "key_down", "key_class": key_class, "route": "/test"}
            ]}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            assert response.status_code == status.HTTP_200_OK, f"Failed for key_class: {key_class}"

    def test_visibility_change_requires_hidden(self, test_client, auth_headers, valid_collect_payload):
        """Test visibility_change events require hidden field."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "visibility_change", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_visibility_change_valid(self, test_client, auth_headers, valid_collect_payload):
        """Test visibility_change with valid hidden field is accepted."""
        for hidden in [True, False]:
            payload = {**valid_collect_payload, "events": [
                {"timestamp": 1700000000000, "type": "visibility_change", "hidden": hidden, "route": "/test"}
            ]}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            assert response.status_code == status.HTTP_200_OK, f"Failed for hidden: {hidden}"

    def test_route_change_requires_route(self, test_client, auth_headers, valid_collect_payload):
        """Test route_change events require route field."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "route_change"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_route_change_valid(self, test_client, auth_headers, valid_collect_payload):
        """Test route_change with valid route is accepted."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "route_change", "route": "/notes"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_study_action_requires_route_and_action(self, test_client, auth_headers, valid_collect_payload):
        """Test study_action events require both route and action."""
        incomplete_payloads = [
            {"timestamp": 1700000000000, "type": "study_action", "route": "/test"},
            {"timestamp": 1700000000000, "type": "study_action", "action": "click"},
            {"timestamp": 1700000000000, "type": "study_action"},
        ]
        for events in incomplete_payloads:
            payload = {**valid_collect_payload, "events": [events]}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_study_action_valid(self, test_client, auth_headers, valid_collect_payload):
        """Test study_action with valid route and action is accepted."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "study_action", "route": "/notes", "action": "save"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_webcam_signal_requires_fatigue_score(self, test_client, auth_headers, valid_collect_payload):
        """Test webcam_signal events require fatigue_score."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "webcam_signal", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_webcam_signal_valid(self, test_client, auth_headers, valid_collect_payload):
        """Test webcam_signal with valid fatigue_score is accepted."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "webcam_signal", "fatigue_score": 0.5, "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK


class TestProbabilityValidation:
    """Tests for probability value validation."""

    def test_valid_probability_values(self, test_client, auth_headers, valid_collect_payload):
        """Test valid probability values (0-1) are accepted."""
        valid_probs = [0.0, 0.5, 1.0]
        for prob in valid_probs:
            payload = {**valid_collect_payload, "events": [
                {"timestamp": 1700000000000, "type": "webcam_signal", "fatigue_score": prob, "route": "/test"}
            ]}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            assert response.status_code == status.HTTP_200_OK

    def test_invalid_probability_too_high(self, test_client, auth_headers, valid_collect_payload):
        """Test probability > 1.0 is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "webcam_signal", "fatigue_score": 1.5, "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_invalid_probability_negative(self, test_client, auth_headers, valid_collect_payload):
        """Test probability < 0.0 is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "webcam_signal", "fatigue_score": -0.5, "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestStringLengthValidation:
    """Tests for string length limits."""

    def test_route_max_length(self, test_client, auth_headers, valid_collect_payload):
        """Test route exceeds max length (128) is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "route_change", "route": "a" * 129}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_action_max_length(self, test_client, auth_headers, valid_collect_payload):
        """Test action exceeds max length (64) is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "study_action", "route": "/test", "action": "a" * 65}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestRequestIdValidation:
    """Tests for request_id field validation."""

    def test_request_id_optional(self, test_client, auth_headers, valid_collect_payload):
        """Test request_id is optional."""
        payload = {**valid_collect_payload}
        payload.pop("request_id", None)
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_request_id_echoed_in_response(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test request_id is echoed back in response."""
        payload = {**valid_collect_payload, "request_id": "custom-request-id"}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["request_id"] == "custom-request-id"
