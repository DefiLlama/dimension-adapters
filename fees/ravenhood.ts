import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// RavenhoodRitual (the protocol's core contract) periodically calls
// RavenhoodVault.claimFees()/claimBurn(), both of which call the Uniswap V3
// NonfungiblePositionManager's collect() on the vault's single permanently-locked
// RVH/WETH position (tokenId 17757), with recipient = RavenhoodRitual. claimBurn()
// also decreases liquidity (removes 0.5% of the locked principal) in the same
// transaction as its collect() call, so Collect events need any co-occurring
// DecreaseLiquidity principal subtracted out to isolate pure swap-fee revenue -
// same technique used in fees/olympus-dao.ts for its own treasury-owned positions.
const POSITION_MANAGER = "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3";
const RAVENHOOD_RITUAL = "0xF65227639636288F3ec7D1368DBf6e6F7a99b533"; // recipient of every collect()
const POSITION_ID = "17757";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"; // token0 (lower address)
const RVH = "0x96765066f6a040a21EB027167D2315B707c82633"; // token1

const EVENTS = {
  collect: "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
  decreaseLiquidity: "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const collectLogs = await options.getLogs({ target: POSITION_MANAGER, eventAbi: EVENTS.collect, entireLog: true, parseLog: true });
  const decreaseLogs = await options.getLogs({ target: POSITION_MANAGER, eventAbi: EVENTS.decreaseLiquidity, entireLog: true, parseLog: true });

  const withdrawnMap = new Map<string, { amount0: bigint; amount1: bigint }>();
  for (const log of decreaseLogs as any[]) {
    if (String(log.args.tokenId) !== POSITION_ID) continue;
    const key = log.transactionHash.toLowerCase();
    const existing = withdrawnMap.get(key) || { amount0: 0n, amount1: 0n };
    withdrawnMap.set(key, {
      amount0: existing.amount0 + BigInt(log.args.amount0 || 0),
      amount1: existing.amount1 + BigInt(log.args.amount1 || 0),
    });
  }

  for (const log of collectLogs as any[]) {
    if (String(log.args.tokenId) !== POSITION_ID || log.args.recipient.toLowerCase() !== RAVENHOOD_RITUAL.toLowerCase()) continue;
    const key = log.transactionHash.toLowerCase();
    const withdrawn = withdrawnMap.get(key);

    let amount0 = BigInt(log.args.amount0 || 0);
    let amount1 = BigInt(log.args.amount1 || 0);
    if (withdrawn) {
      amount0 = amount0 > withdrawn.amount0 ? amount0 - withdrawn.amount0 : 0n;
      amount1 = amount1 > withdrawn.amount1 ? amount1 - withdrawn.amount1 : 0n;
    }

    if (amount0 > 0n) dailyFees.add(WETH, amount0, METRIC.SWAP_FEES);
    if (amount1 > 0n) dailyFees.add(RVH, amount1, METRIC.SWAP_FEES);
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const methodology = {
  Fees: "Swap fees collected from RavenhoodVault's single permanently-locked RVH/WETH Uniswap V3 position (tokenId 17757), read from Collect events on the position manager, with any co-occurring DecreaseLiquidity principal subtracted out.",
  Revenue: "100% of collected fees - the locked position is the protocol's own treasury (routed to buyback+burn or the owner depending on burn progress), not third-party LP yield paid to external depositors.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees collected from RavenhoodVault's single permanently-locked RVH/WETH Uniswap V3 position (tokenId 17757), read from Collect events on the position manager, with any co-occurring DecreaseLiquidity principal subtracted out.",
  },
  Revenue: {
    [METRIC.SWAP_FEES]: "100% of collected fees - the locked position is the protocol's own treasury (routed to buyback+burn or the owner depending on burn progress), not third-party LP yield paid to external depositors.",
  },
}

const adapter: Adapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-08",
  methodology,
  breakdownMethodology,
  doublecounted: true, // uniswap
};

export default adapter;
