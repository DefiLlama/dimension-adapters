import type { ChainApi } from "@defillama/sdk";
import type {
  Adapter,
  FetchOptions,
  FetchResultV2,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type ChainConfig = {
  core: string;
};

const mangrove: Record<string, ChainConfig> = {
  [CHAIN.BLAST]: {
    core: "0xb1a49C54192Ea59B233200eA38aB56650Dfb448C",
  },
};

const abi = {
  OfferSuccess:
    "event OfferSuccess(bytes32 indexed olKeyHash, address indexed taker, uint indexed id, uint takerWants, uint takerGives)",
  OfferSuccessWithPosthookData:
    "event OfferSuccessWithPosthookData(bytes32 indexed olKeyHash,address indexed taker,uint indexed id,uint takerWants,uint takerGives,bytes32 posthookData)",
  olKeys:
    "function olKeys(bytes32 olKeyHash) external view returns (address outbound_tkn,address inbound_tkn,uint tickSpacing)",
};

async function getToken(
  map: Map<string, string>,
  olKeyHash: string,
  api: ChainApi,
  chain: string,
): Promise<string> {
  let token = map.get(olKeyHash.toLowerCase());
  if (token) {
    return token;
  }
  const apiToken = await api.call({
    abi: abi.olKeys,
    params: [olKeyHash],
    target: mangrove[chain].core,
  });
  token = apiToken[0] as string;
  map.set(olKeyHash.toLowerCase(), token);
  return token;
}

async function fetch({
  getLogs,
  api,
  chain,
  createBalances,
}: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = createBalances();
  const olKeys = new Map<string, string>();
  const logs = await Promise.all([
    getLogs({
      eventAbi: abi.OfferSuccessWithPosthookData,
      target: mangrove[chain].core,
    }),
    getLogs({
      eventAbi: abi.OfferSuccess,
      target: mangrove[chain].core,
    }),
  ]).then((r) => r.flat());
  for (const log of logs) {
    const olKeyHash = log.olKeyHash;
    const token = await getToken(olKeys, olKeyHash, api, chain);
    dailyVolume.add(token, log.takerWants);
  }
  return {
    dailyVolume,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BLAST]: {
      meta: {
        methodology: {
          dailyVolume: "Sum of all offers taken in the last 24hrs",
        },
      },
      fetch,
      start: 1708992000,
    },
  },
};

export default adapter;
