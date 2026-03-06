# =============================================================================
# Chainlink Prediction Settler — Deploy & Run Script
# Author: Venkateshwar Rao Nagala
# GitHub: https://github.com/tenalirama2025-creator/chainlink-prediction-settler
# =============================================================================

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     Chainlink Prediction Settler — FBA Consensus Oracle      ║" -ForegroundColor Cyan
Write-Host "║     3 CRE Workflows: FBA Oracle + Privacy Payroll + DeFi     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# =============================================================================
# MENU
# =============================================================================

Write-Host "Select an option:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  [1] Simulate FBA Consensus        (FREE — no API keys needed)" -ForegroundColor Green
Write-Host "  [2] Live FBA Consensus             (requires Claude + OpenAI API keys)" -ForegroundColor Yellow
Write-Host "  [3] Run ALL 3 CRE Simulations      (requires CRE CLI)" -ForegroundColor Yellow
Write-Host "  [4] Run payroll_mcp simulation     (requires CRE CLI)" -ForegroundColor White
Write-Host "  [5] Run hyperliquid_mcp — Live DEX prices BTC/ETH/DOGE (requires CRE CLI)" -ForegroundColor White
Write-Host "  [6] Run ai_prediction_mcp simulation (requires CRE CLI)" -ForegroundColor White
Write-Host "  [7] Check contract status          (FREE — no API keys needed)" -ForegroundColor Green
Write-Host "  [8] Deploy to CRE                  (requires CRE Early Access)" -ForegroundColor Red
Write-Host "  [9] Exit" -ForegroundColor Gray
Write-Host ""

$choice = Read-Host "Enter option (1-9)"

# =============================================================================
# CONTRACT ADDRESS
# =============================================================================

$CONTRACT = "0xEA856dF995C58DEc18221C907DC221c4487Ae499"
$STATEMENT = "The Federal Open Market Committee decided to maintain the target range for the federal funds rate at 4-1/4 to 4-1/2 percent."

# =============================================================================
# OPTION 1 — SIMULATE FBA CONSENSUS (FREE)
# =============================================================================

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "▶ Running FBA Consensus Simulation (FREE mode)..." -ForegroundColor Green
    Write-Host ""
    D:\cargo_target\debug\settler simulate --statement $STATEMENT
    Write-Host ""
    Write-Host "✅ Simulation complete!" -ForegroundColor Green
}

# =============================================================================
# OPTION 2 — LIVE FBA CONSENSUS
# =============================================================================

elseif ($choice -eq "2") {
    Write-Host ""
    Write-Host "⚠️  Live mode requires Claude and OpenAI API keys (~$0.05 cost)" -ForegroundColor Yellow
    Write-Host ""
    
    $claudeKey = Read-Host "Enter your Claude API key (or press Enter to use .env)"
    $openaiKey = Read-Host "Enter your OpenAI API key (or press Enter to use .env)"
    
    if ($claudeKey -ne "") { $env:CLAUDE_API_KEY = $claudeKey }
    if ($openaiKey -ne "") { $env:OPENAI_API_KEY = $openaiKey }
    
    Write-Host ""
    Write-Host "▶ Running LIVE FBA Consensus..." -ForegroundColor Yellow
    Write-Host "  Claude Opus + GPT-4o evaluating:" -ForegroundColor White
    Write-Host "  '$STATEMENT'" -ForegroundColor White
    Write-Host ""
    
    D:\cargo_target\debug\settler fba --statement $STATEMENT --live
    
    Write-Host ""
    Write-Host "✅ Live FBA consensus complete!" -ForegroundColor Green
}

# =============================================================================
# OPTION 3 — RUN ALL 3 CRE SIMULATIONS
# =============================================================================

elseif ($choice -eq "3") {
    Write-Host ""
    Write-Host "▶ Running ALL 3 CRE Workflow Simulations..." -ForegroundColor Cyan
    Write-Host ""

    # payroll_mcp
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "  [1/3] payroll_mcp — Privacy-Preserving Payroll" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Set-Location workflow\payroll_mcp
    $env:PAYROLL_API_KEY_VALUE = "dev-api-key"
    cre workflow simulate . --target staging-settings
    Set-Location ..\..
    Write-Host ""

    # hyperliquid_mcp
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "  [2/3] hyperliquid_mcp — DeFi Market Intelligence" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Set-Location workflow\hyperliquid_mcp
    cre workflow simulate . --target staging-settings
    Set-Location ..\..
    Write-Host ""

    # ai_prediction_mcp
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "  [3/3] ai_prediction_mcp — FBA Consensus Oracle" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Set-Location workflow\ai_prediction_mcp
    $env:CLAUDE_API_KEY_VALUE = "dev-api-key"
    $env:OPENAI_API_KEY_VALUE = "dev-api-key"
    cre workflow simulate . --target staging-settings
    Set-Location ..\..
    Write-Host ""

    Write-Host "✅ All 3 CRE simulations complete!" -ForegroundColor Green
}

