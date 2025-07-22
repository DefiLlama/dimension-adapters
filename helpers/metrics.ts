// metrics help we to breakdown source of balances, ex: swapFees, borrowInterest, ...
// for creating new metrics, please carefully check this list before make an new one
// otherwise, we end up with alot of metrics and fragment data
export enum METRIC {
  BORROW_INTEREST = 'Borrow Interest',   // interest paid by borrowers in lending markets
  LIQUIDATION_FEES = 'Liquidation Fees', // liquidation penalty and fees paid for liquidators and protocol in liquidation transactions
  FLASHLOAN_FEES = 'Flashloan Fees',     // fees paid by borrowers when execute flashloan from lending markets
}
