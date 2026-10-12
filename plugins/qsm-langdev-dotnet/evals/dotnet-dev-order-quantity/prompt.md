---
name: dotnet-dev-order-quantity
tags: [scenario]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a C# class OrderService that loads an order from the database and has a Quantity property
that clamps negatives to zero. Also write its xUnit test file: one test for the clamp over several
inputs, and one for a load that is cancelled. Show the code.
