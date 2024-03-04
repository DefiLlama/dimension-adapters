import ADDRESSES from "../../helpers/coreAssets.json";
import { BreakdownAdapter, ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { Chain } from "@defillama/sdk/build/general";
import { getPrices } from "../../utils/prices";

interface IGraph {
  makerAssetAddr: string;
  makerAssetAmount: string;
}

interface IData {
  fillOrders: IGraph[];
  swappeds: IGraph[];
}

type TEndpoint = {
  [s: string | Chain]: string;
};

const endpoints: TEndpoint = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/consenlabs/tokenlon-v5-exchange",
};

const fetchVolume = (chain: Chain) => {
  return async (
    __timestamp: number,
    _: ChainBlocks,
    { createBalances, fromTimestamp, toTimestamp }: FetchOptions
  ): Promise<FetchResultVolume> => {
    const dailyVolume = createBalances();
    const query = `
    {
      swappeds(first:1000, where:{timestamp_gte:${fromTimestamp}, timestamp_lte:${toTimestamp}}) {
        makerAssetAddr
        makerAssetAmount
      }
      fillOrders(first:1000, where:{timestamp_gte:${fromTimestamp}, timestamp_lte:${toTimestamp}}) {
        makerAssetAddr
        makerAssetAmount
      }
    }
    `;
    const response: IData = await request(endpoints[chain], query);
    const historicalData: IGraph[] = [...response.fillOrders, ...response.swappeds];
    historicalData.map((e: IGraph) => {
      dailyVolume.add(e.makerAssetAddr, e.makerAssetAmount);
    });
    return { dailyVolume, timestamp: toTimestamp };
  };
};

const abis = {
  FillOrder:
    "event FillOrder(string source, bytes32 indexed transactionHash, bytes32 indexed orderHash, address indexed userAddr, address takerAssetAddr, uint256 takerAssetAmount, address makerAddr, address makerAssetAddr, uint256 makerAssetAmount, address receiverAddr, uint256 settleAmount, uint16 feeFactor)",
  Swapped:
    "event Swapped(string source, bytes32 indexed transactionHash, address indexed userAddr, address takerAssetAddr, uint256 takerAssetAmount, address makerAddr, address makerAssetAddr, uint256 makerAssetAmount, address receiverAddr, uint256 settleAmount, uint256 receivedAmount, uint16 feeFactor, uint16 subsidyFactor)",
};

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyVolume = createBalances();

  const pmmLogs = await getLogs({ target: "0x8D90113A1e286a5aB3e496fbD1853F265e5913c6", eventAbi: abis.FillOrder });
  const ammLogs = await getLogs({ target: "0x4a14347083B80E5216cA31350a2D21702aC3650d", eventAbi: abis.Swapped });
  [pmmLogs, ammLogs].flat().forEach((log: any) => {
    dailyVolume.add(log.makerAssetAddr, log.makerAssetAmount);
  });
  return { timestamp, dailyVolume };
};

const adapter: BreakdownAdapter = {
  breakdown: {
    tokenlon: {
      [CHAIN.ETHEREUM]: {
        fetch: fetchVolume(CHAIN.ETHEREUM),
        start: 1608216488,
      },
    },
    "tokenlon-agg": {
      [CHAIN.ETHEREUM]: {
        fetch,
        start: 1702857600,
      },
    },
  },
};

export default adapter;
