from __future__ import annotations

import math
from typing import Tuple

import torch
from torch import Tensor, nn


class PositionalEncoding(nn.Module):
    def __init__(self, d_model: int, max_len: int = 512) -> None:
        super().__init__()
        position = torch.arange(max_len).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2) * (-math.log(10000.0) / d_model))
        pe = torch.zeros(max_len, d_model)
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        self.register_buffer("pe", pe.unsqueeze(0), persistent=False)

    def forward(self, x: Tensor) -> Tensor:
        return x + self.pe[:, : x.size(1)]


class AttentionPooling(nn.Module):
    def __init__(self, d_model: int) -> None:
        super().__init__()
        self.query = nn.Linear(d_model, 1)

    def forward(self, x: Tensor) -> Tuple[Tensor, Tensor]:
        scores = self.query(x).squeeze(-1)
        weights = torch.softmax(scores, dim=-1)
        pooled = torch.sum(x * weights.unsqueeze(-1), dim=1)
        return pooled, weights


class PreChaosTransformer(nn.Module):
    def __init__(
        self,
        feature_dim: int,
        d_model: int = 64,
        nhead: int = 4,
        num_layers: int = 3,
        dropout: float = 0.15,
    ) -> None:
        super().__init__()
        self.input_projection = nn.Linear(feature_dim, d_model)
        self.positional_encoding = PositionalEncoding(d_model)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=d_model * 2,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.pooling = AttentionPooling(d_model)
        self.head = nn.Sequential(
            nn.LayerNorm(d_model),
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model // 2, 1),
        )

    def forward(self, x: Tensor) -> Tuple[Tensor, Tensor]:
        encoded = self.input_projection(x)
        encoded = self.positional_encoding(encoded)
        encoded = self.encoder(encoded)
        pooled, attention_weights = self.pooling(encoded)
        logits = self.head(pooled).squeeze(-1)
        return logits, attention_weights
