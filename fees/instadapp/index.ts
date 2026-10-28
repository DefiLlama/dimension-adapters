import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {
  FetchV2,
  SimpleAdapter,
} from "../../adapters/types";
import { Balances } from "@defillama/sdk";
import { METRIC } from "../../helpers/metrics";

// The aggregator charges max(sourceFee, InstaFeeBPS) and keeps only the part above
// the source's own flashloan fee (the source premium is repaid to that protocol and
// counted by its adapter, so counting it here would double count).
// Source premiums are either >= InstaFeeBPS (Aave v2 9bps, Aave v3 5bps -> keep 0)
// or 0 (Maker, Balancer, Spark, etc. -> keep the full InstaFeeBPS). Spark looks like
// Aave but sets its premium to 0, so classify routes by on-chain premium, not name.
// `feeRoutes` = routes with a 0 source premium, verified on-chain.
const config: {
  [chain: Chain]: { address: string; deployedAt: number; feeRoutes: number[] };
} = {
  [CHAIN.ETHEREUM]: {
    address: "0x619Ad2D02dBeE6ebA3CDbDA3F98430410e892882",
    deployedAt: 1638144000,
    // 2-4 Maker, 5-7 Balancer, 10 Spark, 11 zero-fee (raw source 0) | 1 Aave v2 (9), 9 Aave v3 (5) -> keep 0
    feeRoutes: [2, 3, 4, 5, 6, 7, 10, 11],
  },
  [CHAIN.POLYGON]: {
    address: "0xB2A7F20D10A006B0bEA86Ce42F2524Fde5D6a0F4",
    deployedAt: 1638230400,
    // 5,7 Balancer | 1 Aave v2, 9 Aave v3 -> keep 0
    feeRoutes: [5, 7],
  },
  [CHAIN.AVAX]: {
    address: "0x2b65731A085B55DBe6c7DcC8D717Ac36c00F6d19",
    deployedAt: 1638230400,
    // only Aave v2 (1) / Aave v3 (9) routes -> InstaDapp keeps nothing
    feeRoutes: [],
  },
  [CHAIN.ARBITRUM]: {
    address: "0x1f882522DF99820dF8e586b6df8bAae2b91a782d",
    deployedAt: 1638230400,
    // 5 Balancer | 9 Aave v3 -> keep 0
    feeRoutes: [5],
  },
  // [CHAIN.FANTOM]: 'NA',
  [CHAIN.OPTIMISM]: {
    address: "0x84e6b05a089d5677a702cf61dc14335b4be5b282",
    deployedAt: 1646784000,
    // only Aave v3 (9) route -> InstaDapp keeps nothing
    feeRoutes: [],
  },
};

const eventAbi: any = "event LogFlashloan(address indexed account, uint256 indexed route, address[] tokens, uint256[] amounts)";

// InstaFeeBPS is 0.05% on every chain. Hardcoded because reading it at historical
// blocks needs archive state public RPCs don't keep for these old contracts.
const INSTA_FEE_BPS = 5;

const fetch: FetchV2 = async ({ createBalances, getLogs, chain }) => {
  const { address, feeRoutes } = config[chain];
  const dailyFees: Balances = createBalances();

  // Chains with no zero-fee routes earn nothing for the protocol.
  if (feeRoutes.length > 0) {
    const logs: any[] = await getLogs({ target: address, eventAbi });

    const feeRouteSet = new Set(feeRoutes);
    for (const log of logs) {
      if (feeRouteSet.has(Number(log.route))) {
        dailyFees.add(log.tokens, log.amounts, METRIC.FLASHLOAN_FEES);
      }
    }

    dailyFees.resizeBy(INSTA_FEE_BPS / 10000);
  }

  // The kept fee is swept entirely to the treasury, so revenue = fees.
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const breakdownMethodology = {
  Fees: {
    [METRIC.FLASHLOAN_FEES]: 'The 0.05% the aggregator keeps on flashloans it routes through free sources like Maker, Balancer and Spark. Aave-routed flashloans are skipped since Aave already charges more than that, leaving nothing for the protocol.',
  },
  Revenue: {
    [METRIC.FLASHLOAN_FEES]: 'The protocol keeps all of the fee it charges.',
  },
  ProtocolRevenue: {
    [METRIC.FLASHLOAN_FEES]: 'The whole fee goes to the treasury.',
  },
};

const adapter: SimpleAdapter = { adapter: {}, version: 2, pullHourly: true, };

Object.keys(config).forEach((chain: Chain) => {
  adapter.adapter![chain] = {
    fetch,
    start: config[chain].deployedAt,
  };
});

adapter.methodology = {
  Fees: "InstaDapp aggregates flashloans from several lenders and adds a 0.05% fee. We only count it on flashloans routed through free sources (Maker, Balancer, Spark, etc.), since Aave-routed ones already cost more than that and leave the protocol nothing.",
  Revenue: "The protocol keeps all of the fee it charges.",
  ProtocolRevenue: "The whole fee goes to the treasury.",
};
adapter.breakdownMethodology = breakdownMethodology;
export default adapter;
