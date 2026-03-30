import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";
import { SimpleAdapter } from "../adapters/types";
import { createFactoryExports } from "./registry";

interface SubgraphConfig {
  graphUrls: Record<string, string>;
  totalVolume?: {
    factory?: string;
    field?: string;
  };
  totalFees?: {
    factory: string;
    field: string;
  };
  feesPercent?: {
    type: "fees" | "volume";
    Fees?: number;
    UserFees?: number;
    ProtocolRevenue?: number;
    HoldersRevenue?: number;
    SupplySideRevenue?: number;
    Revenue?: number;
  };
  start?: string;
  methodology?: Record<string, string>;
}

function computeMethodology(fp: SubgraphConfig['feesPercent']): Record<string, string> | undefined {
  if (!fp) return undefined;
  const m: Record<string, string> = {};
  const isVol = fp.type === 'volume';
  const pct = (v: number) => Number.isInteger(v) ? `${v}%` : `${+v.toFixed(4)}%`;
  const of = isVol ? 'of trade volume' : 'of collected fees';

  if (fp.Fees != null) m.Fees = isVol ? `${pct(fp.Fees)} fee charged on each swap.` : 'Swap fees paid by users on each trade.';
  if (fp.UserFees != null) m.UserFees = isVol ? `Users pay a ${pct(fp.UserFees)} fee on each swap.` : 'Users pay swap fees on each trade.';
  if (fp.Revenue != null) m.Revenue = fp.Revenue === 0 ? 'Protocol has no revenue.' : `${pct(fp.Revenue)} ${of} is protocol revenue.`;
  if (fp.ProtocolRevenue != null) m.ProtocolRevenue = fp.ProtocolRevenue === 0 ? 'Protocol has no revenue.' : `${pct(fp.ProtocolRevenue)} ${of} goes to the protocol.`;
  if (fp.SupplySideRevenue != null) m.SupplySideRevenue = fp.SupplySideRevenue === 0 ? 'No fees distributed to LPs.' : `${pct(fp.SupplySideRevenue)} ${of} is distributed to LPs.`;
  if (fp.HoldersRevenue != null) m.HoldersRevenue = fp.HoldersRevenue === 0 ? 'Holders have no revenue.' : `${pct(fp.HoldersRevenue)} ${of} goes to token holders.`;

  return Object.keys(m).length ? m : undefined;
}

