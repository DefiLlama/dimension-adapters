// Event and function signatures taken from the verified implementations (Optimism explorer, 2026-09-28):
// SportsAMMV2 0xf33a30d256a1febbee39d5a369ee9fa8835986b5, SportsAMMV2LiquidityPool 0x4107ce78d22c45a408d0993e02b209f075ff1547,
// FreeBetsHolder 0x4786bf5d88eb6463a08121f653fb706938e31eb0, CasinoCoreV2 0xc93e2041fa8a9adf8c964bb89b3f9996020686b0,
// Dice 0x444a0e3f3c6ad7bd044eaa9515dc87edee8baa21, Roulette 0x3789fc3a6aab402fe3adfe30513f97bd8ff8d039,
// Baccarat 0xba580533bfe01f1634c1229ce6e4acc9467f33de, Blackjack 0xc6c188875f1f152a1d3344b55859cadb90394ab3,
// Slots 0x920a78f68e68343ea8e9938d95c0ac554ff5863c, SpeedMarketsAMM 0x8aa5a8b2b43de6c06e3a2d04e2fd01678c32081d,
// ChainedSpeedMarketsAMM 0xeeba0f0602b8f559b7eec7643a674a4d98dd243d, SafeBoxBuyback 0x1f240d3704064da8635ef6f1936cb662654e7503
export const EVENTS = {
  // SportsAMMV2
  ticketCreated: "event TicketCreated(address ticket, address recipient, uint256 buyInAmount, uint256 fees, uint256 payout, uint256 totalQuote, address collateral)",
  // emitted once per ticket on exercise, cancel, mark-as-lost and cash-out
  ticketResolved: "event TicketResolved(address ticket, address ticketOwner, bool isUserTheWinner)",
  sportsbookReferrerPaid: "event ReferrerPaid(address refferer, address trader, uint256 amount, uint256 volume, address collateral)",
  safeBoxFeePaid: "event SafeBoxFeePaid(uint256 safeBoxFee, uint256 safeBoxAmount, address collateral)",

  // SportsAMMV2LiquidityPool, emitted at round close when the round was profitable
  safeBoxSharePaid: "event SafeBoxSharePaid(uint256 safeBoxShare, uint256 safeBoxAmount)",

  // FreeBetsHolder: `earned` is the net winnings sent to the user, the free bet stake goes back to the protocol
  freeBetTicketResolved: "event FreeBetTicketResolved(address ticket, address user, uint256 earned)",
  freeBetCasinoBetResolved: "event CasinoBetResolved(address indexed casino, address indexed user, address indexed collateral, uint256 exercized, uint256 stake, uint256 earned)",
  freeBetSpeedMarketResolved: "event FreeBetSpeedMarketResolved(address speedMarket, address user, uint256 earned)",

  // Casino games with their own bankroll (Dice and Roulette share this BetResolved signature)
  diceRouletteBetResolved: "event BetResolved(uint256 indexed betId, uint256 indexed requestId, address indexed user, uint8 result, bool won, uint256 payout)",
  baccaratBetResolved: "event BetResolved(uint256 indexed betId, uint256 indexed requestId, address indexed user, uint8 result, bool won, bool isPush, uint256 payout, uint8 playerTotal, uint8 bankerTotal)",
  blackjackHandResolved: "event HandResolved(uint256 indexed handId, uint256 indexed requestId, address indexed user, uint8 result, uint256 payout)",
  slotsSpinResolved: "event SpinResolved(uint256 indexed spinId, uint256 indexed requestId, address indexed user, uint8[3] reels, bool won, uint256 payout)",
  // same signature on the five games above and on CasinoCoreV2
  casinoReferrerPaid: "event ReferrerPaid(address indexed referrer, address indexed user, uint256 amount, uint256 betAmount, address collateral)",

  // CasinoCoreV2
  casinoStakePulled: "event StakePulled(address indexed game, address indexed user, address indexed collateral, uint256 amount)",
  casinoPayoutSent: "event PayoutSent(address indexed game, address indexed user, address indexed collateral, uint256 amount, bool isFreeBet, uint256 originalStake)",

  // SpeedMarketsAMM / ChainedSpeedMarketsAMM
  speedMarketCreated: "event MarketCreated(address _market, address _user, bytes32 _asset, uint256 _strikeTime, int64 _strikePrice, uint8 _direction, uint256 _buyinAmount)",
  speedMarketResolved: "event MarketResolved(address _market, uint8 _result, bool _userIsWinner)",
  chainedMarketCreated: "event MarketCreated(address market, address user, bytes32 asset, uint64 timeFrame, uint64 strikeTime, int64 strikePrice, uint8[] directions, uint256 buyinAmount, uint256 payoutMultiplier, uint256 safeBoxImpact)",
  chainedMarketResolved: "event MarketResolved(address market, bool userIsWinner)",

  // legacy ThalesAMM / RangedAMM
  boughtFromAmm: "event BoughtFromAmm(address buyer, address market, uint8 position, uint256 amount, uint256 sUSDPaid, address susd, address asset)",

  // SafeBoxBuyback: _amountIn of sUSD() spent (USDC; Synthetix sUSD on Optimism before 2024-12-11), _amountOut of OVER bought and burned
  buybackExecuted: "event BuybackExecuted(uint256 _amountIn, uint256 _amountOut)",
};

export const ABIS = {
  ticket: {
    buyInAmount: "uint256:buyInAmount",
    // 0 when lost, buy-in when cancelled or every leg voided, cash-out amount when cashed out
    finalPayout: "uint256:finalPayout",
    collateral: "address:collateral",
    cancelled: "bool:cancelled",
  },
  casino: {
    getBetBase: "function getBetBase(uint256 betId) view returns (address user, address collateral, uint256 amount, uint256 payout, uint256 requestId, uint256 placedAt, uint256 resolvedAt, uint256 reservedProfit)",
    getHandBase: "function getHandBase(uint256 handId) view returns (address user, address collateral, uint256 amount, uint256 payout, uint256 requestId, uint256 placedAt, uint256 resolvedAt, uint256 reservedProfit)",
    getSpinBase: "function getSpinBase(uint256 spinId) view returns (address user, address collateral, uint256 amount, uint256 payout, uint256 requestId, uint256 placedAt, uint256 resolvedAt, uint256 reservedProfit)",
    // second hand of a split blackjack hand; the hand's payout already includes it
    getSplitDetails: "function getSplitDetails(uint256 handId) view returns (uint256 amount2, uint256 payout2, uint8 player2CardCount, uint8 activeHand, bool isAceSplit, bool isDoubled2, uint8 result2, uint8[] player2Cards)",
    isFreeBet: "function isFreeBet(uint256) view returns (bool)",
  },
  speedMarket: {
    user: "address:user",
    buyinAmount: "uint256:buyinAmount",
    safeBoxImpact: "uint256:safeBoxImpact",
    lpFee: "uint256:lpFee",
    // payout() and collateral() only exist on markets created after multi-collateral support was added
    payout: "uint256:payout",
    collateral: "address:collateral",
    payoutMultiplier: "uint256:payoutMultiplier",
    numOfDirections: "uint8:numOfDirections",
  },
  sUSD: "address:sUSD",
};
