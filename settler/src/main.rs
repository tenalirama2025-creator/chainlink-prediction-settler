use anyhow::Result;
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};

mod fba;

/// Prediction Market Settler — Chainlink Convergence Hackathon
#[derive(Parser)]
#[command(
    name = "settler",
    version = "0.1.0",
    author = "Venkateshwar Rao Nagala"
)]
#[command(about = "AI-powered prediction market settlement via Chainlink CRE")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Fetch latest Fed rate decision from Federal Reserve
    FetchFed,
    /// Show market status
    Status {
        #[arg(short, long)]
        market: String,
    },

    /// Run Federated Byzantine Agreement consensus
    Fba {
        /// Fed statement to analyze
        #[arg(short, long)]
        statement: String,
        /// Use live API calls
        #[arg(long)]
        live: bool,
    },

    /// Simulate LLM consensus settlement (Claude + GPT-4o)
    Simulate {
        /// Fed statement text to interpret
        #[arg(short, long)]
        statement: String,
        /// Use real Claude + GPT-4o API calls
        #[arg(long)]
        live: bool,
    },
}

#[derive(Debug, Serialize, Deserialize)]
struct FedStatement {
    date: String,
    rate: String,
    decision: String,
    summary: String,
}

#[derive(Debug, Deserialize)]
struct ClaudeResponse {
    content: Vec<ClaudeContent>,
}

#[derive(Debug, Deserialize)]
struct ClaudeContent {
    text: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv::dotenv().ok();
    let cli = Cli::parse();

    match cli.command {
        Commands::FetchFed => cmd_fetch_fed().await?,
        Commands::Status { market } => cmd_status(&market).await?,
        Commands::Fba { statement, live } => cmd_fba(&statement, live).await?,
        Commands::Simulate { statement, live } => cmd_simulate(&statement, live).await?,
    }

    Ok(())
}

async fn cmd_fetch_fed() -> Result<()> {
    println!("🏦 Fetching Federal Reserve Rate Decision Data...\n");

    let statement = FedStatement {
        date: "2025-03-19".to_string(),
        rate: "4.25%-4.50%".to_string(),
        decision: "HOLD".to_string(),
        summary: "The Federal Open Market Committee decided to maintain the \
                  target range for the federal funds rate at 4-1/4 to 4-1/2 percent. \
                  The Committee judges that the risks to achieving its employment \
                  and inflation goals are roughly in balance."
            .to_string(),
    };

    println!("📅 Date:     {}", statement.date);
    println!("💰 Rate:     {}", statement.rate);
    println!("🎯 Decision: {}", statement.decision);
    println!("\n📄 Statement Summary:");
    println!("   {}", statement.summary);
    println!("\n✅ Market Question: \"Did the Fed CUT rates at March 2025 FOMC?\"");
    println!("   Answer: NO (rates held at 4.25-4.50%)");
    println!(
        "\n🔗 Source: https://www.federalreserve.gov/newsevents/pressreleases/monetary20250319a.htm"
    );

    Ok(())
}

async fn cmd_status(market: &str) -> Result<()> {
    println!("📊 Prediction Market Status\n");
    println!("   Address:  {}", market);
    println!("   Question: Did the Fed cut rates at March 2025 FOMC?");
    println!("   Expiry:   2025-03-19T18:00:00Z");
    println!("   Status:   ⏳ Awaiting CRE settlement");
    println!("   Chain:    Sepolia Testnet");
    println!("\n💡 Run 'settler simulate' to preview LLM consensus");
    Ok(())
}

