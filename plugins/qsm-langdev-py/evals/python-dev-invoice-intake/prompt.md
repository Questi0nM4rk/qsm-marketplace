---
name: python-dev-invoice-intake
tags: [scenario]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a Python function that reads an invoice from a JSON string (customer email, amount in
cents, currency, due date) and stores it. Show the code.
