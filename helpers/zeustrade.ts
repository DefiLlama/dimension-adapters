// ZEUS (https://zeustrade.io) is a GMX v1 style perpetual exchange on Base: every
// crypto and US stock market trades against one shared ZLP pool held by the Vault.

// Vault: https://basescan.org/address/0xEAC80C1722E8990AAFeB2Ea3bcF040D29f722bd9
export const VAULT = '0xEAC80C1722E8990AAFeB2Ea3bcF040D29f722bd9'

// Vault amounts in USD use 30 decimals, as in GMX v1.
export const usd30 = (value: any) => Number(value) / 1e30

export const EVENTS = {
  increasePosition: 'event IncreasePosition(bytes32 key, address account, address collateralToken, address indexToken, uint256 collateralDelta, uint256 sizeDelta, bool isLong, uint256 price, uint256 fee)',
  decreasePosition: 'event DecreasePosition(bytes32 key, address account, address collateralToken, address indexToken, uint256 collateralDelta, uint256 sizeDelta, bool isLong, uint256 price, uint256 fee)',
  liquidatePosition: 'event LiquidatePosition(bytes32 key, address account, address collateralToken, address indexToken, bool isLong, uint256 size, uint256 collateral, uint256 reserveAmount, int256 realisedPnl, uint256 markPrice)',
  collectMarginFees: 'event CollectMarginFees(address token, uint256 feeUsd, uint256 feeTokens)',
  swap: 'event Swap(address account, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 amountOutAfterFees, uint256 feeBasisPoints)',
  buyUSDG: 'event BuyUSDG(address account, address token, uint256 tokenAmount, uint256 usdgAmount, uint256 feeBasisPoints)',
  sellUSDG: 'event SellUSDG(address account, address token, uint256 usdgAmount, uint256 tokenAmount, uint256 feeBasisPoints)',
}
