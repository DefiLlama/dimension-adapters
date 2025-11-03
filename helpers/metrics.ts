// metrics help we to breakdown source of balances, ex: swapFees, borrowInterest, ...
// for creating new metrics, please carefully check this list before make an new one
// otherwise, we end up with alot of metrics and fragment data
export enum METRIC {
  CREATOR_FEES = 'Creator Fees',   // fees paid to creators (NFT, meme, content, artwork, music, etc)
  LP_FEES = 'LP Fees',           // fees paid to liquidity providers
  BORROW_INTEREST = 'Borrow Interest',   // interest paid by borrowers in lending markets
  LIQUIDATION_FEES = 'Liquidation Fees', // liquidation penalty and fees paid for liquidators and protocol in liquidation transactions
  FLASHLOAN_FEES = 'Flashloan Fees',     // fees paid by borrowers when execute flashloan from lending markets
  TOKEN_BUY_BACK = 'Token Buy Back',     // protocol buy back tokens
  SWAP_FEES = 'Token Swap Fees',         // fee charged from token swaps
  ASSETS_YIELDS = 'Assets Yields',       // protocols take users deposited assets and invest to other (on-chain or off-chain) platforms to generate yields
  MINT_REDEEM_FEES = 'Mint/Redeem Fees', // protocols take fees by mint/redeem tokens
  DEPOSIT_WITHDRAW_FEES = 'Deposit/Withdraw Fees', // protocols take fees by deposit or withdraw tokens
  MANAGEMENT_FEES = 'Management Fees', // protocols take fees manage assets for users
  TRANSACTION_GAS_FEES = 'Transaction Gas Fees', // Blockchain transactions gas fees paid by users
  TRANSACTION_BASE_FEES = 'Transaction Base Fees', // Blockchain transactions base fees paid by users
  TRANSACTION_PRIORITY_FEES = 'Transaction Priority Fees', // Blockchain transactions priority fees paid by users
  TRADING_FEES = 'Trading Fees', // apps, bots, frontend, wallets charge users fees by using trading
  MARGIN_FEES = 'Margin Fees', // perpetual, derivatives margin fees
  OPEN_CLOSE_FEES = 'Open/Close Fees', // trading open/close fees
  PERFORMANCE_FEES = 'Performance Fees', // protocols take fee based on how the assets under their management are performing
  STAKING_REWARDS = 'Staking Rewards', // rewards/yields/fees from staking
  MEV_REWARDS = 'MEV Rewards', // rewards from blockchain MEV activities
}
