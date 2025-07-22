import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "../../adapters/types";

const topic0_limit_ex =
  "0x165b0f8d6347f7ebe92729625b03ace41aeea8fd7ebf640f89f2593ab0db63d1";
const topic0_market_ex =
  "0x2739a12dffae5d66bd9e126a286078ed771840f2288f0afa5709ce38c3330997";

type IAddress = {
  [s: string | Chain]: string[];
};


// GambitTradingCallbacksV1 address
const CONTRACT_ADDRESS: IAddress = {
  [CHAIN.ERA]: [
    "0xE95a6FCC476Dc306749c2Ac62fB4637c27ac578d",
    "0x6cf71FaeA3771D56e72c72501e7172e79116E2A3",
    "0x50853A14cD14CC6A891BF034A204A15d294AF056",
    "0x240d75373f9941b8F7FbA660b9ae73dfa655f7Da", // v1.3.4
    "0x43c1cc807Dc22bCF7C789eDE4d1B4828C87A06D1", // v1.5.1
    "0x3bEa4Af64689ce3429D312cf205312842C944DeE", // v1.6.0
  ],
  [CHAIN.ARBITRUM]: [
    "0x8d85f4615ea5F2Ea8D91C196aaD4C04D8416865C",
    "0xB88C3A703B3565cb7bfdB1806Ba3728C54dd4b91", // v1.3.1
    "0x77233F7F6f11300Fd30B338dA38D96a7bFD5aB86", // v1.5.1
    "0xB4099795021506b67ef974eCb85e10898e2F0D45", // v1.6.0
  ],
};


const fetch = async ({ chain, createBalances, getLogs }: FetchOptions) => {
  const dailyVolume = createBalances();
  const marketLogs = await getLogs({
    targets: CONTRACT_ADDRESS[chain],
    eventAbi: "event MarketExecuted(uint256 indexed orderId, (address trader, uint256 pairIndex, uint256 index, uint256 initialPosToken, uint256 positionSizeUsdc, uint256 openPrice, bool buy, uint256 leverage, uint256 tp, uint256 sl) t, bool open, uint256 price, uint256 priceImpactP, uint256 positionSizeUsdc, int256 percentProfit, uint256 usdcSentToTrader)",
    topics: [topic0_market_ex],
  });
  const limitLogs = await getLogs({
    targets: CONTRACT_ADDRESS[chain],
    eventAbi: "event LimitExecuted(uint256 indexed orderId, uint256 limitIndex, (address trader, uint256 pairIndex, uint256 index, uint256 initialPosToken, uint256 positionSizeUsdc, uint256 openPrice, bool buy, uint256 leverage, uint256 tp, uint256 sl) t, address indexed nftHolder, uint8 orderType, uint256 price, uint256 priceImpactP, uint256 positionSizeUsdc, int256 percentProfit, uint256 usdcSentToTrader)",
    topics: [topic0_limit_ex],
  });
  marketLogs.concat(limitLogs).forEach(i => {
    let leverage = Number(i.t.leverage)
    if (leverage > 1000) 
      leverage = leverage / 1e18
    dailyVolume.addUSDValue(leverage * i.positionSizeUsdc.toString() / 1e6)
  });

  return { dailyVolume };
} 

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ERA]: { fetch, start: '2023-08-01', },
    [CHAIN.ARBITRUM]: { fetch, start: '2023-11-02', },
  },
  version: 2
};
export default adapter;
