//! The machine-readable report behind `sentrux check --json`.
//!
//! The human output prints one `Quality:` integer and the rule verdict. A
//! caller that compares two trees needs the number's parts and the edges that
//! moved it, so this renders the health report and the rule check as one JSON
//! document. Field names are the contract; `USAGE.md` in the tool root lists
//! them.
//!
//! qsm addition on top of upstream sentrux 0.5.7.

use super::rules::{RuleCheckResult, Severity};
use super::HealthReport;
use serde_json::{json, Value};

/// Floats are rounded to six decimals. Q sums f64 terms while walking a
/// `HashMap`, so its last bits differ between two runs on one tree, and a
/// caller diffing two reports must not see a change that is not one. Six
/// decimals is finer than the 0-10000 scale the `Quality:` line reports on.
fn rounded(v: f64) -> f64 {
    (v * 1e6).round() / 1e6
}

/// The integer on the `Quality:` line — the same expression
/// `print_check_results` uses, so the two outputs agree.
fn quality_points(signal: f64) -> u32 {
    (signal * 10000.0).round() as u32
}

fn cause(raw: Value, score: f64) -> Value {
    json!({ "raw": raw, "score": rounded(score) })
}

fn severity_label(severity: &Severity) -> &'static str {
    match severity {
        Severity::Error => "error",
        Severity::Warning => "warning",
    }
}

/// The report as a JSON value. Deterministic for one tree: lists are sorted
/// here or by construction, floats are rounded, and `serde_json` orders keys.
pub fn check_report(health: &HealthReport, check: &RuleCheckResult) -> Value {
    let raw = &health.root_cause_raw;
    let score = &health.root_cause_scores;

    let cross_module_edges: Vec<Value> = health
        .cross_module_edge_list
        .iter()
        .map(|e| json!({ "from": e.from, "to": e.to, "kind": e.kind.label() }))
        .collect();

    let violations: Vec<Value> = check
        .violations
        .iter()
        .map(|v| {
            let mut files = v.files.clone();
            files.sort_unstable();
            json!({
                "rule": v.rule,
                "severity": severity_label(&v.severity),
                "message": v.message,
                "files": files,
            })
        })
        .collect();

    json!({
        "quality": quality_points(health.quality_signal),
        "quality_signal": rounded(health.quality_signal),
        "module_depth": crate::core::path_utils::module_depth(),
        "root_causes": {
            "modularity": cause(json!(rounded(raw.modularity_q)), score.modularity),
            "acyclicity": cause(json!(raw.cycle_count), score.acyclicity),
            "depth": cause(json!(raw.max_depth), score.depth),
            "equality": cause(json!(rounded(raw.complexity_gini)), score.equality),
            "redundancy": cause(json!(rounded(raw.redundancy_ratio)), score.redundancy),
        },
        "import_edges": {
            "total": health.total_import_edges,
            "cross_module": health.cross_module_edges,
        },
        "cross_module_edges": cross_module_edges,
        "rules": {
            "passed": check.violations.is_empty(),
            "checked": check.rules_checked,
            "violations": violations,
        },
    })
}

/// `check_report` pretty-printed, with a trailing newline.
pub fn render(health: &HealthReport, check: &RuleCheckResult) -> String {
    let mut text = serde_json::to_string_pretty(&check_report(health, check))
        .expect("a report built from json! serializes");
    text.push('\n');
    text
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::compute_health;
    use crate::metrics::rules::RuleViolation;
    use crate::metrics::test_helpers::{call_edge, edge, file, snap_with_edges};

    fn passing_check() -> RuleCheckResult {
        RuleCheckResult {
            passed: true,
            violations: Vec::new(),
            rules_checked: 5,
        }
    }

    fn report() -> Value {
        let mut snap = snap_with_edges(
            vec![
                edge("src/analysis/scanner.rs", "src/metrics/health.rs"),
                edge("src/analysis/scanner.rs", "src/analysis/parser.rs"),
            ],
            vec![
                file("src/analysis/scanner.rs"),
                file("src/analysis/parser.rs"),
                file("src/metrics/health.rs"),
            ],
        );
        snap.call_graph = vec![
            call_edge("src/metrics/health.rs", "src/analysis/parser.rs"),
            call_edge("src/metrics/health.rs", "src/analysis/parser.rs"),
        ];
        check_report(&compute_health(&snap), &passing_check())
    }

    #[test]
    fn quality_is_the_integer_the_human_line_prints() {
        let r = report();
        let signal = r["quality_signal"].as_f64().unwrap();
        let points = r["quality"].as_u64().unwrap();
        assert_eq!(points, (signal * 10000.0).round() as u64);
        assert!(points <= 10000);
    }

    #[test]
    fn five_root_causes_each_carry_raw_and_score() {
        let r = report();
        for name in [
            "modularity",
            "acyclicity",
            "depth",
            "equality",
            "redundancy",
        ] {
            let cause = &r["root_causes"][name];
            assert!(cause["raw"].is_number(), "{name}.raw missing: {cause}");
            let score = cause["score"].as_f64().unwrap();
            assert!(
                (0.0..=1.0).contains(&score),
                "{name}.score out of range: {score}"
            );
        }
        assert_eq!(r["root_causes"].as_object().unwrap().len(), 5);
    }

    #[test]
    fn cross_module_edges_name_kind_and_match_the_import_count() {
        let r = report();
        let list = r["cross_module_edges"].as_array().unwrap();
        assert_eq!(
            list,
            &vec![
                json!({ "from": "src/analysis/scanner.rs", "to": "src/metrics/health.rs", "kind": "import" }),
                json!({ "from": "src/metrics/health.rs", "to": "src/analysis/parser.rs", "kind": "call" }),
            ]
        );
        let imports = list.iter().filter(|e| e["kind"] == "import").count();
        assert_eq!(
            imports as u64,
            r["import_edges"]["cross_module"].as_u64().unwrap()
        );
        assert_eq!(r["import_edges"]["total"].as_u64().unwrap(), 2);
    }

    #[test]
    fn render_is_byte_identical_across_runs() {
        let snap = snap_with_edges(
            vec![edge("src/analysis/scanner.rs", "src/metrics/health.rs")],
            vec![
                file("src/analysis/scanner.rs"),
                file("src/metrics/health.rs"),
            ],
        );
        let a = render(&compute_health(&snap), &passing_check());
        let b = render(&compute_health(&snap), &passing_check());
        assert_eq!(a, b);
        assert!(a.ends_with("}\n"));
    }

    #[test]
    fn violations_are_labelled_and_their_files_sorted() {
        let check = RuleCheckResult {
            passed: false,
            rules_checked: 2,
            violations: vec![RuleViolation {
                rule: "max_cycles".into(),
                severity: Severity::Error,
                message: "1 cycle, 0 allowed".into(),
                files: vec!["src/b.rs".into(), "src/a.rs".into()],
            }],
        };
        let snap = snap_with_edges(Vec::new(), Vec::new());
        let r = check_report(&compute_health(&snap), &check);
        assert_eq!(r["rules"]["passed"], false);
        assert_eq!(r["rules"]["checked"], 2);
        let v = &r["rules"]["violations"][0];
        assert_eq!(v["severity"], "error");
        assert_eq!(v["rule"], "max_cycles");
        assert_eq!(v["files"], json!(["src/a.rs", "src/b.rs"]));
    }
}
