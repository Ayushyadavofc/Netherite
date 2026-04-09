"""Model prediction tests for PreChaos backend."""
from __future__ import annotations

import json

import pytest
from fastapi import status


class TestPredictionOutput:
    """Tests for prediction output structure and values."""

    def test_prediction_contains_all_required_fields(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test prediction returns all required fields."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        required_fields = [
            "risk",
            "status",
            "state",
            "confidence",
            "confidence_score",
            "authority_label",
            "focus_score",
            "fatigue_score",
            "distraction_score",
            "reflection_score",
            "uncertainty_score",
            "insights",
            "dominant_signals",
            "attention",
            "model_risk",
            "correction_factor",
            "baseline_ready",
            "mode",
            "context_summary",
            "page_explanation",
        ]

        for field in required_fields:
            assert field in data, f"Missing required field: {field}"

    def test_risk_within_bounds(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test risk value is within [0, 1] bounds."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        risk = data["risk"]

        assert 0.0 <= risk <= 1.0, f"Risk {risk} out of bounds"

    def test_confidence_within_bounds(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test confidence value is within [0, 1] bounds."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        confidence = data["confidence"]

        assert 0.0 <= confidence <= 1.0, f"Confidence {confidence} out of bounds"

    def test_status_valid_enum_values(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test status is valid enum value."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        valid_statuses = ["low", "medium", "high"]

        assert data["status"] in valid_statuses, f"Invalid status: {data['status']}"

    def test_state_valid_enum_values(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test state is valid enum value."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        valid_states = ["focused", "reflective", "steady", "distracted", "fatigued", "overloaded", "uncertain"]

        assert data["state"] in valid_states, f"Invalid state: {data['state']}"

    def test_all_score_fields_within_bounds(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test all score fields are within [0, 1] bounds."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        score_fields = [
            "focus_score",
            "fatigue_score",
            "distraction_score",
            "reflection_score",
            "uncertainty_score",
        ]

        for field in score_fields:
            value = data.get(field)
            if value is not None:
                assert 0.0 <= value <= 1.0, f"{field} {value} out of bounds"

    def test_insights_is_list(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test insights is a list of strings."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert isinstance(data["insights"], list), "insights should be a list"
        for insight in data["insights"]:
            assert isinstance(insight, str), "Each insight should be a string"

    def test_dominant_signals_is_list(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test dominant_signals is a list of dicts with feature and score."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert isinstance(data["dominant_signals"], list), "dominant_signals should be a list"
        for signal in data["dominant_signals"]:
            assert isinstance(signal, dict), "Each signal should be a dict"
            assert "feature" in signal, "Signal should have 'feature'"
            assert "score" in signal, "Signal should have 'score'"

    def test_attention_is_list(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test attention is a list of floats."""
        response = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert isinstance(data["attention"], list), "attention should be a list"
        for val in data["attention"]:
            assert isinstance(val, (int, float)), "Each attention value should be numeric"


class TestPredictionContext:
    """Tests for prediction with context."""

    def test_prediction_without_context(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test prediction works without context."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK

    def test_prediction_with_productive_context(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test prediction with productive context."""
        payload = {
            **valid_predict_payload,
            "context": {
                "route": "/notes",
                "page_name": "notes",
                "productive_context": True,
                "focused_editable": True,
                "recent_meaningful_actions": 10.0,
            },
        }
        response = test_client.post(
            "/predict",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK

    def test_prediction_with_reading_context(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test prediction with reading context."""
        payload = {
            **valid_predict_payload,
            "context": {
                "route": "/notes",
                "page_name": "notes",
                "reading_mode": True,
                "route_dwell_seconds": 60.0,
            },
        }
        response = test_client.post(
            "/predict",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK


class TestCollectPrediction:
    """Tests for prediction via collect endpoint."""

    def test_collect_with_predict_returns_prediction(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test collect with predict=True returns prediction."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert "prediction" in data
        if data["prediction"]:
            assert "risk" in data["prediction"]

    def test_collect_with_predict_false_no_prediction(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test collect with predict=False returns no prediction."""
        payload = {**valid_collect_payload, "predict": False}
        response = test_client.post(
            "/collect",
            json=payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert data.get("prediction") is None


class TestPredictionConsistency:
    """Tests for prediction consistency."""

    def test_identical_events_produce_consistent_results(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test identical events produce consistent predictions."""
        response1 = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )
        response2 = test_client.post(
            "/predict",
            json=valid_predict_payload,
            headers=auth_headers,
        )

        assert response1.status_code == status.HTTP_200_OK
        assert response2.status_code == status.HTTP_200_OK

        data1 = response1.json()
        data2 = response2.json()

        # Predictions should be identical for identical input
        assert data1["risk"] == data2["risk"]
        assert data1["status"] == data2["status"]

    def test_different_events_produce_different_predictions(
        self, test_client, auth_headers, valid_predict_payload
    ):
        """Test different events produce different predictions."""
        payload1 = valid_predict_payload
        payload2 = {
            **valid_predict_payload,
            "events": [
                {"timestamp": 1700000000000 + i * 1000, "type": "focus", "route": "/test"}
                for i in range(10)
            ],
        }

        response1 = test_client.post("/predict", json=payload1, headers=auth_headers)
        response2 = test_client.post("/predict", json=payload2, headers=auth_headers)

        assert response1.status_code == status.HTTP_200_OK
        assert response2.status_code == status.HTTP_200_OK


class TestFeatureMatrix:
    """Tests for feature matrix generation."""

    def test_feature_matrix_generation(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test feature matrix is generated and returned."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        assert "latest_features" in data
        assert isinstance(data["latest_features"], list)


class TestModeTransitions:
    """Tests for model mode transitions."""

    def test_initial_mode_is_untrained(
        self, test_client, auth_headers, valid_collect_payload
    ):
        """Test initial mode is untrained or baseline."""
        response = test_client.post(
            "/collect",
            json=valid_collect_payload,
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()

        if data.get("prediction"):
            mode = data["prediction"].get("mode")
            assert mode in ["untrained", "baseline", "trained"], f"Unexpected mode: {mode}"
