## MODIFIED Requirements

### Requirement: One installer walks the table

Install SHALL iterate the same table and install each tool that is not on PATH, through its own
package manager (`bun add -g`, `uv tool install`, `pipx install`, `go install`). A tool owned by a
system package manager (acli, comby, hurl, usql) SHALL be
suggested with its command, never run, and when the package manager that command assumes is not on
PATH the suggestion SHALL carry the row's alternative routes. `QSM_<TOOL>_SKIP=1` SHALL skip one
tool. A tool already present SHALL be reported as already installed. A tool installed by
`go install` SHALL be linked from the Go bin directory into the user's bin directory. A link
there that points into the Go bin directory is replaced; anything else holding that name SHALL fail
the tool's step, naming what is there and saying to run the install again with `--force`, which
replaces it. The installer SHALL continue past one tool's failure and report every
result at the end. The table SHALL have no row for `br`.

#### Scenario: One failure among many

- **WHEN** `go` is missing and every other prerequisite is present
- **THEN** mlr, scc and yq SHALL be reported as missing-prereq with the
  prerequisite named, the rest SHALL install, and the exit code SHALL be non-zero

#### Scenario: A link that is not ours

- **WHEN** a tool is built by `go install` and the user's bin directory holds a link of that name
  to somewhere else
- **THEN** its step SHALL fail naming the link's target and `--force`, the link SHALL stay, and
  with `--force` it SHALL be replaced and the step SHALL say so

#### Scenario: A suggestion on another system

- **WHEN** hurl is missing and `pacman` is not on PATH
- **THEN** the suggestion SHALL name `pacman` as absent and carry the brew, dnf
  and cargo routes the row holds

#### Scenario: Dry run

- **WHEN** install runs with `--dry-run`
- **THEN** each tool SHALL be reported with the decision the real run would
  make, present or skipped or the command it would run or suggest, and nothing
  SHALL be executed
