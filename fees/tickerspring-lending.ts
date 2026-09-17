import { ChainApi } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';

// Both /v2 and /v3 expose this SAME market; count it only once.
// Maintained deployment source: https://api.tickerspring.com/v3/lending/markets
const MARKET = '0x011Dd3272f8FA75F05F1Ab30A4DD77364816a59e';
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const DEPLOYMENT_BLOCK = 62494078;
const INTEREST = 'Borrow Interest';
const RESERVES = 'Borrow Interest To Protocol Reserves';
const LENDERS = 'Borrow Interest To Lenders';

async function pending(api: ChainApi, block: number) {
  if (block < DEPLOYMENT_BLOCK) return { interest: 0n, reserve: 0n };
  // totals() suppresses pending interest once the collateral vault/market enters recovery.
  // Reading InterestIndex.pending() directly would keep accruing uncollectible frozen debt.
  const totals = await api.call({ target: MARKET, abi: 'function totals() view returns (uint256 debt, uint256 reserve, uint256 interest)' });
  const bookedReserve = await api.call({ target: MARKET, abi: 'uint256:reserves' });
  return { interest: BigInt(totals.interest), reserve: BigInt(totals.reserve) - BigInt(bookedReserve) };
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  // The runner's block lookup can return null on RPC failure despite its number type.
  if (!Number.isSafeInteger(fromBlock) || fromBlock <= 0 || !Number.isSafeInteger(toBlock) || toBlock <= fromBlock)
    throw new Error('TickerSpring: invalid block window');
  const before = await pending(options.fromApi, fromBlock);
  const after = await pending(options.toApi, toBlock);
  const logs = toBlock < DEPLOYMENT_BLOCK ? [] : await options.getLogs({
    target: MARKET, fromBlock: Math.max(fromBlock + 1, DEPLOYMENT_BLOCK), toBlock,
    eventAbi: 'event Accrued(uint256 interest, uint256 reserveAdded)',
  });
  // Checkpoints include interest earned before this window; pending deltas remove that carry-in
  // and include interest earned during idle windows with no transaction. Never count principal.
  let interest = after.interest - before.interest;
  let reserve = after.reserve - before.reserve;
  for (const log of logs) {
    interest += BigInt(log.interest);
    reserve += BigInt(log.reserveAdded);
  }
  dailyFees.add(USDG, interest, INTEREST);
  dailyRevenue.add(USDG, reserve, RESERVES);
  dailySupplySideRevenue.add(USDG, interest - reserve, LENDERS);
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-14', // Market deployment at block 62494078 (see public pin).
  // Recovery can forfeit previously accrued but unbooked interest; preserve that reversal.
  allowNegativeValue: true,
  fetch,
  methodology: {
    Fees: 'USDG interest accrued by borrowers, including uncheckpointed interest; excludes loan principal and collateral liquidation incentives.',
    Revenue: 'The actual reserve share of accrued borrow interest, read from market accounting rather than an assumed interest rate.',
    ProtocolRevenue: 'Accrued interest allocated to protocol reserves, which remain exposed to the market loss waterfall before withdrawal.',
    SupplySideRevenue: 'Accrued borrow interest remaining for USDG suppliers after the protocol reserve share.',
  },
  breakdownMethodology: {
    Fees: { [INTEREST]: 'Interest checkpointed during the window plus closing uncheckpointed interest minus opening uncheckpointed interest.' },
    Revenue: { [RESERVES]: 'Reserve additions checkpointed during the window plus the change in pending reserve additions.' },
    ProtocolRevenue: { [RESERVES]: 'The protocol reserve share of borrow interest, before any later credit losses.' },
    SupplySideRevenue: { [LENDERS]: 'Accrued borrow interest minus its protocol reserve allocation.' },
  },
};
export default adapter;