# =============================================================================
# OPTION 4 — PAYROLL MCP ONLY
# =============================================================================

elseif ($choice -eq "4") {
    Write-Host ""
    Write-Host "▶ Running payroll_mcp simulation..." -ForegroundColor Green
    Set-Location workflow\payroll_mcp
    $env:PAYROLL_API_KEY_VALUE = "dev-api-key"
    cre workflow simulate . --target staging-settings
    Set-Location ..\..
    Write-Host ""
    Write-Host "✅ payroll_mcp simulation complete!" -ForegroundColor Green
}

# =============================================================================
# OPTION 5 — HYPERLIQUID MCP ONLY
# =============================================================================

elseif ($choice -eq "5") {
    Write-Host ""
    Write-Host "▶ Running hyperliquid_mcp — fetching live BTC/ETH/DOGE prices..." -ForegroundColor Green
    Set-Location workflow\hyperliquid_mcp
    cre workflow simulate . --target staging-settings
    Set-Location ..\..
    Write-Host ""
    Write-Host "✅ hyperliquid_mcp complete — live prices fetched!" -ForegroundColor Green
}

# =============================================================================
# OPTION 6 — AI PREDICTION MCP ONLY
# =============================================================================

elseif ($choice -eq "6") {
    Write-Host ""
    Write-Host "▶ Running ai_prediction_mcp simulation..." -ForegroundColor Green
    Set-Location workflow\ai_prediction_mcp
    $env:CLAUDE_API_KEY_VALUE = "dev-api-key"
    $env:OPENAI_API_KEY_VALUE = "dev-api-key"
    cre workflow simulate . --target staging-settings
    Set-Location ..\..
    Write-Host ""
    Write-Host "✅ ai_prediction_mcp simulation complete!" -ForegroundColor Green
}

# =============================================================================
# OPTION 7 — CHECK CONTRACT STATUS
# =============================================================================

elseif ($choice -eq "7") {
    Write-Host ""
    Write-Host "▶ Checking PredictionMarket contract status..." -ForegroundColor Green
    Write-Host ""
    D:\cargo_target\debug\settler status --market $CONTRACT
    Write-Host ""
    Write-Host "🔗 View on Blockscout:" -ForegroundColor Cyan
    Write-Host "   https://eth-sepolia.blockscout.com/address/$CONTRACT" -ForegroundColor Cyan
}

# =============================================================================
# OPTION 8 — DEPLOY TO CRE
# =============================================================================

elseif ($choice -eq "8") {
    Write-Host ""
    Write-Host "⚠️  CRE Deployment requires Early Access approval" -ForegroundColor Red
    Write-Host "   Apply at: https://cre.chain.link" -ForegroundColor Yellow
    Write-Host ""
    
    $confirm = Read-Host "Do you have CRE Early Access? (yes/no)"
    
    if ($confirm -eq "yes") {
        Write-Host ""
        Write-Host "Select workflow to deploy:" -ForegroundColor Yellow
        Write-Host "  [1] payroll_mcp" -ForegroundColor White
        Write-Host "  [2] hyperliquid_mcp" -ForegroundColor White
        Write-Host "  [3] ai_prediction_mcp" -ForegroundColor White
        Write-Host "  [4] All 3 workflows" -ForegroundColor White
        Write-Host ""
        
        $deployChoice = Read-Host "Enter option (1-4)"
        
        if ($deployChoice -eq "1" -or $deployChoice -eq "4") {
            Write-Host "▶ Deploying payroll_mcp..." -ForegroundColor Yellow
            Set-Location workflow\payroll_mcp
            cre workflow deploy . --target staging-settings
            Set-Location ..\..
        }
        if ($deployChoice -eq "2" -or $deployChoice -eq "4") {
            Write-Host "▶ Deploying hyperliquid_mcp..." -ForegroundColor Yellow
            Set-Location workflow\hyperliquid_mcp
            cre workflow deploy . --target staging-settings
            Set-Location ..\..
        }
        if ($deployChoice -eq "3" -or $deployChoice -eq "4") {
            Write-Host "▶ Deploying ai_prediction_mcp..." -ForegroundColor Yellow
            Set-Location workflow\ai_prediction_mcp
            cre workflow deploy . --target staging-settings
            Set-Location ..\..
        }
        Write-Host ""
        Write-Host "✅ Deployment complete!" -ForegroundColor Green
    }
    else {
        Write-Host ""
        Write-Host "Please apply for CRE Early Access at: https://cre.chain.link" -ForegroundColor Yellow
    }
}

# =============================================================================
# OPTION 9 — EXIT
# =============================================================================

elseif ($choice -eq "9") {
    Write-Host ""
    Write-Host "Goodbye! 🚀" -ForegroundColor Cyan
    Write-Host ""
}

else {
    Write-Host ""
    Write-Host "❌ Invalid option. Please run deploy.ps1 again." -ForegroundColor Red
}

Write-Host ""
