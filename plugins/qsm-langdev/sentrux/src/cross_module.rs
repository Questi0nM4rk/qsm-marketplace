//! Which edges cross a module boundary — the ones the modularity score charges.
//!
//! `root_causes::compute_modularity_q` counts the pairs that stay inside a
//! module and discards the rest; `stability::compute_coupling_score` counts the
//! import edges that leave one. Both hold exactly the edges that cost the score
//! and neither says which. This module collects them once, over the same edge
//! sets, so a caller comparing two trees can name what moved instead of only
//! how much.
//!
//! qsm addition on top of upstream sentrux 0.5.7.

use crate::core::path_utils::module_of;
use crate::core::types::{CallEdge, ImportEdge};
use std::collections::BTreeSet;

/// Where an edge came from. Q spans both graphs, and a reader shown a bare
/// file pair goes hunting for an import statement that may not exist.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum EdgeKind {
    Import,
    Call,
}

impl EdgeKind {
    /// The label a consumer reads: `"import"` or `"call"`.
    pub fn label(self) -> &'static str {
        match self {
            EdgeKind::Import => "import",
            EdgeKind::Call => "call",
        }
    }
}

/// One dependency between two files in different modules.
///
/// Field order is the sort order: `from`, then `to`, then `kind`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct CrossModuleEdge {
    pub from: String,
    pub to: String,
    pub kind: EdgeKind,
}

/// Every `(from, to, kind)` that crosses a module boundary, deduplicated and
/// sorted, so two runs over one tree produce the same list.
///
/// One entry per file pair per kind. The call graph carries one edge per call
/// site, so a pair of files can appear there many times and still be one
/// dependency. A pair that is both imported and called appears twice, once per
/// kind; Q deduplicates across kinds and charges it once.
///
/// Pass the same edges Q sees: import edges with module declarations already
/// filtered out, and the full call graph.
pub fn collect_cross_module_edges(
    import_edges: &[ImportEdge],
    call_edges: &[CallEdge],
) -> Vec<CrossModuleEdge> {
    let mut crossings = BTreeSet::new();
    for e in import_edges {
        insert_if_crossing(&mut crossings, &e.from_file, &e.to_file, EdgeKind::Import);
    }
    for e in call_edges {
        insert_if_crossing(&mut crossings, &e.from_file, &e.to_file, EdgeKind::Call);
    }
    crossings.into_iter().collect()
}

/// Extensions an edge may point at. The import resolver matches a specifier
/// against file stems, so a Rust `use super::rules::...` in a repository
/// holding `.sentrux/rules.toml` resolves to that config file and lands here
/// as a dependency on another module. It is a resolver artifact, not a
/// dependency, and a caller that blocks on a new crossing must not block on
/// one of these.
const SOURCE_EXTENSIONS: &[&str] = &[
    "rs", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "pyi", "go", "cs", "java", "kt", "rb",
    "php", "swift", "c", "h", "cc", "cpp", "hpp", "sh", "bash", "zsh", "fish",
];

fn is_source(path: &str) -> bool {
    match path.rsplit_once('.') {
        Some((_, ext)) => SOURCE_EXTENSIONS.contains(&ext),
        None => false,
    }
}

