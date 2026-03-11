import { BaseAdapter, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";
import { config } from "../../dexs/wombat-exchange";

// Voter contract addresses for chains with governance (for bribes + token incentives)
const voterConfig: Record<string, { voter: string; wom: string }> = {
  [CHAIN.BSC]: {
    voter: "0x04D4e1C1F3D6539071b6D3849fDaED04d48D563d",
    wom: "0xAD6742A35fB341A9Cc6ad674738Dd8da98b94Fb1",
  },
  [CHAIN.ARBITRUM]: {
    voter: "0x3f90a5a47364c0467031fB00246192d40E3D2D9D",
    wom: "0x7b5eb3940021ec0e8e463d5dbb4b7b09a89ddf96",
  },
  [CHAIN.ETHEREUM]: {
    voter: "0x32A936CbA2629619b46684cDf923CB556f09442c",
    wom: "0xc0B314a8c08637685Fc3daFC477b92028c540CFB",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {},
  methodology: {
    Fees: "Swap fees paid by users (haircutRate applied to each swap).",
    UserFees: "Same as Fees — all swap fees are paid by the user.",
    SupplySideRevenue: "Share of fees distributed to LPs, determined by the pool's lpDividendRatio.",
    ProtocolRevenue: "Share of fees retained by the protocol (tip bucket + feeTo), i.e. 1 - lpDividendRatio.",
    HoldersRevenue: "Not applicable.",
    Revenue: "Same as ProtocolRevenue.",
  },
};

Object.keys(config).forEach((chain) => {
  if (chain === "hallmarks") return;
  (adapter.adapter as BaseAdapter)[chain] = { fetch };
});

export default adapter;

async function fetch(options: FetchOptions) {
  const { chain, getLogs, createBalances, api } = options;
  const pools = Object.values(config[chain].pools) as string[];

  const swapAbi = "event Swap (address indexed sender, address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address indexed to)";

  // 1. Read haircutRate and lpDividendRatio from each pool
  const [haircutRates, lpDividendRatios] = await Promise.all([
    api.multiCall({ abi: "function haircutRate() view returns (uint256)", calls: pools }).catch(() => pools.map(() => "400000000000000")), // default 4bps
    api.multiCall({ abi: "function lpDividendRatio() view returns (uint256)", calls: pools }).catch(() => pools.map(() => "1000000000000000000")), // default 100%
  ]);

  // 2. Compute per-pool volume, fees, and revenue split
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const perPoolLogs = await Promise.all(
    pools.map((pool) => getLogs({ target: pool, eventAbi: swapAbi }).catch(() => []))
  );

  for (let i = 0; i < pools.length; i++) {
    const poolLogs = perPoolLogs[i];
    const hr = Number(haircutRates[i]) / 1e18;
    const lpRatio = Number(lpDividendRatios[i]) / 1e18;

    const poolVolume = createBalances();
    poolLogs.forEach((log: any) => {
      addOneToken({ chain, balances: poolVolume, token0: log.fromToken, amount0: log.fromAmount, token1: log.toToken, amount1: log.toAmount });
    });

    dailyVolume.addBalances(poolVolume);
    const poolFees = poolVolume.clone(hr);
    dailyFees.addBalances(poolFees);
    dailySupplySideRevenue.addBalances(poolFees.clone(lpRatio));
    dailyProtocolRevenue.addBalances(poolFees.clone(1 - lpRatio));
  }

  // 4. Token incentives: WOM emissions distributed via Voter
  let tokenIncentives;
  if (voterConfig[chain]) {
    const { voter, wom } = voterConfig[chain];
    tokenIncentives = createBalances();
    const distributeLogs = await getLogs({
      target: voter,
      eventAbi: "event DistributeReward(address indexed lpToken, uint256 amount)",
    }).catch(() => []);
    distributeLogs.forEach((log: any) => {
      tokenIncentives.add(wom, log.amount);
    });
  }

  // 5. Bribes: OnReward events from BribeV2 contracts (via Voter)
  let dailyBribesRevenue;
  if (voterConfig[chain]) {
    const { voter } = voterConfig[chain];
    dailyBribesRevenue = createBalances();

    // Get all asset (LP token) addresses from pools, then look up bribes from Voter
    const allUnderlyingTokens = await api.multiCall({
      abi: "address[]:getTokens",
      calls: pools,
    }).catch(() => []);

    const assetCalls: { target: string; params: string }[] = [];
    allUnderlyingTokens.forEach((tokens: string[], poolIdx: number) => {
      (tokens || []).forEach((token: string) => {
        assetCalls.push({ target: pools[poolIdx], params: token });
      });
    });

    if (assetCalls.length > 0) {
      const assetAddresses = await api.multiCall({
        abi: "function addressOfAsset(address) view returns (address)",
        calls: assetCalls,
      }).catch(() => []);

      // Look up bribe address for each asset from Voter
      const infoCalls = assetAddresses
        .filter((a: string) => a && a !== "0x0000000000000000000000000000000000000000");

      if (infoCalls.length > 0) {
        const infos = await api.multiCall({
          abi: "function infos(address) view returns (uint104 supplyBaseIndex, uint104 supplyVoteIndex, uint40 nextEpochStartTime, uint128 claimable, bool whitelist, address gaugeManager, address bribe)",
          calls: infoCalls.map((a: string) => ({ target: voter, params: a })),
        }).catch(() => []);

        const bribeAddresses = infos
          .map((info: any) => info?.bribe)
          .filter((b: string) => b && b !== "0x0000000000000000000000000000000000000000");

        if (bribeAddresses.length > 0) {
          // Get OnReward events from all bribe contracts
          const bribeLogs = await getLogs({
            targets: bribeAddresses,
            eventAbi: "event OnReward(address indexed rewardToken, address indexed user, uint256 amount)",
          }).catch(() => []);

          bribeLogs.forEach((log: any) => {
            dailyBribesRevenue.add(log.rewardToken, log.amount);
          });
        }
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyRevenue: dailyProtocolRevenue,
    ...(tokenIncentives ? { tokenIncentives } : {}),
    ...(dailyBribesRevenue ? { dailyBribesRevenue } : {}),
  };
}
