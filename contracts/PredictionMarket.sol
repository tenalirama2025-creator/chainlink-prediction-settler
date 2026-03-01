// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title PredictionMarket
/// @notice Binary prediction market settled by CRE workflow + LLM consensus
/// @dev Deployed on Sepolia testnet for Chainlink Convergence Hackathon
contract PredictionMarket {
    // ── State ──────────────────────────────────────────────────────────────
    address public owner;
    address public settler; // CRE workflow address authorized to settle

    string  public question;
    uint256 public expiryTime;
    bool    public settled;
    bool    public outcome; // true = YES, false = NO

    string  public llmReasoning;   // Claude + GPT-4o interpretation
    uint8   public confidencePct;  // 0-100 consensus confidence

    // ── Events ─────────────────────────────────────────────────────────────
    event MarketCreated(string question, uint256 expiryTime);
    event MarketSettled(bool outcome, uint8 confidence, string reasoning);

    // ── Modifiers ──────────────────────────────────────────────────────────
    modifier onlySettler() {
        require(msg.sender == settler, "Only settler can call this");
        _;
    }

    modifier notSettled() {
        require(!settled, "Market already settled");
        _;
    }

    modifier afterExpiry() {
        require(block.timestamp >= expiryTime, "Market not expired yet");
        _;
    }

    // ── Constructor ────────────────────────────────────────────────────────
    constructor(
        string memory _question,
        uint256 _expiryTime,
        address _settler
    ) {
        owner      = msg.sender;
        question   = _question;
        expiryTime = _expiryTime;
        settler    = _settler;
        emit MarketCreated(_question, _expiryTime);
    }

    // ── Core Functions ─────────────────────────────────────────────────────

    /// @notice Called by CRE workflow to settle the market
    /// @param _outcome true = YES (Fed cut rates), false = NO
    /// @param _confidence LLM consensus confidence 0-100
    /// @param _reasoning Combined Claude + GPT-4o interpretation
    function settle(
        bool    _outcome,
        uint8   _confidence,
        string  memory _reasoning
    ) external onlySettler notSettled afterExpiry {
        settled       = true;
        outcome       = _outcome;
        confidencePct = _confidence;
        llmReasoning  = _reasoning;
        emit MarketSettled(_outcome, _confidence, _reasoning);
    }

    // ── View Functions ─────────────────────────────────────────────────────

    function getMarketState() external view returns (
        string  memory _question,
        uint256 _expiryTime,
        bool    _settled,
        bool    _outcome,
        uint8   _confidence,
        string  memory _reasoning
    ) {
        return (
            question,
            expiryTime,
            settled,
            outcome,
            confidencePct,
            llmReasoning
        );
    }

    function isExpired() external view returns (bool) {
        return block.timestamp >= expiryTime;
    }
}