const configs: Record<string, SubgraphConfig> = {
  "harmony-swap": {
    graphUrls: {
      [CHAIN.HARMONY]: "https://graph.swap.country/subgraphs/name/harmony-uniswap-v3",
    },
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
  },
  "upheaval-v2": {
    graphUrls: {
      [CHAIN.HYPERLIQUID]: "https://api.upheaval.fi/subgraphs/name/upheaval/exchange-v2",
    },
    totalVolume: { factory: "pancakeFactories" },
    feesPercent: {
      type: "volume",
      Fees: 0.3,
      UserFees: 0.3,
      ProtocolRevenue: 0.16 * 0.3,
      HoldersRevenue: 0,
      SupplySideRevenue: 0.84 * 0.3,
      Revenue: 0.16 * 0.3,
    },
    start: "2025-07-26",
  },
  // "sailfish": {
  //   graphUrls: {
  //     occ: "https://api.goldsky.com/api/public/project_cm1s79wa2tlb701tbchmeaflf/subgraphs/sailfish-v3-occ-mainnet/1.0.3/gn",
  //   },
  //   totalVolume: { factory: "factories", field: "totalVolumeUSD" },
  //   feesPercent: {
  //     type: "fees",
  //     ProtocolRevenue: 50,
  //     HoldersRevenue: 0,
  //     UserFees: 100,
  //     SupplySideRevenue: 50,
  //     Revenue: 50,
  //   },
  // },
  "upheaval-v3": {
    graphUrls: {
      [CHAIN.HYPERLIQUID]: "https://api.upheaval.fi/subgraphs/name/upheaval/exchange-v3-fixed",
    },
    totalVolume: { factory: "factories" },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 16,
      HoldersRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 84,
      Revenue: 16,
    },
    start: "2025-08-06",
  },
  "metavault-v3": {
    graphUrls: {
      [CHAIN.SCROLL]: "https://api.studio.thegraph.com/query/55804/metavault-v3/version/latest",
    },
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 0,
      HoldersRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 100,
      Revenue: 0,
    },
    start: "2023-11-04",
  },
  "glyph-exchange-v4": {
    graphUrls: {
      [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/glyph/algebra",
    },
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    totalFees: { factory: "factories", field: "totalFeesUSD" },
    feesPercent: {
      type: "fees",
      Fees: 100,
      UserFees: 100,
      Revenue: 15,
      ProtocolRevenue: 15,
      SupplySideRevenue: 85,
    },
    start: "2024-03-19",
  },
  "retro": {
    graphUrls: {
      [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('DZyDuvUHNThtJJQAEbYGr32xYc93BZAdfqatpYUNMZbe'),
    },
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 10,
      HoldersRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 90,
      Revenue: 10,
    },
    start: "2023-07-02",
  },
  "fusionx-v3": {
    graphUrls: {
      [CHAIN.MANTLE]: "https://graphv3.fusionx.finance/subgraphs/name/fusionx/exchange-v3",
    },
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 16.7,
      HoldersRevenue: 16.7,
      Fees: 100,
      UserFees: 100,
      SupplySideRevenue: 66.6,
      Revenue: 33.4,
    },
    start: "2023-07-13",
  },
  "winnieswap": {
    graphUrls: {
      [CHAIN.BERACHAIN]: "https://api.goldsky.com/api/public/project_cmesjqx64lbfh01wc6z2q9tb0/subgraphs/winnieswap/0.0.1/gn",
    },
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 0,
      HoldersRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 100,
      Revenue: 0,
    },
    start: "2025-07-07",
  },
  "physica-finance": {
    graphUrls: {
      [CHAIN.PLANQ]: "https://subgraph.planq.finance/subgraphs/name/ianlapham/uniswap-v3",
    },
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 14.2857,
      HoldersRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 85.7143,
      Revenue: 100,
    },
    start: "2024-05-22",
  },
  "fpex": {
    graphUrls: {
      [CHAIN.FLARE]: "https://api.goldsky.com/api/public/project_cmbnjfb9bfd3001tj08r4hq5c/subgraphs/flareswap/1.0.0/gn",
    },
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    feesPercent: {
      type: "fees",
      UserFees: 100,
      SupplySideRevenue: 100,
      Revenue: 0,
      ProtocolRevenue: 0,
      HoldersRevenue: 0,
    },
    start: "2025-07-01",
  },
  "hydradex-v3": {
    graphUrls: {
      [CHAIN.HYDRAGON]: "https://subgraph.hydrachain.org/subgraphs/name/v3-subgraph",
    },
    totalVolume: { factory: "factories" },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 0,
      HoldersRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 100,
      Revenue: 0,
    },
    start: "2025-05-20",
  },
  "sparkdex-v3-1": {
    graphUrls: {
      [CHAIN.FLARE]: "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-v3-2/latest/gn",
    },
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 0,
      HoldersRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 100,
      Revenue: 0,
    },
    start: "2024-07-02",
  },
  // "kodiak-v3": {
  //   graphUrls: {
  //     [CHAIN.BERACHAIN]: "https://api.goldsky.com/api/public/project_clpx84oel0al201r78jsl0r3i/subgraphs/kodiak-v3-berachain-mainnet/latest/gn",
  //   },
  //   totalVolume: { factory: "factories", field: "totalVolumeUSD" },
  //   feesPercent: {
  //     type: "fees",
  //     ProtocolRevenue: 35,
  //     HoldersRevenue: 0,
  //     UserFees: 100,
  //     SupplySideRevenue: 65,
  //     Revenue: 35,
  //   },
  // },
  "shido-dex": {
    graphUrls: {
      [CHAIN.SHIDO]: "https://prod-v2-graph-node.shidoscan.com/subgraphs/name/shido/mainnet",
    },
    start: "2024-09-18",
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 0,
      HoldersRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 100,
      Revenue: 0,
    },
  },
  "morFi": {
    graphUrls: {
      [CHAIN.MORPH]: "https://subgraph.morfi.io/subgraphs/name/morfi/core",
    },
    start: '2024-10-29',
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 0,
      HoldersRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 100,
      Revenue: 0,
    },
  },
  "sparkdex-v4": {
    graphUrls: {
      [CHAIN.FLARE]: "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-v4/latest/gn",
    },
    start: '2024-10-29',
    totalVolume: { factory: "factories", field: "totalVolumeUSD" },
    feesPercent: {
      type: "fees",
      UserFees: 100, // 100% of fees are paid by users
      Fees: 100,
      SupplySideRevenue: 75, // 75% to LPs
      ProtocolRevenue: 5, // 5% to protocol
      HoldersRevenue: 20, // 20% to holders (10% buyback + 10% staking rewards)
      Revenue: 25, // 25% to protocol (5% ProtocolRevenue + 20% HoldersRevenue)
    },
  },
  mimo: {
    graphUrls: {
      [CHAIN.IOTEX]: "https://graph.mimo.exchange/subgraphs/name/mimo/mainnet"
    },
    totalVolume: { factory: "uniswapFactories", field: "totalVolumeUSD", },
    feesPercent: {
      type: "volume",
      UserFees: 0.3,
      Fees: 0.3,
      ProtocolRevenue: 0,
      Revenue: 0,
      SupplySideRevenue: 0.3,
      HoldersRevenue: 0,
    }
  },
  mojitoswap: {
    graphUrls: {
      [CHAIN.KCC]: "https://thegraph.kcc.network/subgraphs/name/mojito/swap",
    },
    feesPercent: {
      type: "volume",
      UserFees: 0.3,
      Fees: 0.3,
      SupplySideRevenue: 0.18,
      HoldersRevenue: 0.08,
      ProtocolRevenue: 0.04,
      Revenue: 0.12,
    }
  },
  pangolin: {
    graphUrls: {
      [CHAIN.AVAX]: sdk.graph.modifyEndpoint('CPXTDcwh6tVP88QvFWW7pdvZJsCN4hSnfMmYeF1sxCLq')
    },
    totalVolume: {
      factory: "pangolinFactories"
    },
    feesPercent: {
      type: "volume",
      UserFees: 0.3,
      Fees: 0.3,
      SupplySideRevenue: 0.25,
      HoldersRevenue: 0.0425,
      ProtocolRevenue: 0.0075,
      Revenue: 0.05
    }
  },
  'vvs-finance': {
    graphUrls: {
      [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/vvs/exchange"
    },
    totalVolume: {
      factory: "vvsFactories"
    },
    feesPercent: {
      type: "volume",
      Fees: 0.3,
      UserFees: 0.3,
      Revenue: 0.1,
      ProtocolRevenue: 0.02,
      HoldersRevenue: 0.08,
      SupplySideRevenue: 0.2,
    }
  },
  taraswap: {
    graphUrls: {
      [CHAIN.TARA]: "https://indexer.lswap.app/subgraphs/name/taraxa/uniswap-v3"
    },
    totalVolume: {
      factory: "factories",
    },
    start: "2023-11-25",
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 0,
      HoldersRevenue: 0,
      Fees: 0,
      UserFees: 100, // User fees are 100% of collected fees
      SupplySideRevenue: 100, // 100% of fees are going to LPs
      Revenue: 0, // Revenue is 100% of collected fees
    },
  },
  'swapmode-v3': {
    graphUrls: {
      [CHAIN.MODE]: "https://api.goldsky.com/api/public/project_cltceeuudv1ij01x7ekxhfl46/subgraphs/swapmode-v3/prod/gn",
    },
    totalVolume: { factory: "factories", field: 'totalVolumeUSD', },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 64,
      UserFees: 100,
      SupplySideRevenue: 36,
      Revenue: 0,
    },
    start: '2024-03-11',
  },
  'treble-spot': {
    graphUrls: {
      [CHAIN.BASE]: "8rV9EcKW8J8u6rt7t9vdCf2gCieiaEM1TiKWYxVTxa4i",
    },
    totalVolume: { factory: "factories", field: 'totalVolumeUSD', },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 100,
      Revenue: 0,
    },
    start: '2025-01-20',
  },
  'treble-v4': {
    graphUrls: {
      [CHAIN.BASE]: "3sThy2UsWd9X3D2M6MUQWzNUYrs8snMMhQKHSg9kUEAd",
    },
    totalVolume: { factory: "factories", field: 'totalVolumeUSD', },
    feesPercent: {
      type: "fees",
      ProtocolRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 100,
      Revenue: 0,
    },
    start: '2026-01-20',
  },
};

// Build protocols from configs
const protocols: Record<string, SimpleAdapter> = {};
for (const [name, config] of Object.entries(configs)) {
  const fetch = getGraphDimensions2({
    graphUrls: config.graphUrls,
    totalVolume: config.totalVolume,
    totalFees: config.totalFees,
    feesPercent: config.feesPercent,
  });

  const chains = Object.keys(config.graphUrls);
  const { start } = config;
  const methodology = config.methodology ?? computeMethodology(config.feesPercent);

  const adapter: SimpleAdapter = {
    version: 2,
    // pullHourly: true,
    adapter: chains.reduce((acc, chain) => ({
      ...acc,
      [chain]: {
        fetch,
        ...(start && { start }),
      },
    }), {}),
  };

  if (start) (adapter as any).start = start;
  if (methodology) adapter.methodology = methodology;

  protocols[name] = adapter;
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);
