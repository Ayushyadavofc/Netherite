from __future__ import annotations

import numpy as np
from sklearn.linear_model import LogisticRegression


def build_classifier() -> LogisticRegression:
    """
    Logistic regression is a strong fit here:
    - small-data friendly
    - calibrated probability output through predict_proba
    - easy to explain with signed feature coefficients
    """
    return LogisticRegression(
        max_iter=1000,
        solver="liblinear",
        class_weight="balanced",
        random_state=42,
    )


def predict_probability(model: LogisticRegression, scaled_features: np.ndarray) -> float:
    return float(model.predict_proba(scaled_features.reshape(1, -1))[0, 1])


def feature_contributions(model: LogisticRegression, scaled_features: np.ndarray) -> np.ndarray:
    coefficients = np.asarray(model.coef_[0], dtype=np.float32)
    return coefficients * np.asarray(scaled_features, dtype=np.float32)
