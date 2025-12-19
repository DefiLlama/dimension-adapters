import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";
import { postURL } from "../../utils/fetchURL";

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

const SUI_RPC_URL = "https://fullnode.mainnet.sui.io:443";
const SUI_ADDRESS = "0x3a20341455dbb7ed10e414b4a054096c22b0e6c41da1571093e9d7fd36ee0a24";

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
  const fromTimestamp = options.fromTimestamp;
  const toTimestamp = options.toTimestamp;
  let cursor = null;
  let hasNextPage = true;
  let stopFetching = false;
  const dailyFees = options.createBalances();
  let total = 0;

  while (hasNextPage && !stopFetching) {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "suix_queryTransactionBlocks",
      params: [
        {
          filter: { ToAddress: SUI_ADDRESS },
          options: {
            showInput: true,
            showEffects: true,
            showEvents: true,
            showBalanceChanges: true,
          },
        },
        cursor,
        100,
        true,
      ],
    };

    const data = await postURL(SUI_RPC_URL, body);

    if (data.result && data.result.data) {
      for (const tx of data.result.data) {
        const ts = Number(tx.timestampMs) / 1000;
        if (ts < fromTimestamp) {
          stopFetching = true;
          break;
        }
        if (ts > toTimestamp) continue;

        if (tx.balanceChanges) {
          for (const change of tx.balanceChanges) {
            if (
              change.owner?.AddressOwner === SUI_ADDRESS &&
              change.coinType === ADDRESSES.sui.SUI &&
              Number(change.amount) > 0
            ) {
              total += Number(change.amount);
              dailyFees.add(ADDRESSES.sui.SUI, Number(change.amount));
            }
          }
        }
      }
      hasNextPage = data.result.hasNextPage;
      cursor = data.result.nextCursor;
    } else {
      hasNextPage = false;
    }
  }
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
  isExpensiveAdapter: true,
};

export default adapter;
