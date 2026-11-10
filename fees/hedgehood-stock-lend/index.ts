import * as sdk from '@defillama/sdk';
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
const FIRST_BLOCK = 60551889; // 2026-09-11, the earliest of these markets

const PARAMS = 'tuple(uint16 imOpenBps,uint16 imClosedBps,uint16 mmBps,uint16 alphaBps,uint16 baseRateBps,uint16 closedRateBps,uint16 liqBonusBps,uint16 buyInBonusBps,uint16 protocolBps,uint16 maxBuyInSlipBps,uint16 slipGrowthBps,uint16 slipCapBps,uint32 termOpen,uint32 termClosed,uint32 reopenGrace,uint128 borrowCap)';
const ABI = {
  collateral: 'address:collateral',
  getParams: `function getParams() view returns (${PARAMS})`,
  borrow: 'event Borrow(uint256 indexed id, address indexed borrower, uint256 amount, uint256 collateral, uint256 feeOpen, uint256 premiumBps, uint64 maturity)',
  repay: 'event Repay(uint256 indexed id, uint256 amount, uint256 timeFee)',
};

const OPEN = 'Loan opening fees';
const TIME = 'Loan time fees';

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  // getFromBlock() is already the block after the previous window's closing block, so adjacent pulls do not overlap
  const [firstBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  // A failed lookup returns null: rescanning from deployment would count earlier loans again
  if (!Number.isInteger(firstBlock) || !Number.isInteger(toBlock)) throw new Error('StockLend: block lookup failed');
  const fromBlock = Math.max(firstBlock, FIRST_BLOCK);
  if (fromBlock <= toBlock) {
    // The collateral token is immutable; the protocol's share (10% on every market) is read at the latest block,
    // because the chain's public RPCs do not serve historical state for a backfill.
    const latest = new sdk.ChainApi({ chain: options.chain });
    const [collaterals, params, borrows, repays] = await Promise.all([
      latest.multiCall({ abi: ABI.collateral, calls: MARKETS }),
      latest.multiCall({ abi: ABI.getParams, calls: MARKETS }),
      options.getLogs({ targets: MARKETS, eventAbi: ABI.borrow, fromBlock, toBlock, flatten: false }),
      options.getLogs({ targets: MARKETS, eventAbi: ABI.repay, fromBlock, toBlock, flatten: false }),
    ]);
    MARKETS.forEach((_, i) => {
      const protocolBps = BigInt(params[i].protocolBps);
      const add = (fee: bigint, label: string) => {
        if (fee === 0n) return;
        const cut = fee * protocolBps / 10_000n;
        dailyFees.add(collaterals[i], fee, label);
        dailyRevenue.add(collaterals[i], cut, label);
        dailySupplySideRevenue.add(collaterals[i], fee - cut, label);
      };
      for (const log of borrows[i]) add(BigInt(log.feeOpen), OPEN);
      for (const log of repays[i]) add(BigInt(log.timeFee), TIME);
    });
  }
  return { dailyFees, dailyUserFees: dailyFees.clone(), dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-11',
  fetch,
  methodology: {
    Fees: "What borrowers pay to borrow stock: the opening fee charged at each borrow (Borrow.feeOpen) and the time fee charged at each repayment (Repay.timeFee), in the market's collateral token. The time fee taken inside a liquidation or a buy-in is not emitted by the contract and is not counted; flash-loan fees (paid in stock, all to lenders) and the bonuses paid to liquidators are not counted either.",
    UserFees: 'Same as Fees: paid by borrowers.',
    Revenue: "The protocol's share of each fee (protocolBps of the market, 10% at launch), held in the market until the treasury Safe collects it.",
    ProtocolRevenue: "The protocol's share of each fee (protocolBps of the market, 10% at launch), held in the market until the treasury Safe collects it.",
    SupplySideRevenue: 'The rest of each fee, streamed to the lenders of the market.',
  },
  breakdownMethodology: {
    Fees: {
      [OPEN]: 'Borrow.feeOpen, charged when a loan opens.',
      [TIME]: 'Repay.timeFee, the per-year rate on the loan notional for the time it was open, charged at repayment.',
    },
    UserFees: {
      [OPEN]: 'Borrow.feeOpen, charged when a loan opens.',
      [TIME]: 'Repay.timeFee, charged at repayment.',
    },
    Revenue: { [OPEN]: "The protocol's share of opening fees.", [TIME]: "The protocol's share of time fees." },
    ProtocolRevenue: { [OPEN]: "The protocol's share of opening fees.", [TIME]: "The protocol's share of time fees." },
    SupplySideRevenue: { [OPEN]: "Lenders' share of opening fees.", [TIME]: "Lenders' share of time fees." },
  },
};

export default adapter;
