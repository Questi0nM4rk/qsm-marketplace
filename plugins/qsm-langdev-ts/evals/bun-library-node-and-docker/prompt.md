---
name: bun-library-node-and-docker
tags: [scenario]
runs: 3
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

I maintain a small library in a Bun repo. It depends on a package with a native postinstall step.
Node users must be able to install it, and Bun users should get the source. It also runs in a
Docker image with a read-only filesystem. The files are not in this sandbox, so do not look for
them: reply with the exact package.json fields, the build command, the lockfile and install
commands, and the Docker setting you would use, each with the reason.
