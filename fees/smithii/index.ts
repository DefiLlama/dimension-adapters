import ADDRESSES from '../../helpers/coreAssets.json'
import axios from "axios";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { getSolanaReceived } from "../../helpers/token";

const config: Record<string, { contract: string, start: string }> = {
  [CHAIN.ETHEREUM]: {
    contract: "0xD5765b5d565227A27dD7C96B32b2600958c9cE9c",
    start: "2024-07-26",
  },
  [CHAIN.BASE]: {
    contract: "0xD5765b5d565227A27dD7C96B32b2600958c9cE9c",
    start: "2024-07-26",
  },
  [CHAIN.POLYGON]: {
    contract: "0x1272CA4D562b6eeFD7bfEfA64EFD9b93AC8d34D5",
    start: "2024-09-13",
  },
  [CHAIN.ARBITRUM]: {
    contract: "0x6120fA4b79AB3672322EE5bA8eD59d4303D0ff06",
    start: "2024-09-13",
  },
  [CHAIN.AVAX]: {
    contract: "0xD5765b5d565227A27dD7C96B32b2600958c9cE9c",
    start: "2024-09-13",
  },
  [CHAIN.BSC]: {
    contract: "0xD5765b5d565227A27dD7C96B32b2600958c9cE9c",
    start: "2024-09-13",
  },
  [CHAIN.BLAST]: {
    contract: "0x6120fA4b79AB3672322EE5bA8eD59d4303D0ff06",
    start: "2024-10-14",
  },
};

const ServicePaidEvent = "event ServicePaid (bytes32 projectId, address contractAddress, bytes32 serviceId, address user, uint256 amount, uint256 timestamp)";

const SUI_ADDRESS = "0x3a20341455dbb7ed10e414b4a054096c22b0e6c41da1571093e9d7fd36ee0a24";

// normalize a GraphQL padded type repr (0x0000..02::sui::SUI) to the short form (0x2::sui::SUI)
const shortenSuiType = (repr: string) =>
  repr.replace(/0x0*([0-9a-fA-F])/g, "0x$1").replace(/0x([0-9a-fA-F]{63})(?![0-9a-fA-F])/g, "0x0$1");

const solanaFetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    target: "5KgfWjGePnbFgDAuCqxB5oymuFxQskvCtrw6eYfDa7fj",
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const suiFetch = async (options: FetchOptions) => {
  const { fromTimestamp, toTimestamp } = options;
  const dailyFees = options.createBalances();

  let before: string | null = null;
  do {
    const res = await axios.post(getEnv("SUI_GRAPH_RPC"), {
      query: `query ($before: String) {
        transactions(last: 50, before: $before, filter: { affectedAddress: "${SUI_ADDRESS}" }) {
          pageInfo { hasPreviousPage startCursor }
          nodes { effects { timestamp balanceChanges { nodes { owner { address } amount coinType { repr } } } } }
        }
      }`,
      variables: { before },
    }, { timeout: 60_000 });

    const payload: any = res.data ?? {};
    if (payload.errors?.length || !payload.data)
      throw new Error(`Failed to fetch sui data: ${payload.errors?.[0]?.message ?? "no data returned"}`);
    const conn = payload.data.transactions;
    if (!conn) break;
    const nodes = conn.nodes; // ascending (oldest -> newest)
    before = conn.pageInfo.hasPreviousPage ? conn.pageInfo.startCursor : null;

    for (const tx of nodes) {
      const eff = tx.effects;
      if (!eff?.timestamp) continue;
      const ts = Date.parse(eff.timestamp) / 1000;
      if (ts < fromTimestamp || ts > toTimestamp) continue;
      for (const change of eff.balanceChanges.nodes) {
        if (
          change.owner?.address === SUI_ADDRESS &&
          shortenSuiType(change.coinType.repr) === ADDRESSES.sui.SUI &&
          Number(change.amount) > 0
        ) {
          dailyFees.add(ADDRESSES.sui.SUI, Number(change.amount));
        }
      }
    }
    
    const oldest = nodes[0]?.effects?.timestamp;
    if (!nodes.length || (oldest && Date.parse(oldest) / 1000 < fromTimestamp)) before = null;
  } while (before);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const evmFetch: any = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const data: Array<any> = await options.getLogs({
    target: config[options.chain].contract,
    eventAbi: ServicePaidEvent,
  });
  data.forEach((log: any) => {
    dailyFees.addGasToken(log.amount);
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All fees paid by users to use a particular Smithii tool.",
  Revenue: "All fees are collected by smithii.io protocol.",
  ProtocolRevenue: "Trading fees are collected by smithii.io protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  adapter: {
    ...Object.keys(config).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: evmFetch,
          start: config[chain].start,
        },
      };
    }, {}),
    [CHAIN.SOLANA]: {
      fetch: solanaFetch,
    },
    [CHAIN.SUI]: {
      fetch: suiFetch,
      start: "2025-03-19",
    },
  },
};

export default adapter;
