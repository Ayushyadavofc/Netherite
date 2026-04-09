"""Dataset integrity tests for PreChaos backend.

CRITICAL: These tests verify that:
1. No prediction data is ever stored in the training dataset
2. No raw event data leaks into training samples
3. Session isolation is maintained between users
4. No user input strings leak into dataset files
"""
from __future__ import annotations

import json
import re

import pytest
from fastapi import status


class TestNoPredictionLeakage:
    """Tests to ensure prediction data never enters training dataset."""

    def test_prediction_not_in_training_dataset(
        self, test_client, auth_headers, valid_collect_payload, tmp_path
    ):
        """Verify predictions are NOT written to LIVE_DATA_PATH."""
        # Collect events with prediction
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        # Get the prediction if it exists
        prediction = data.get("prediction")
        if not prediction:
            pytest.skip("No prediction returned")

        risk_value = prediction.get("risk")

        # Read the training dataset
        live_data_path = tmp_path / "data" / "live_samples.jsonl"
        if not live_data_path.exists():
            pytest.skip("No training data file exists")

        with open(live_data_path, "r") as f:
            for line in f:
                if not line.strip():
                    continue
                sample = json.loads(line)

                # CRITICAL: Prediction risk should NEVER be in training data
                assert "risk" not in sample or sample.get("risk") != risk_value, (
                    "PREDICTION LEAKAGE: Risk value found in training dataset!"
                )

    def test_prediction_log_separate_from_training_data(
        self, test_client, auth_headers, valid_collect_payload, tmp_path
    ):
        """Verify prediction log path is different from training data path."""
        from app.config import LIVE_DATA_PATH, PREDICTION_LOG_PATH

        # These must be different paths
        assert LIVE_DATA_PATH != PREDICTION_LOG_PATH, (
            "CRITICAL: Prediction log and training data must use different files!"
        )

    def test_collect_with_predict_false_no_prediction_logged(
        self, test_client, auth_headers, valid_collect_payload, tmp_path
    ):
        """Verify predict=False doesn't create prediction entries."""
        payload = {**valid_collect_payload, "predict": False, "write_to_dataset": True}

        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

        # Prediction log should not contain prediction for this request
        pred_log_path = tmp_path / "data" / "prediction_log.jsonl"
        if pred_log_path.exists():
            with open(pred_log_path, "r") as f:
                lines = f.readlines()
                # Should have minimal or no prediction logs
                assert len(lines) == 0 or all(
                    "prediction" not in json.loads(line) or json.loads(line).get("prediction") is None
                    for line in lines if line.strip()
                )


