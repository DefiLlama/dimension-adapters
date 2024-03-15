import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";
import { getBlock } from "../../helpers/getBlock";
import { Chain } from "@defillama/sdk/build/general";

const topic0_limit_ex =
  "0x165b0f8d6347f7ebe92729625b03ace41aeea8fd7ebf640f89f2593ab0db63d1";
const topic0_market_ex =
  "0x2739a12dffae5d66bd9e126a286078ed771840f2288f0afa5709ce38c3330997";

const USDC_DECIMAL = 6;
const LEVERAGE_DECIMAL = 18;

type IAddress = {
  [s: string | Chain]: string[];
};

interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}

// GambitTradingCallbacksV1 address
const CONTRACT_ADDRESS: IAddress = {
  [CHAIN.ERA]: [
    "0xE95a6FCC476Dc306749c2Ac62fB4637c27ac578d",
    "0x6cf71FaeA3771D56e72c72501e7172e79116E2A3",
    "0x50853A14cD14CC6A891BF034A204A15d294AF056",
    "0x240d75373f9941b8F7FbA660b9ae73dfa655f7Da", // v1.3.4
    "0x43c1cc807Dc22bCF7C789eDE4d1B4828C87A06D1", // v1.5.1
  ],
  [CHAIN.ARBITRUM]: [
    "0x8d85f4615ea5F2Ea8D91C196aaD4C04D8416865C",
    "0xB88C3A703B3565cb7bfdB1806Ba3728C54dd4b91", // v1.3.1
    "0x77233F7F6f11300Fd30B338dA38D96a7bFD5aB86", // v1.5.1
  ],
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const fromTimestamp = timestamp - 60 * 60 * 24;
    const toTimestamp = timestamp;

    const fromBlock = await getBlock(fromTimestamp, chain, {});
    const toBlock = await getBlock(toTimestamp, chain, {});
    const contractAddressList = CONTRACT_ADDRESS[chain];
    const logs_limit_ex: ILog[] = (
      await Promise.all(
        contractAddressList.map(async (address) => {
          return sdk.getEventLogs({
            target: address,
            toBlock: toBlock,
            fromBlock: fromBlock,
            chain: chain,
            topics: [topic0_limit_ex],
          });
        })
      )
    ).flatMap((response) => response as any) as ILog[];

    const logs_market_ex: ILog[] = (
      await Promise.all(
        contractAddressList.map(async (address) => {
          return sdk.getEventLogs({
            target: address,
            toBlock: toBlock,
            fromBlock: fromBlock,
            chain: chain,
            topics: [topic0_market_ex],
          });
        })
      )
    ).flatMap((response) => response as any) as ILog[];

    const limit_volume = logs_limit_ex
      .map((e: ILog) => {
        const data = e.data.replace("0x", "");
        let leverage = Number("0x" + data.slice(448, 512));
        if (leverage > 1000) {
          leverage = leverage / 10 ** LEVERAGE_DECIMAL;
        }
        const positionSizeUsdc =
          Number("0x" + data.slice(896, 960)) / 10 ** USDC_DECIMAL;
        return leverage * positionSizeUsdc;
      })
      .reduce((a: number, b: number) => a + b, 0);

    const market_volume = logs_market_ex
      .map((e: ILog) => {
        const data = e.data.replace("0x", "");
        let leverage = Number("0x" + data.slice(448, 512));
        if (leverage > 1000) {
          leverage = leverage / 10 ** LEVERAGE_DECIMAL;
        }
        const positionSizeUsdc =
          Number("0x" + data.slice(832, 896)) / 10 ** USDC_DECIMAL;
        return leverage * positionSizeUsdc;
      })
      .reduce((a: number, b: number) => a + b, 0);

    const dailyVolume = limit_volume + market_volume;
    return {
      dailyVolume: `${dailyVolume}`,
      timestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: 1690848000, // 2023/08/01 00:00:00
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1698883200, // 2023/11/02 00:00:00
    },
  },
};
export default adapter;