fn insert_if_crossing(
    crossings: &mut BTreeSet<CrossModuleEdge>,
    from: &str,
    to: &str,
    kind: EdgeKind,
) {
    if module_of(from) != module_of(to) && is_source(from) && is_source(to) {
        crossings.insert(CrossModuleEdge {
            from: from.to_string(),
            to: to.to_string(),
            kind,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::metrics::test_helpers::{call_edge, edge};

    // Two directory levels under a non-dominant root group at depth 2
    // (path_utils::tests::depth_2_grouping), so these two are different
    // modules and two files under one of them are the same module.
    const IN_ANALYSIS: &str = "src/analysis/scanner.rs";
    const ALSO_ANALYSIS: &str = "src/analysis/parser.rs";
    const IN_METRICS: &str = "src/metrics/health.rs";

    #[test]
    fn crossing_import_is_listed_as_import() {
        let out = collect_cross_module_edges(&[edge(IN_ANALYSIS, IN_METRICS)], &[]);
        assert_eq!(
            out,
            vec![CrossModuleEdge {
                from: IN_ANALYSIS.into(),
                to: IN_METRICS.into(),
                kind: EdgeKind::Import,
            }]
        );
    }

    #[test]
    fn crossing_call_is_listed_as_call() {
        let out = collect_cross_module_edges(&[], &[call_edge(IN_METRICS, IN_ANALYSIS)]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, EdgeKind::Call);
        assert_eq!(out[0].from, IN_METRICS);
        assert_eq!(out[0].to, IN_ANALYSIS);
    }

    #[test]
    fn edge_inside_one_module_is_not_listed() {
        let out = collect_cross_module_edges(
            &[edge(IN_ANALYSIS, ALSO_ANALYSIS)],
            &[call_edge(ALSO_ANALYSIS, IN_ANALYSIS)],
        );
        assert!(
            out.is_empty(),
            "same-module edges cost nothing, got {out:?}"
        );
    }

    #[test]
    fn pair_that_is_both_import_and_call_appears_once_per_kind() {
        let out = collect_cross_module_edges(
            &[edge(IN_ANALYSIS, IN_METRICS)],
            &[call_edge(IN_ANALYSIS, IN_METRICS)],
        );
        let kinds: Vec<EdgeKind> = out.iter().map(|e| e.kind).collect();
        assert_eq!(kinds, vec![EdgeKind::Import, EdgeKind::Call]);
        assert!(out
            .iter()
            .all(|e| e.from == IN_ANALYSIS && e.to == IN_METRICS));
    }

    #[test]
    fn many_call_sites_between_two_files_are_one_edge() {
        let calls = vec![
            call_edge(IN_ANALYSIS, IN_METRICS),
            call_edge(IN_ANALYSIS, IN_METRICS),
            call_edge(IN_ANALYSIS, IN_METRICS),
        ];
        assert_eq!(collect_cross_module_edges(&[], &calls).len(), 1);
    }

    #[test]
    fn output_order_does_not_depend_on_input_order() {
        let forward = vec![
            edge(IN_ANALYSIS, IN_METRICS),
            edge(IN_METRICS, IN_ANALYSIS),
            edge(ALSO_ANALYSIS, IN_METRICS),
        ];
        let mut reversed = forward.clone();
        reversed.reverse();
        let a = collect_cross_module_edges(&forward, &[]);
        let b = collect_cross_module_edges(&reversed, &[]);
        assert_eq!(a, b);
        assert_eq!(
            a[0].from, ALSO_ANALYSIS,
            "sorted by from, then to, then kind"
        );
    }

    #[test]
    fn labels_are_the_two_words_a_consumer_matches_on() {
        assert_eq!(EdgeKind::Import.label(), "import");
        assert_eq!(EdgeKind::Call.label(), "call");
    }

    // The resolver matches an import specifier against file stems, so a Rust
    // `use super::rules::...` in a repository holding `.sentrux/rules.toml`
    // resolves to that config file. A gate that blocks on a new crossing
    // would block on it, and there is nothing the author can do about it.
    #[test]
    fn an_edge_onto_a_config_file_is_a_resolver_artifact_not_a_dependency() {
        let edges = vec![edge(IN_METRICS, ".sentrux/rules.toml")];
        assert_eq!(collect_cross_module_edges(&edges, &[]), vec![]);
    }

    #[test]
    fn an_edge_between_two_sources_in_different_modules_still_counts() {
        let edges = vec![edge(IN_ANALYSIS, IN_METRICS)];
        assert_eq!(collect_cross_module_edges(&edges, &[]).len(), 1);
    }
}