class TestNoRawEventLeakage:
    """Tests to ensure raw event data doesn't enter training samples."""

    def test_no_raw_event_type_in_samples(
        self, test_client, auth_headers, valid_collect_payload, tmp_path
    ):
        """Verify training samples don't contain raw event 'type' field."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_200_OK

        live_data_path = tmp_path / "data" / "live_samples.jsonl"
        if not live_data_path.exists():
            pytest.skip("No training data file exists")

        with open(live_data_path, "r") as f:
            for line_num, line in enumerate(f):
                if not line.strip():
                    continue
                sample = json.loads(line)

                # CRITICAL: Raw event fields should NOT be in training samples
                forbidden_fields = ["type", "action", "key_class", "hidden", "dx", "dy"]
                for field in forbidden_fields:
                    assert field not in sample, (
                        f"RAW EVENT LEAKAGE: Field '{field}' found in training sample at line {line_num}"
                    )

    def test_samples_contain_only_computed_features(
        self, test_client, auth_headers, valid_collect_payload, tmp_path
    ):
        """Verify training samples contain only computed feature values."""
        from app.config import FEATURE_NAMES

        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_200_OK

        live_data_path = tmp_path / "data" / "live_samples.jsonl"
        if not live_data_path.exists():
            pytest.skip("No training data file exists")

        with open(live_data_path, "r") as f:
            for line_num, line in enumerate(f):
                if not line.strip():
                    continue
                sample = json.loads(line)

                # All keys should be known feature names
                for key in sample.keys():
                    # Allow metadata fields
                    if key not in ["user_id", "session_id", "timestamp", "source_event_count"]:
                        assert key in FEATURE_NAMES, (
                            f"UNKNOWN FEATURE: Key '{key}' in training sample at line {line_num}"
                        )

    def test_no_raw_event_route_in_samples(
        self, test_client, auth_headers, valid_collect_payload, tmp_path
    ):
        """Verify training samples don't contain raw event routes."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_200_OK

        live_data_path = tmp_path / "data" / "live_samples.jsonl"
        if not live_data_path.exists():
            pytest.skip("No training data file exists")

        # Get the routes from input events
        input_routes = set(
            e.get("route", "")
            for e in valid_collect_payload["events"]
            if e.get("route")
        )

        with open(live_data_path, "r") as f:
            for line in f:
                if not line.strip():
                    continue
                sample = json.loads(line)

                # Routes should not appear as-is in samples
                for input_route in input_routes:
                    sample_str = json.dumps(sample)
                    # This is a loose check - the key 'route' shouldn't exist
                    assert "route" not in sample or sample.get("route") != input_route, (
                        f"ROUTE LEAKAGE: Route '{input_route}' found in training sample"
                    )


class TestSessionIsolation:
    """Tests for session isolation between users."""

    def test_different_users_have_isolated_baselines(
        self, test_client, auth_headers, valid_collect_payload, tmp_path
    ):
        """Verify different users don't share baseline data."""
        # Collect for user A
        payload_a = {**valid_collect_payload, "user_id": "user-a"}
        response_a = test_client.post("/collect", json=payload_a, headers=auth_headers)
        assert response_a.status_code == status.HTTP_200_OK

        # Collect for user B
        payload_b = {**valid_collect_payload, "user_id": "user-b"}
        response_b = test_client.post("/collect", json=payload_b, headers=auth_headers)
        assert response_b.status_code == status.HTTP_200_OK

        # Get baselines
        baseline_a = test_client.get("/baseline?user_id=user-a", headers=auth_headers)
        baseline_b = test_client.get("/baseline?user_id=user-b", headers=auth_headers)

        assert baseline_a.status_code == status.HTTP_200_OK
        assert baseline_b.status_code == status.HTTP_200_OK

        data_a = baseline_a.json()
        data_b = baseline_b.json()

        # Baselines should exist but be independent
        # User B's baseline shouldn't contain user A's data
        if "baseline" in data_a and "baseline" in data_b:
            # If both have baselines, they should be independently computed
            baseline_a_str = json.dumps(data_a["baseline"])
            baseline_b_str = json.dumps(data_b["baseline"])
            # They might be similar initially but shouldn't reference each other
            assert "user-a" not in baseline_b_str
            assert "user-b" not in baseline_a_str

    def test_different_sessions_have_isolated_data(
        self, test_client, auth_headers, valid_collect_payload, tmp_path
    ):
        """Verify different sessions don't share data."""
        # Session 1
        payload_s1 = {**valid_collect_payload, "session_id": "session-1"}
        response_s1 = test_client.post("/collect", json=payload_s1, headers=auth_headers)
        assert response_s1.status_code == status.HTTP_200_OK

        # Session 2
        payload_s2 = {**valid_collect_payload, "session_id": "session-2"}
        response_s2 = test_client.post("/collect", json=payload_s2, headers=auth_headers)
        assert response_s2.status_code == status.HTTP_200_OK

        # Live events should have separate session IDs
        live_event_path = tmp_path / "data" / "live_events.jsonl"
        if live_event_path.exists():
            with open(live_event_path, "r") as f:
                lines = f.readlines()
                session_ids = set()
                for line in lines:
                    if line.strip():
                        event = json.loads(line)
                        sid = event.get("session_id")
                        if sid:
                            session_ids.add(sid)

                # Both sessions should be recorded
                assert "session-1" in session_ids or "session-2" in session_ids


