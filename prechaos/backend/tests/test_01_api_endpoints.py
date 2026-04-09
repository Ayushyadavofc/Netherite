"""FastAPI endpoint integration tests for PreChaos backend."""
from __future__ import annotations

import pytest
from fastapi import status


class TestCollectEndpoint:
    """Tests for POST /collect endpoint."""

    def test_collect_success(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test successful event collection."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "appended_samples" in data
        assert "appended_events" in data
        assert "ready_for_training" in data
        assert data["request_id"] == "test-request-789"

    def test_collect_returns_prediction(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test that collect returns prediction when predict=True."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        if data.get("prediction"):
            pred = data["prediction"]
            assert "risk" in pred
            assert "status" in pred
            assert "confidence" in pred
            assert "focus_score" in pred

    def test_collect_without_prediction(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test collect with predict=False."""
        payload = {**valid_collect_payload, "predict": False}
        response = test_client.post(
            "/collect",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data.get("prediction") is None

    def test_collect_without_dataset_write(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test collect with write_to_dataset=False."""
        payload = {**valid_collect_payload, "write_to_dataset": False}
        response = test_client.post(
            "/collect",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["appended_samples"] == 0

    def test_collect_missing_auth(self, test_client, valid_collect_payload):
        """Test collect without authentication."""
        response = test_client.post("/collect", json=valid_collect_payload)

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_collect_invalid_auth(self, test_client, valid_collect_payload):
        """Test collect with invalid authentication."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers={"X-PreChaos-API-Key": "invalid-key"},
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_collect_empty_events(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test collect with empty events list."""
        payload = {**valid_collect_payload, "events": []}
        response = test_client.post(
            "/collect",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_collect_invalid_user_id(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test collect with invalid user_id pattern."""
        payload = {**valid_collect_payload, "user_id": "invalid user!@#"}
        response = test_client.post(
            "/collect",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestPredictEndpoint:
    """Tests for POST /predict endpoint."""

    def test_predict_success(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test successful prediction."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "risk" in data
        assert "status" in data
        assert "confidence" in data
        assert "focus_score" in data
        assert "fatigue_score" in data

    def test_predict_with_context(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test prediction with context payload."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "context_summary" in data
        assert "page_explanation" in data

    def test_predict_missing_auth(self, test_client, valid_predict_payload):
        """Test predict without authentication."""
        response = test_client.post("/predict", json=valid_predict_payload)

        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestFeedbackEndpoint:
    """Tests for POST /feedback endpoint."""

    def test_feedback_success(
        self, test_client, auth_headers, valid_feedback_payload
    ):
        """Test successful feedback submission."""
        response = test_client.post(
            "/feedback",
            json=valid_feedback_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK

    def test_feedback_invalid_label(
        self, test_client, auth_headers, valid_feedback_payload
    ):
        """Test feedback with invalid label."""
        payload = {**valid_feedback_payload, "label": "invalid_label"}
        response = test_client.post(
            "/feedback",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_feedback_invalid_risk(
        self, test_client, auth_headers, valid_feedback_payload
    ):
        """Test feedback with risk out of range."""
        payload = {**valid_feedback_payload, "risk": 1.5}
        response = test_client.post(
            "/feedback",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


class TestBaselineEndpoint:
    """Tests for GET and POST /baseline endpoints."""

    def test_get_baseline_success(self, test_client, auth_headers):
        """Test getting baseline."""
        response = test_client.get(
            "/baseline?user_id=test-user-123",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "user_id" in data

    def test_post_baseline_success(
        self, test_client, auth_headers, valid_baseline_payload
    ):
        """Test updating baseline."""
        response = test_client.post(
            "/baseline",
            json=valid_baseline_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "baseline" in data

    def test_baseline_missing_auth(self, test_client, valid_baseline_payload):
        """Test baseline without authentication."""
        response = test_client.post("/baseline", json=valid_baseline_payload)

        assert response.status_code == status.HTTP_403_FORBIDDEN


class TestDatasetStatusEndpoint:
    """Tests for GET /dataset/status endpoint."""

    def test_dataset_status_success(self, test_client, auth_headers):
        """Test getting dataset status."""
        response = test_client.get(
            "/dataset/status",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "sample_count" in data
        assert "session_count" in data
        assert "ready_for_training" in data
        assert "mode" in data


class TestSessionsReplayEndpoint:
    """Tests for GET /sessions/replay endpoint."""

    def test_sessions_replay_success(self, test_client, auth_headers):
        """Test getting session replays."""
        response = test_client.get(
            "/sessions/replay",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)


class TestHealthEndpoint:
    """Tests for GET /health endpoint."""

    def test_health_no_auth_required(self, test_client):
        """Test health endpoint doesn't require auth."""
        response = test_client.get("/health")

        assert response.status_code == status.HTTP_200_OK
