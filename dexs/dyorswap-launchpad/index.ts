import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

const LAUNCHPAD = "0x5a96508c1092960dA0981CaC7FD00217E9CdabEC";
const START_BLOCK = 1872202;

const PAIR_ABI = "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)";
const SWAP_ABI = "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const chain = options.chain;

  const pairs: any = await options.getLogs({
    target: LAUNCHPAD,
    eventAbi: PAIR_ABI,
    fromBlock: START_BLOCK,
    cacheInCloud: true,
  });

  // filter
  const pairIds = pairs.map((p: any) => p.pair);
  const isComplete = await options.api.multiCall({ abi: 'bool:complete', calls: pairIds, permitFailure: true })
  const reserves = await options.api.multiCall({ abi: 'function getVirtualReserves() returns (uint256 token0Bal, uint256 token1Bal)', calls: pairIds, permitFailure: true })
  // const completedPairs = pairIds.filter((_, i) => isComplete[i] === true)
  // const pairsWithReserves = pairIds.filter((_, i) => reserves[i] !== undefined && (+(reserves[i] as any).token0Bal > 1e18 && +(reserves[i] as any).token1Bal > 1e18))
  // const pairsWithReserves2 = pairIds.filter((_, i) => reserves[i] !== undefined && (+(reserves[i] as any).token0Bal > 1e21 && +(reserves[i] as any).token1Bal > 1e21))
  // const pairsWithReserves3 = pairIds.filter((_, i) => reserves[i] !== undefined && (+(reserves[i] as any).token0Bal > 0 && +(reserves[i] as any).token1Bal > 0))
  // console.log(`dyorswap-launchpad: Filtered to ${completedPairs.length}/${pairIds.length} completed pairs with completedPairs`);
  // console.log(`dyorswap-launchpad: Filtered to ${pairsWithReserves.length}/${pairIds.length} completed pairs with non-trivial reserves (1e18)`);
  // console.log(`dyorswap-launchpad: Filtered to ${pairsWithReserves2.length}/${pairIds.length} completed pairs with non-trivial reserves (1e21)`);
  // console.log(`dyorswap-launchpad: Filtered to ${pairsWithReserves3.length}/${pairIds.length} completed pairs with non-trivial reserves (0)`);

  const pairMap: any = {}
  let i = 0

  for (const log of pairs) {
    const isCompletedPair = isComplete[i]
    const reservesData = reserves[i]
    i++

    if (isCompletedPair) continue;  // token has already graded to full dex, skip the pair
    if (!reservesData) continue; // could not fetch reserves, skip the pair
    const token0Bal = +(reservesData as any).token0Bal
    const token1Bal = +(reservesData as any).token1Bal
    if (token0Bal < 1e21 || token1Bal < 1e21) continue; // liquidity too high, skip the pair
    pairMap[(log as any).pair] = log
  }

  const targets = Object.keys(pairMap)
  if (targets.length > 1) {
    // console.log(`dyorswap-launchpad: Processing ${targets.length} pairs for swap events`, targets);

    const swaps = await options.getLogs({ targets, eventAbi: SWAP_ABI, flatten: false, });

    swaps.forEach((logs: any, idx: number) => {
      const pairAddress = targets[idx]
      const pairLog: any = pairMap[pairAddress]
      const token0: string = pairLog.token0;
      const token1: string = pairLog.token1;

      logs.forEach((log: any) => {
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
      })
    })

  }
  const dailyFees = dailyVolume.clone(1 / 100);// 1% fee

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.PLASMA],
  start: '2025-09-24',
  methodology: {
    Fees: "1% of WXPL-side swap volume on tokens launched via the DYORSwap launchpad (bonding-curve tokens emit Swap events themselves).",
    Revenue: "bonding curve fees goes to protocol treasury.",
    ProtocolRevenue: "bonding curve fees goes to protocol treasury.",
  },
};

export default adapter;
