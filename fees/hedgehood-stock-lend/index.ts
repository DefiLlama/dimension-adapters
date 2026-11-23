import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

// StockLend by HedgeHood (hedgehood.io/loan): isolated stock-lending markets on Robinhood Chain. A borrower posts
// collateral, borrows a stock token for a fixed term, and pays an opening fee at the borrow and a time fee at the
// repayment, both in the market's collateral token (USDG; SGOV or SPY on two retired markets).
const MARKETS = [
  '0x4977c00783605750789cEEc5A3cbfaEDA3f015DB', // SPCX
  '0x426A79a122c6A0A47fE2F5c5F41C4BC4d102c414', // NVDA
  '0x0Ac2B1411E4c0623D936DD3E8586eA5EeF1eADB2', // MU
  '0x8e8f3CC988e0D56C52a49F3055aacd62ef1b970c', // GME
  '0x5C88B4f4a1acBBb1E5E63d4414bc194477bD2A7a', // CRCL
  '0x6Ddc8f2dE5DCe2ff2EAc2c12CD96C936948C2912', // USO
  // retired: closed to new loans, open loans still repay. The three earliest test markets (GME v1/v2, SPCX v2,
  // an older contract version) are left out.
  '0xD233AC577cd0010A7B67EF2d0DA0447FD02375f8', // GME v3, SGOV collateral
  '0x412a33d1266B5D408191E66b31c372580d9168c8', // GME v3, SPY collateral
  '0x3D15BB430a70c3dD4ADf329ee7E089885a887e09', // GME v3
];

const PARAMS = 'tuple(uint16 imOpenBps,uint16 imClosedBps,uint16 mmBps,uint16 alphaBps,uint16 baseRateBps,uint16 closedRateBps,uint16 liqBonusBps,uint16 buyInBonusBps,uint16 protocolBps,uint16 maxBuyInSlipBps,uint16 slipGrowthBps,uint16 slipCapBps,uint32 termOpen,uint32 termClosed,uint32 reopenGrace,uint128 borrowCap)';
const ABI = {
  collateral: 'address:collateral',
  getParams: `function getParams() view returns (${PARAMS})`,
  borrow: 'event Borrow(uint256 indexed id, address indexed borrower, uint256 amount, uint256 collateral, uint256 feeOpen, uint256 premiumBps, uint64 maturity)',
  repay: 'event Repay(uint256 indexed id, uint256 amount, uint256 timeFee)',
};

const LABELS = {
  open: { fees: 'Loan Opening Fees', protocol: 'Loan Opening Fees To Protocol', lenders: 'Loan Opening Fees To Lenders' },
  time: { fees: 'Loan Time Fees', protocol: 'Loan Time Fees To Protocol', lenders: 'Loan Time Fees To Lenders' },
};

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [borrows, repays] = await Promise.all([
    options.getLogs({ targets: MARKETS, eventAbi: ABI.borrow, flatten: false }),
    options.getLogs({ targets: MARKETS, eventAbi: ABI.repay, flatten: false }),
  ]);

  // Only markets with loan activity in the window are read: they exist at the window's end block, while a market
  // deployed later (CRCL, USO) would fail the call on earlier days.
  const active = MARKETS
    .map((market, i) => ({ market, openFees: borrows[i].map((l: any) => l.feeOpen), timeFees: repays[i].map((l: any) => l.timeFee) }))
    .filter(({ openFees, timeFees }) => openFees.length || timeFees.length);

  if (active.length) {
    const calls = active.map(({ market }) => market);
    const [collaterals, params] = await Promise.all([
      options.api.multiCall({ abi: ABI.collateral, calls }),
      options.api.multiCall({ abi: ABI.getParams, calls }),
    ]);
    active.forEach(({ openFees, timeFees }, i) => {
      const token = collaterals[i];
      const protocolBps = BigInt(params[i].protocolBps);
      const add = (fee: bigint, labels: typeof LABELS.open) => {
        const protocolCut = fee * protocolBps / 10_000n;
        dailyFees.add(token, fee, labels.fees);
        dailyRevenue.add(token, protocolCut, labels.protocol);
        dailySupplySideRevenue.add(token, fee - protocolCut, labels.lenders);
      };
      for (const fee of openFees) add(BigInt(fee), LABELS.open);
      for (const fee of timeFees) add(BigInt(fee), LABELS.time);
    });
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-11',
  fetch,
  methodology: {
    Fees: "Fees borrowers pay to borrow tokenized stocks on HedgeHood StockLend: an opening fee when a loan is taken and a time fee when it is repaid. Excludes flash-loan fees (paid in the stock token), bonuses paid to liquidators, and the time fee settled inside a liquidation or buy-in, which the contract does not record.",
    UserFees: "Opening and time fees paid by borrowers on HedgeHood StockLend loans of tokenized stocks.",
    Revenue: "HedgeHood's share of the opening and time fees borrowers pay, set per market (10% on every market as of November 2026).",
    ProtocolRevenue: "HedgeHood's share of the opening and time fees borrowers pay (10% on every market as of November 2026), collected by the HedgeHood treasury.",
    SupplySideRevenue: "The rest of the opening and time fees borrowers pay (90% on every market as of November 2026), streamed to the lenders who supplied the stock.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.open.fees]: "Charged when a loan opens; it grows with how far the stock token trades above its oracle price on the DEX pool, and is zero when there is no such premium.",
      [LABELS.time.fees]: "Charged at repayment: an annual rate on the borrowed amount for the time the loan was open (5% a year while the stock market is open and 20% while it is closed, as of November 2026).",
    },
    UserFees: {
      [LABELS.open.fees]: "Opening fees borrowers pay when a loan opens.",
      [LABELS.time.fees]: "Time fees borrowers pay at repayment for the time the loan was open.",
    },
    Revenue: {
      [LABELS.open.protocol]: "HedgeHood's share of loan opening fees.",
      [LABELS.time.protocol]: "HedgeHood's share of loan time fees.",
    },
    ProtocolRevenue: {
      [LABELS.open.protocol]: "HedgeHood's share of loan opening fees, collected by the treasury.",
      [LABELS.time.protocol]: "HedgeHood's share of loan time fees, collected by the treasury.",
    },
    SupplySideRevenue: {
      [LABELS.open.lenders]: "Lenders' share of loan opening fees.",
      [LABELS.time.lenders]: "Lenders' share of loan time fees.",
    },
  },
};

export default adapter;
