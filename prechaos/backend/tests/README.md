# PreChaos Backend Test Suite

## Overview

This test suite provides comprehensive coverage for the PreChaos backend:
- API endpoint integration tests
- Input data validation tests
- Model prediction tests
- Dataset integrity tests (CRITICAL - no prediction leakage)
- Edge case tests

## Test Structure

```
tests/
├── conftest.py                    # Shared fixtures + temp data isolation
├── test_01_api_endpoints.py       # FastAPI integration tests
├── test_02_data_validation.py    # Input validation tests
├── test_03_model_prediction.py   # Prediction pipeline tests
├── test_04_dataset_integrity.py   # No leakage + no poisoning (CRITICAL)
└── test_05_edge_cases.py          # Boundary conditions
```

## Running Tests

### Install Dependencies

```bash
cd prechaos/backend
pip install -r requirements.txt
```

### Run All Tests

```bash
# Full test suite with coverage
pytest tests/ -v --cov=app --cov-report=term-missing --cov-fail-under=80
```

### Run Tests by Priority

```bash
# Critical: Dataset integrity (run first - most important)
pytest tests/test_04_dataset_integrity.py -v

# Security: Data validation
pytest tests/test_02_data_validation.py -v

# Functionality: API endpoints
pytest tests/test_01_api_endpoints.py -v

# Model: Prediction pipeline
pytest tests/test_03_model_prediction.py -v

# Robustness: Edge cases
pytest tests/test_05_edge_cases.py -v
```

### Run Specific Tests

```bash
# Single test file
pytest tests/test_01_api_endpoints.py::TestCollectEndpoint::test_collect_success -v

# Single test
pytest tests/test_04_dataset_integrity.py::TestNoPredictionLeakage::test_prediction_not_in_training_dataset -v

# Tests matching pattern
pytest tests/ -k "validation" -v
```

## Test Coverage Targets

| Module | Target | Critical Paths |
|--------|--------|----------------|
| `server.py` | 90% | All endpoints, auth, validation |
| `engine.py` | 85% | Prediction pipeline, feature matrix |
| `model.py` | 100% | predict_probability, feature_contributions |
| `data_validation` | 100% | All validators |
| `security.py` | 80% | Key functions |

## Key Test Categories

### 1. Dataset Integrity Tests (`test_04_dataset_integrity.py`)

CRITICAL: These tests verify:
- No prediction data is ever stored in training dataset
- No raw event data leaks into training samples
- Session isolation between users
- No user input strings leak into dataset files
- Dataset poisoning prevention

### 2. Data Validation Tests (`test_02_data_validation.py`)

Tests strict input validation:
- user_id, session_id patterns
- Timestamp boundaries (2000-2100)
- Event array limits (1-240)
- Event type requirements (key_class, hidden, route, action, fatigue_score)
- Probability value bounds
- String length limits

### 3. API Endpoint Tests (`test_01_api_endpoints.py`)

Tests all FastAPI endpoints:
- `/collect` - Event collection
- `/predict` - Prediction
- `/feedback` - User feedback
- `/baseline` - Baseline management
- `/dataset/status` - Dataset status
- `/sessions/replay` - Session replays
- Auth enforcement

### 4. Model Prediction Tests (`test_03_model_prediction.py`)

Tests prediction correctness:
- All required fields present
- Risk/confidence within [0, 1]
- Valid enum values (status, state)
- Context handling
- Consistency of predictions

### 5. Edge Case Tests (`test_05_edge_cases.py`)

Tests boundary conditions:
- Empty/minimal input
- Max boundary values
- Invalid types and values
- Concurrent requests
- Malformed input

## Data Isolation

Tests use pytest's `tmp_path` fixture to create isolated temporary directories. All config paths are monkey-patched to use these temp directories:

- `DATA_ROOT` → `<tmp_path>/data`
- `MODEL_ROOT` → `<tmp_path>/models`
- All data files are written to isolated temp directories
- Cleanup happens automatically after each test

## Test Fixtures

| Fixture | Purpose |
|---------|---------|
| `test_client` | FastAPI TestClient |
| `isolated_config` | Monkeypatched config to temp dirs |
| `auth_headers` | Valid API key headers |
| `valid_event_batch` | Sample valid events |
| `valid_collect_payload` | Valid /collect payload |
| `valid_predict_payload` | Valid /predict payload |
| `valid_feedback_payload` | Valid /feedback payload |
| `valid_baseline_payload` | Valid /baseline payload |

## Notes

- Tests use real file I/O to isolated temp directories (no mocking of DatasetWriter)
- No pretrained model required - tests work with or without trained model
- API key is generated in test fixtures
- All tests are independent and can run in any order
