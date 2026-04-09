"""Edge case tests for PreChaos backend."""
from __future__ import annotations

import pytest
from fastapi import status


class TestEmptyInput:
    """Tests for empty input edge cases."""

    def test_empty_events_list(self, test_client, auth_headers):
        """Test empty events list is rejected."""
        payload = {
            "user_id": "test-user",
            "session_id": "test-session",
            "events": [],
        }
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_empty_user_id(self, test_client, auth_headers, valid_collect_payload):
        """Test empty user_id is rejected."""
        payload = {**valid_collect_payload, "user_id": ""}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_empty_session_id(self, test_client, auth_headers, valid_collect_payload):
        """Test empty session_id is rejected."""
        payload = {**valid_collect_payload, "session_id": ""}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestMaxBoundary:
    """Tests for maximum boundary conditions."""

    def test_max_events_240(self, test_client, auth_headers, valid_collect_payload):
        """Test exactly 240 events is accepted."""
        base_time = 1700000000000
        events = [
            {"timestamp": base_time + i * 100, "type": "focus", "route": "/test"}
            for i in range(240)
        ]
        payload = {**valid_collect_payload, "events": events}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_events_over_240_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test 241+ events are rejected."""
        base_time = 1700000000000
        events = [
            {"timestamp": base_time + i * 100, "type": "focus", "route": "/test"}
            for i in range(241)
        ]
        payload = {**valid_collect_payload, "events": events}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestTimestampBoundaries:
    """Tests for timestamp boundary conditions."""

    def test_timestamp_year_2000_exactly(self, test_client, auth_headers, valid_collect_payload):
        """Test timestamp at exactly Jan 1, 2000 is accepted."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 946684800000, "type": "focus", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_timestamp_year_2100_exactly(self, test_client, auth_headers, valid_collect_payload):
        """Test timestamp at exactly Jan 1, 2100 is accepted."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 4102444800000, "type": "focus", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_timestamp_before_2000_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test timestamp before 2000 is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 946684799999, "type": "focus", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_timestamp_after_2100_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test timestamp after 2100 is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 4102444800001, "type": "focus", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_timestamp_negative_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test negative timestamp is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": -1000, "type": "focus", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestStringLengthLimits:
    """Tests for string length limits."""

    def test_route_max_128_chars(self, test_client, auth_headers, valid_collect_payload):
        """Test route with exactly 128 characters is accepted."""
        route = "a" * 128
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "route_change", "route": route}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_route_over_128_chars_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test route with more than 128 characters is rejected."""
        route = "a" * 129
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "route_change", "route": route}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_action_max_64_chars(self, test_client, auth_headers, valid_collect_payload):
        """Test action with exactly 64 characters is accepted."""
        action = "a" * 64
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "study_action", "route": "/test", "action": action}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_action_over_64_chars_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test action with more than 64 characters is rejected."""
        action = "a" * 65
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "study_action", "route": "/test", "action": action}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestNumericBoundaries:
    """Tests for numeric field boundaries."""

    def test_dx_max_value(self, test_client, auth_headers, valid_collect_payload):
        """Test dx at maximum value (5000) is accepted."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "mouse_move", "dx": 5000.0, "dy": 0, "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_dx_over_max_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test dx over maximum is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "mouse_move", "dx": 5001.0, "dy": 0, "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_dx_negative_max(self, test_client, auth_headers, valid_collect_payload):
        """Test dx at minimum value (-5000) is accepted."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "mouse_move", "dx": -5000.0, "dy": 0, "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK


class TestInvalidEventTypes:
    """Tests for invalid event types."""

    def test_invalid_event_type_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test invalid event type is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "invalid_type", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_missing_event_type_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test missing event type is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestInvalidProbability:
    """Tests for invalid probability values."""

    def test_fatigue_score_negative_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test negative fatigue_score is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "webcam_signal", "fatigue_score": -0.1, "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_fatigue_score_over_1_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test fatigue_score > 1.0 is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "webcam_signal", "fatigue_score": 1.5, "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_fatigue_score_nan_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test NaN fatigue_score is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "webcam_signal", "fatigue_score": float("nan"), "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_fatigue_score_infinity_rejected(self, test_client, auth_headers, valid_collect_payload):
        """Test infinite fatigue_score is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "webcam_signal", "fatigue_score": float("inf"), "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestMalformedInput:
    """Tests for malformed input."""

    def test_missing_timestamp(self, test_client, auth_headers, valid_collect_payload):
        """Test missing timestamp is rejected."""
        payload = {**valid_collect_payload, "events": [
            {"type": "focus", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_invalid_json(self, test_client, auth_headers):
        """Test invalid JSON is rejected."""
        response = test_client.post(
            "/collect",
            data="not valid json",
            headers={**auth_headers, "Content-Type": "application/json"},
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_wrong_content_type(self, test_client, auth_headers, valid_collect_payload):
        """Test wrong content type is handled."""
        response = test_client.post(
            "/collect",
            data="text data",
            headers={**auth_headers, "Content-Type": "text/plain"},
        )
        # Should either work with text or return appropriate error
        assert response.status_code in [status.HTTP_422_UNPROCESSABLE_ENTITY, status.HTTP_415_UNSUPPORTED_MEDIA_TYPE]


class TestConcurrentRequests:
    """Tests for concurrent request handling."""

    def test_multiple_sequential_requests(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test multiple sequential requests all succeed."""
        for i in range(5):
            payload = {**valid_collect_payload, "session_id": f"session-{i}"}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            assert response.status_code == status.HTTP_200_OK, f"Request {i} failed"

    def test_rapid_requests_handled(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test rapid requests are handled properly."""
        responses = []
        for i in range(10):
            payload = {**valid_collect_payload, "session_id": f"rapid-{i}", "request_id": f"req-{i}"}
            response = test_client.post("/collect", json=payload, headers=auth_headers)
            responses.append(response.status_code)

        # All should succeed (or some may hit rate limiting)
        success_count = sum(1 for s in responses if s == status.HTTP_200_OK)
        assert success_count >= 8, f"Too many failures: {responses}"


class TestEdgeCaseEventCombinations:
    """Tests for edge case event combinations."""

    def test_single_event_batch(self, test_client, auth_headers, valid_collect_payload):
        """Test batch with single event."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "focus", "route": "/test"}
        ]}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_mixed_valid_event_types(self, test_client, auth_headers, valid_collect_payload):
        """Test batch with all valid event types."""
        events = [
            {"timestamp": 1700000000000, "type": "key_down", "key_class": "character", "route": "/test"},
            {"timestamp": 1700000000100, "type": "mouse_move", "dx": 10, "dy": 5, "route": "/test"},
            {"timestamp": 1700000000200, "type": "route_change", "route": "/test2"},
            {"timestamp": 1700000000300, "type": "visibility_change", "hidden": False, "route": "/test2"},
            {"timestamp": 1700000000400, "type": "focus", "route": "/test3"},
            {"timestamp": 1700000000500, "type": "scroll", "route": "/test3"},
            {"timestamp": 1700000000600, "type": "study_action", "route": "/notes", "action": "save"},
        ]
        payload = {**valid_collect_payload, "events": events}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_events_at_same_timestamp(self, test_client, auth_headers, valid_collect_payload):
        """Test events with identical timestamps."""
        ts = 1700000000000
        events = [
            {"timestamp": ts, "type": "focus", "route": "/test"},
            {"timestamp": ts, "type": "key_down", "key_class": "character", "route": "/test"},
        ]
        payload = {**valid_collect_payload, "events": events}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

    def test_out_of_order_timestamps(self, test_client, auth_headers, valid_collect_payload):
        """Test events with out-of-order timestamps."""
        events = [
            {"timestamp": 1700000000300, "type": "focus", "route": "/test"},
            {"timestamp": 1700000000100, "type": "focus", "route": "/test"},
            {"timestamp": 1700000000200, "type": "focus", "route": "/test"},
        ]
        payload = {**valid_collect_payload, "events": events}
        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK


class TestAuthenticationEdgeCases:
    """Tests for authentication edge cases."""

    def test_missing_api_key(self, test_client, valid_collect_payload):
        """Test missing API key is rejected."""
        response = test_client.post("/collect", json=valid_collect_payload)
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_empty_api_key(self, test_client, valid_collect_payload):
        """Test empty API key is rejected."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers={"X-PreChaos-API-Key": ""},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_invalid_api_key(self, test_client, valid_collect_payload):
        """Test invalid API key is rejected."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers={"X-PreChaos-API-Key": "wrong-key"},
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN
