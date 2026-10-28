# Northstar delivery-infra

Synthetic service for the AxiGate sprint-day review. No customer data. Runtime staging and production are isolated local Docker deployments; GitHub Actions builds and verifies release packages.

Run `npm ci --ignore-scripts && npm test`. Production dependency audit intentionally includes a harmless unused vulnerable dependency in usage-api to exercise advisory reporting.
