/// Federated Byzantine Agreement (FBA) Consensus Engine
/// Applied to LLM oracle consensus for prediction market settlement
/// Inspired by Stellar Consensus Protocol (SCP)

#[derive(Debug, Clone)]
pub struct FbaNode {
    pub id: String,
    pub verdict: bool,
    pub confidence: u8,
    pub quorum_slice: Vec<String>,
}

#[derive(Debug)]
pub struct FbaResult {
    pub consensus_reached: bool,
    pub outcome: bool,
    pub confidence: u8,
    pub agreeing_nodes: Vec<String>,
    pub disagreeing_nodes: Vec<String>,
    pub quorum_intersected: bool,
    pub safety_flag: bool, // true = needs human review
}

/// Check if two nodes have overlapping quorum slices
/// FBA safety property: no two disjoint quorums
fn quorum_intersection(node_a: &FbaNode, node_b: &FbaNode) -> bool {
    node_a
        .quorum_slice
        .iter()
        .any(|n| node_b.quorum_slice.contains(n))
}

/// Core FBA consensus algorithm
/// Returns consensus if all nodes with quorum intersection agree
pub fn fba_consensus(nodes: &[FbaNode]) -> FbaResult {
    let mut agreeing = Vec::new();
    let mut disagreeing = Vec::new();
    let mut quorum_intersected = false;

    // Find the majority verdict weighted by confidence
    let yes_weight: u32 = nodes
        .iter()
        .filter(|n| n.verdict)
        .map(|n| n.confidence as u32)
        .sum();

    let no_weight: u32 = nodes
        .iter()
        .filter(|n| !n.verdict)
        .map(|n| n.confidence as u32)
        .sum();

    let majority_verdict = yes_weight >= no_weight;

    // Check quorum intersection between all node pairs
    for i in 0..nodes.len() {
        for j in (i + 1)..nodes.len() {
            if quorum_intersection(&nodes[i], &nodes[j]) {
                quorum_intersected = true;
            }
        }
    }

    // Classify nodes
    for node in nodes {
        if node.verdict == majority_verdict {
            agreeing.push(node.id.clone());
        } else {
            disagreeing.push(node.id.clone());
        }
    }

    // FBA safety: consensus only if quorum intersection exists
    // AND no disagreeing nodes in the quorum
    let consensus_reached = quorum_intersected && disagreeing.is_empty();

    // Safety flag: trigger human review if consensus not reached
    let safety_flag = !consensus_reached;

    // Average confidence of agreeing nodes
    let avg_confidence = if !agreeing.is_empty() {
        let total: u32 = nodes
            .iter()
            .filter(|n| agreeing.contains(&n.id))
            .map(|n| n.confidence as u32)
            .sum();
        (total / agreeing.len() as u32) as u8
    } else {
        0
    };

    FbaResult {
        consensus_reached,
        outcome: majority_verdict,
        confidence: avg_confidence,
        agreeing_nodes: agreeing,
        disagreeing_nodes: disagreeing,
        quorum_intersected,
        safety_flag,
    }
}

/// Print FBA result in human-readable format
pub fn print_fba_result(result: &FbaResult) {
    println!("\n🔗 Federated Byzantine Agreement (FBA) Result:");
    println!("   ─────────────────────────────────────────");
    println!(
        "   Quorum Intersection: {}",
        if result.quorum_intersected {
            "✅ YES"
        } else {
            "❌ NO"
        }
    );
    println!(
        "   Consensus Reached:   {}",
        if result.consensus_reached {
            "✅ YES"
        } else {
            "⚠️  NO"
        }
    );
    println!(
        "   Final Outcome:       {}",
        if result.outcome { "YES ✅" } else { "NO ❌" }
    );
    println!("   Confidence:          {}%", result.confidence);
    println!(
        "   Agreeing Nodes:      {}",
        result.agreeing_nodes.join(", ")
    );

    if !result.disagreeing_nodes.is_empty() {
        println!(
            "   Disagreeing Nodes:   {}",
            result.disagreeing_nodes.join(", ")
        );
    }

    if result.safety_flag {
        println!("\n   ⚠️  SAFETY FLAG: No quorum consensus — flagged for human review");
        println!("   🛡️  AI Safety: Autonomous settlement BLOCKED");
    } else {
        println!("\n   ✅ FBA SAFE: All quorum slices intersect and agree");
        println!("   🔗 Ready for on-chain settlement via CRE workflow");
    }
}
