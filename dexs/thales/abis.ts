export const OVERTIME_EVENT_ABI = {
  ticketCreated: "event TicketCreated(address ticket, address recipient, uint buyInAmount, uint fees, uint payout, uint totalQuote, address collateral)",
  boughtFromAmm: "event BoughtFromAmm(address buyer, address market, uint8 position, uint amount, uint sUSDPaid, address susd, address asset)",
  speedMarketCreated: "event MarketCreated(address market, address user, bytes32 asset, uint256 strikeTime, int64 strikePrice, uint8 direction, uint256 buyinAmount)",
  chainedMarketCreated: "event MarketCreated(address market, address user, bytes32 asset, uint64 timeFrame, uint64 strikeTime, int64 strikePrice, uint8[] directions, uint256 buyinAmount, uint256 payoutMultiplier, uint256 safeBoxImpact)",
  safeboxFeePaid: "event SafeBoxFeePaid(uint safeBoxFee, uint safeBoxAmount, address collateral)",
  safeboxSharePaid: "event SafeBoxSharePaid(uint safeBoxShare, uint safeBoxAmount)"
};
  