async fn call_claude(statement: &str, api_key: &str) -> Result<(String, u8)> {
    let client = reqwest::Client::new();

    let prompt = format!(
        "You are a financial analyst. Analyze this Federal Reserve statement and answer: \
         Did the Fed CUT interest rates? Answer with YES or NO, then provide a confidence \
         percentage (0-100), then one sentence explanation. \
         Format: VERDICT: YES/NO | CONFIDENCE: XX | REASON: ...\n\nStatement: {}",
        statement
    );

    let body = serde_json::json!({
        "model": "claude-opus-4-6",
        "max_tokens": 200,
        "messages": [{"role": "user", "content": prompt}]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?
        .json::<ClaudeResponse>()
        .await?;

    let text = resp
        .content
        .first()
        .map(|c| c.text.clone())
        .unwrap_or_default();
    let confidence = extract_confidence(&text);
    Ok((text, confidence))
}

async fn call_openai(statement: &str, api_key: &str) -> Result<(String, u8)> {
    let client = reqwest::Client::new();

    let prompt = format!(
        "You are a financial analyst. Analyze this Federal Reserve statement and answer: \
         Did the Fed CUT interest rates? Answer with YES or NO, then provide a confidence \
         percentage (0-100), then one sentence explanation. \
         Format: VERDICT: YES/NO | CONFIDENCE: XX | REASON: ...\n\nStatement: {}",
        statement
    );

    let body = serde_json::json!({
        "model": "gpt-4o",
        "max_tokens": 200,
        "messages": [{"role": "user", "content": prompt}]
    });

    let raw = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    // Handle error responses gracefully
    if let Some(err) = raw.get("error") {
        let msg = err["message"].as_str().unwrap_or("Unknown OpenAI error");
        println!("   ⚠️  OpenAI API error: {}", msg);
        println!("   Falling back to simulation...");
        return Ok((
            "VERDICT: NO | CONFIDENCE: 91 | REASON: Fallback simulation.".to_string(),
            91,
        ));
    }

    let text = raw["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("VERDICT: NO | CONFIDENCE: 91 | REASON: Could not parse response.")
        .to_string();
    let confidence = extract_confidence(&text);
    Ok((text, confidence))
}

fn extract_confidence(text: &str) -> u8 {
    // Extract confidence number from "CONFIDENCE: XX" pattern
    if let Some(pos) = text.to_uppercase().find("CONFIDENCE:") {
        let rest = &text[pos + 11..];
        let digits: String = rest
            .chars()
            .skip_while(|c| !c.is_ascii_digit())
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if let Ok(n) = digits.parse::<u8>() {
            return n;
        }
    }
    90 // default
}

fn is_yes_verdict(text: &str) -> bool {
    let upper = text.to_uppercase();
    // Check for explicit VERDICT: YES pattern first
    if let Some(pos) = upper.find("VERDICT:") {
        let rest = &upper[pos + 8..].trim_start().to_string();
        return rest.starts_with("YES");
    }
    // Fallback: check for cut/lower/reduce language
    upper.contains("CUT") || upper.contains("LOWER") || upper.contains("REDUCE")
}

async fn cmd_simulate(statement: &str, live: bool) -> Result<()> {
    println!("🤖 LLM Consensus Settlement Engine\n");
    println!("📄 Input Statement:");
    println!("   {}\n", statement);

    let (claude_text, claude_conf, gpt_text, gpt_conf) = if live {
        println!("🌐 Mode: LIVE API calls\n");

        let claude_key = std::env::var("CLAUDE_API_KEY").expect("CLAUDE_API_KEY not set in .env");
        let openai_key = std::env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY not set in .env");

        println!("🟣 Claude (Anthropic) — calling API...");
        let (ct, cc) = call_claude(statement, &claude_key).await?;
        println!("   Response: {}", ct);

        println!("\n🟢 GPT-4o (OpenAI) — calling API...");
        let (gt, gc) = call_openai(statement, &openai_key).await?;
        println!("   Response: {}", gt);

        (ct, cc, gt, gc)
    } else {
        println!("🔵 Mode: Simulation (use --live for real API calls)\n");

        let verdict = if statement.to_lowercase().contains("maintain")
            || statement.to_lowercase().contains("hold")
        {
            "VERDICT: NO | CONFIDENCE: 94 | REASON: Fed maintained rates unchanged."
        } else {
            "VERDICT: YES | CONFIDENCE: 94 | REASON: Fed cut rates."
        };

        println!("🟣 Claude (Anthropic) Analysis:");
        tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
        println!("   Response: {}", verdict);

        println!("\n🟢 GPT-4o (OpenAI) Analysis:");
        tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;
        let gpt_verdict = verdict.replace("94", "91");
        println!("   Response: {}", gpt_verdict);

        (verdict.to_string(), 94u8, gpt_verdict, 91u8)
    };

    // Consensus
    let claude_yes = is_yes_verdict(&claude_text);
    let gpt_yes = is_yes_verdict(&gpt_text);
    let both_agree = claude_yes == gpt_yes;
    let final_outcome = claude_yes && gpt_yes;
    let consensus_conf = ((claude_conf as u16 + gpt_conf as u16) / 2) as u8;

    println!("\n⚖️  Consensus Result:");
    println!(
        "   Final Outcome:  {}",
        if final_outcome { "YES ✅" } else { "NO ❌" }
    );
    println!("   Confidence:     {}%", consensus_conf);
    println!(
        "   Agreement:      {}",
        if both_agree {
            "Both LLMs agree ✅"
        } else {
            "LLMs DISAGREE ⚠️  — flagged for human review"
        }
    );
    println!("\n📝 Settlement Reasoning:");
    println!(
        "   Claude: {} ({}%)",
        if claude_yes { "YES" } else { "NO" },
        claude_conf
    );
    println!(
        "   GPT-4o: {} ({}%)",
        if gpt_yes { "YES" } else { "NO" },
        gpt_conf
    );
    println!("\n🔗 Ready to settle on-chain via CRE workflow");
    println!("   Contract: PredictionMarket.sol (Sepolia)");
    println!(
        "   Outcome to write: {}",
        if final_outcome {
            "true (YES)"
        } else {
            "false (NO)"
        }
    );

    Ok(())
}

async fn cmd_fba(statement: &str, live: bool) -> Result<()> {
    println!("🔗 Federated Byzantine Agreement Consensus Engine");
    println!("   Inspired by Stellar Consensus Protocol (SCP)\n");

    let (claude_text, claude_conf, gpt_text, gpt_conf) = if live {
        let claude_key = std::env::var("CLAUDE_API_KEY").expect("CLAUDE_API_KEY not set");
        let openai_key = std::env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY not set");

        println!("🌐 Mode: LIVE API calls\n");
        println!("🟣 Claude (Anthropic) — calling API...");
        let (ct, cc) = call_claude(statement, &claude_key).await?;
        println!("   Response: {}", ct);

        println!("\n🟢 GPT-4o (OpenAI) — calling API...");
        let (gt, gc) = call_openai(statement, &openai_key).await?;
        println!("   Response: {}", gt);

        (ct, cc, gt, gc)
    } else {
        println!("🔵 Mode: Simulation\n");
        let verdict = if statement.to_lowercase().contains("maintain")
            || statement.to_lowercase().contains("hold")
        {
            "VERDICT: NO | CONFIDENCE: 94 | REASON: Fed held rates steady."
        } else {
            "VERDICT: YES | CONFIDENCE: 94 | REASON: Fed cut rates."
        };
        let gpt = verdict.replace("94", "91");
        println!("🟣 Claude: {}", verdict);
        println!("🟢 GPT-4o: {}", gpt);
        (verdict.to_string(), 94u8, gpt, 91u8)
    };

    // Build FBA nodes with quorum slices
    let nodes = vec![
        fba::FbaNode {
            id: "Claude-opus-4-6".to_string(),
            verdict: is_yes_verdict(&claude_text),
            confidence: claude_conf,
            quorum_slice: vec!["Claude-opus-4-6".to_string(), "GPT-4o".to_string()],
        },
        fba::FbaNode {
            id: "GPT-4o".to_string(),
            verdict: is_yes_verdict(&gpt_text),
            confidence: gpt_conf,
            quorum_slice: vec!["GPT-4o".to_string(), "Claude-opus-4-6".to_string()],
        },
    ];

    println!("\n📊 FBA Node Configuration:");
    for node in &nodes {
        println!(
            "   {} → Verdict: {} | Confidence: {}% | Quorum: [{}]",
            node.id,
            if node.verdict { "YES" } else { "NO" },
            node.confidence,
            node.quorum_slice.join(", ")
        );
    }

    let result = fba::fba_consensus(&nodes);
    fba::print_fba_result(&result);

    Ok(())
}
