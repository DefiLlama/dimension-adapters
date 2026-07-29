import { CHAIN } from "../../helpers/chains";
import type { Adapter, FetchOptions } from "../../adapters/types";
import { getAmmSwapVolume } from "../../dexs/smardex";

const FEES = {
  [CHAIN.ETHEREUM]: { LP_FEES: 0.0005, POOL_FEES: 0.0002 },
  [CHAIN.BSC]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
  [CHAIN.POLYGON]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
  [CHAIN.ARBITRUM]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
  [CHAIN.BASE]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
} as { [chain: string]: { LP_FEES: number; POOL_FEES: number } };

const CHAIN_STARTS = {
  [CHAIN.ETHEREUM]: "2023-03-09",
  [CHAIN.BSC]: "2023-07-10",
  [CHAIN.POLYGON]: "2023-04-21",
  [CHAIN.ARBITRUM]: "2023-07-10",
  [CHAIN.BASE]: "2023-08-08",
} as { [chain: string]: string };

const FEES_METHODOLOGY = `
A minor fee is collected on each swap, functioning as trading fees.
The fees are set at 0.07% on Ethereum and 0.1% on other chains.
On other networks, fees may vary between different pairs and chains.
Refer to https://docs.smardex.io/overview/what-is-smardex/fees for detailed information.
`;

const methodology = {
  UserFees: FEES_METHODOLOGY,
  Fees: FEES_METHODOLOGY,
  Revenue: `0.02% of each swap on Ethereum is collected for staking pool (SDEX holders that staked). On other chains, 0.03% of each swap is collected for buybacks and burns. Refer to https://docs.smardex.io/overview/what-is-smardex/fees for detailed information.`,
  ProtocolRevenue: `Protocol has no revenue.`,
  SupplySideRevenue: `0.05% of each swap on Ethereum is collected for liquidity providers. On other chains, 0.07% of each swap is collected for liquidity providers. Refer to https://docs.smardex.io/overview/what-is-smardex/fees for detailed information.`,
  HoldersRevenue: `0.02% of each swap on Ethereum is collected for staking pool (SDEX holders that staked). On other chains staking is not available and fees are collected for buybacks SDEX and burns.`,
};

async function fetch(options: FetchOptions) {
  const { LP_FEES, POOL_FEES } = FEES[options.chain];
  const dailyVolume = await getAmmSwapVolume(options);
  const dailyFees = dailyVolume.clone(LP_FEES + POOL_FEES);
  const dailySupplySideRevenue = dailyVolume.clone(LP_FEES);
  const dailyRevenue = dailyVolume.clone(POOL_FEES);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyRevenue,
  };
}

const adapter: Adapter = { version: 2, adapter: {}, methodology };
for (let chain in FEES) {
  adapter.adapter![chain] = {
    fetch,
    start: CHAIN_STARTS[chain],
  };
}

export default adapter;
