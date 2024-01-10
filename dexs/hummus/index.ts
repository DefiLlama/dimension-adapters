import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import * as sdk from "@defillama/sdk";
import * as ethers from "ethers";

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

const abi_event = {
  swap: "event Swap(address indexed sender, address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address indexed to)",
};

const abi_event_interface = new ethers.Interface(
  Object.values(abi_event)
);

const swap_topic =
  "0x54787c404bb33c88e86f4baf88183a3b0141d0a848e6a9f7a13b66ae3a9b73d1";

const tokens = [
  "0xEA32A96608495e54156Ae48931A7c20f0dcc1a21",
  "0xbB06DCA3AE6887fAbF931640f67cab3e3a16F4dC",
  "0x4c078361FC9BbB78DF910800A991C7c3DD2F6ce0",
];
const decimals = [6, 6, 18];

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dayID = dayTimestamp / 86400;

  const fromBlock = await getBlock((dayID - 1) * 86400, CHAIN.METIS, {});
  const toBlock = await getBlock(dayID * 86400, CHAIN.METIS, {});

  const logs: ILog[] = (
    await Promise.resolve(
      sdk.getEventLogs({
        target: "0x248fD66e6ED1E0B325d7b80F5A7e7d8AA2b2528b",
        toBlock: toBlock,
        fromBlock: fromBlock,
        chain: CHAIN.METIS,
        topics: [swap_topic],
      })
    )
  ) as ILog[];

  let dailyVolume = 0;

  logs.forEach((log) => {
    const args = abi_event_interface.parseLog(log)!.args;
    let vol = 0;
    let tokenIndex = -1;

    if (args.fromAmount < args.toAmount) {
      tokenIndex = tokens.findIndex((address) => address === args.fromToken);
      vol = args.fromAmount / 10 ** decimals[tokenIndex];
    } else {
      tokenIndex = tokens.findIndex((address) => address === args.toToken);
      vol = args.toAmount / 10 ** decimals[tokenIndex];
    }
    if (!isNaN(vol)) {
      dailyVolume += vol;
    }
  });


  return {
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.METIS]: {
      fetch: fetch,
      start: async () => 1661900400,
    },
  },
};

export default adapter;
