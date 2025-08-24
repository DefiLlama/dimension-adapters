export const abi = {
    MARKET_CREATION_EVENT: 'event MarketCreated(address market,tuple(string name,string symbol,bool k_isIsolatedOnly, uint32 k_maturity,uint16 k_tokenId,uint24 k_marketId,uint8 k_tickStep, uint16 k_iTickThresh) immData, tuple(uint16 maxOpenOrders, address markRateOracle, address fIndexOracle, uint128 hardOICap, uint64 takerFee, uint64 otcFee, tuple(uint64 base,uint64 slope,uint64 feeRate)liqSettings,uint64 kIM, uint64 kMM,uint32 tThresh, uint16 maxRateDeviationFactorBase1e4, uint16 closingOrderBoundBase1e4, int16 loUpperConstBase1e4, int16 loUpperSlopeBase1e4, int16 loLowerConstBase1e4, int16 loLowerSlopeBase1e4, uint8 status, bool useImpliedAsMarkRate) config)',

    MARKET_ORDERS_FILLED_EVENT: 'event MarketOrdersFilled (bytes26 user, uint256 totalTrade, uint256 totalFees)',

    OTC_SWAP_EVENT: 'event OtcSwap (bytes26 user, bytes26 counterParty, uint256 trade, int256 cashToCounter, uint256 otcFee)',

    PAYMENT_FROM_SETTLEMENT_EVENT: 'event PaymentFromSettlement (bytes26 user, uint256 lastFTime, uint256 latestFTime, int256 payment, uint256 fees)',
}