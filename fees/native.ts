import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from '../helpers/metrics'

const configs: Record<string, any> = {
  [CHAIN.ETHEREUM]: {
    creditVault: '0xe3D41d19564922C9952f692C5Dd0563030f5f2EF',
    start: '2025-04-01',
  },
  [CHAIN.BSC]: {
    creditVault: '0xBA8dB0CAf781cAc69b6acf6C848aC148264Cc05d',
    start: '2025-04-01',
  },
  [CHAIN.ARBITRUM]: {
    creditVault: '0xbA1cf8A63227b46575AF823BEB4d83D1025eff09',
    start: '2025-07-09',
  },
  [CHAIN.BASE]: {
    creditVault: '0x74a4Cd023e5AfB88369E3f22b02440F2614a1367',
    start: '2025-07-09',
  },
};

const Abis = {
  underlying: 'address:underlying',
  feeWith: 'address:underlying',
  allLPTokens: 'function allLPTokens(uint256) view returns (address)',
  YieldDistributed: 'event YieldDistributed(uint256 yieldAmount)',
}

const calls: Array<any> = [];
for (let i = 0; i < 100; i++) {
  calls.push({ params: [i] })
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const lpTokensAddresses = await options.api.multiCall({
    target: configs[options.chain].creditVault,
    abi: Abis.allLPTokens,
    calls: calls,
    permitFailure: true,
  })
  
  const lpTokens = lpTokensAddresses.filter( i => i !== null)
  const underlytingTokens = await options.api.multiCall({
    abi: Abis.underlying,
    calls: lpTokens,
  })
  
  const lpYieldsLogs = await options.getLogs({
    targets: lpTokens,
    eventAbi: Abis.YieldDistributed,
    flatten: false,
  })
  for (let i = 0; i <= lpYieldsLogs.length; i++) {
    const token = underlytingTokens[i]
    const logs = lpYieldsLogs[i]
    if (token && logs) {
      for (const log of logs) {
        dailyFees.add(token, log.yieldAmount)
      }
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0, // no revenue
  };
}

const methodology = {
  Fees: 'Fees paid by PMMs while using fund from the Credit Pool to facilitate trades.',
  Revenue: 'Share of fees to protocol.',
  SupplySideRevenue: 'All fees are distributed to Credit Pool suppliers.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'All funding fees paid by PMMs while using fund from the Credit Pool to facilitate trades.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'All fees collected are distributed to Credit Pool suppliers.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: configs,
  methodology,
  breakdownMethodology,
};

export default adapter;