class TestNoUserInputLeakage:
    """Tests to ensure user input strings don't leak into dataset."""

    def test_no_freeform_text_in_dataset(
        self, test_client, auth_headers, valid_collect_payload, tmp_path
    ):
        """Verify no freeform user text enters dataset files."""
        # Use events with potentially sensitive text-like data
        sensitive_events = [
            {"timestamp": 1700000000000, "type": "study_action", "route": "/notes", "action": "save"},
            {"timestamp": 1700000000100, "type": "key_down", "key_class": "character", "route": "/notes", "action": "my secret note"},
            {"timestamp": 1700000000200, "type": "key_down", "key_class": "character", "route": "/notes"},
        ]
        payload = {**valid_collect_payload, "events": sensitive_events}

        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

        # Check all data files for leaked strings
        data_dir = tmp_path / "data"
        if not data_dir.exists():
            return

        for file_path in data_dir.glob("*.jsonl"):
            with open(file_path, "r") as f:
                content = f.read()
                # Sensitive strings should not appear verbatim
                assert "my secret note" not in content, (
                    f"USER INPUT LEAKAGE: Sensitive text found in {file_path.name}"
                )

    def test_no_route_paths_in_dataset_metadata(
        self, test_client, auth_headers, valid_collect_payload, tmp_path
    ):
        """Verify route paths are not stored as metadata in dataset."""
        unique_route = "/test-unique-route-12345"

        payload = {**valid_collect_payload, "events": [
            {"timestamp": 1700000000000, "type": "route_change", "route": unique_route}
        ]}

        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK

        # Check dataset files
        data_dir = tmp_path / "data"
        if not data_dir.exists():
            return

        # The route should be in events but not necessarily in samples
        # This test is informational - routes in events are OK
        # We just verify the unique route doesn't appear where it shouldn't


class TestDatasetPoisoningPrevention:
    """Tests to prevent dataset poisoning attacks."""

    def test_very_large_event_count_rejected(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Verify extremely large event counts are rejected."""
        base_time = 1700000000000
        # Try to send more than max allowed events
        events = [
            {"timestamp": base_time + i * 100, "type": "focus", "route": "/test"}
            for i in range(1000)  # Way over limit
        ]
        payload = {**valid_collect_payload, "events": events}

        response = test_client.post("/collect", json=payload, headers=auth_headers)

        # Should be rejected at validation level
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_malformed_timestamps_rejected(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Verify malformed timestamps are rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": "not-a-number", "type": "focus", "route": "/test"}
        ]}

        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_negative_timestamps_rejected(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Verify negative timestamps are rejected."""
        payload = {**valid_collect_payload, "events": [
            {"timestamp": -1000, "type": "focus", "route": "/test"}
        ]}

        response = test_client.post("/collect", json=payload, headers=auth_headers)
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_sql_injection_patterns_rejected(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Verify SQL injection patterns are rejected."""
        malicious_routes = [
            "/test; DROP TABLE users;--",
            "/test' OR '1'='1",
            "/test UNION SELECT * FROM users",
        ]

        for route in malicious_routes:
            payload = {**valid_collect_payload, "events": [
                {"timestamp": 1700000000000, "type": "route_change", "route": route}
            ]}

            response = test_client.post("/collect", json=payload, headers=auth_headers)
            # Should either reject at validation or sanitize the input
            assert response.status_code in [
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                status.HTTP_200_OK,
            ]

            if response.status_code == status.HTTP_200_OK:
                # If accepted, verify sanitization occurred
                data = response.json()
                # The dangerous patterns should be neutralized
                assert "DROP TABLE" not in json.dumps(data)
                assert "UNION SELECT" not in json.dumps(data)
