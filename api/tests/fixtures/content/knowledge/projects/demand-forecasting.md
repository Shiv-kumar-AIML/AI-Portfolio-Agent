---
title: Retail Demand Forecasting
project: demand-forecasting
---

# Retail Demand Forecasting

> PLACEHOLDER deep-dive — replace with your real project.

## Problem

Store-level demand forecasts drove ordering, and the existing moving-average baseline caused
both stock-outs and overstock.

## Approach

- Feature engineering: lags, rolling statistics, holidays, promotions, price changes.
- Gradient-boosted trees (XGBoost) trained per category with time-series cross-validation.
- An Airflow pipeline for weekly retraining, with drift checks before a new model is promoted.

## Results

MAPE improved by 12% over the baseline (placeholder number).

## Stack

Python, pandas, XGBoost, scikit-learn, Airflow, PostgreSQL.
