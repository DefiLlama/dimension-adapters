import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

type IAddresses = {
  [s: string | Chain]: string[];
};

interface ILog {
  address: string;
  data: string;
}

const topic0_limit_ex = [
  "0x1ab0771256522e5114b583b488c490436d6f8fe02b1e1c9697443e8704c4e840", // v5-v6
  "0xa97091b8c54bf9d1906c2a06322d0ea74fedde4538cdcdf95d81d0ffdca41857", // v7
];
const topic0_market_ex = [
  "0x2739a12dffae5d66bd9e126a286078ed771840f2288f0afa5709ce38c3330997", // v5-v6
  "0xca42b0e44cd853d207b87e8f8914eaefef9c9463a8c77ca33754aa62f6904f00", // v7
];

const precisionException: { [a: string]: number } = {
  "0x2ac6749d0affd42c8d61ef25e433f92e375a1aef": 1e6,
  "0x4542256c583bcad66a19a525b57203773a6485bf": 1e6,
};

const contract_addresses: IAddresses = {
  [CHAIN.POLYGON]: [
    "0x82e59334da8c667797009bbe82473b55c7a6b311", // DAI TradingCallbacks
    "0x0bbed2eac3237ba128643670b7cf3be475933755", // ETH TradingCallbacks
    "0x2ac6749d0affd42c8d61ef25e433f92e375a1aef", // USDC TradingCallbacks
  ],
  [CHAIN.ARBITRUM]: [
    "0x298a695906e16aea0a184a2815a76ead1a0b7522", // DAI TradingCallbacks
    "0x62a9f50c92a57c719ff741133caa55c7a81ce019", // ETH TradingCallbacks
    "0x4542256c583bcad66a19a525b57203773a6485bf", // USDC TradingCallbacks
  ],
};

const fetch: any = async (timestamp: number, _, { getLogs, createBalances, chain }): Promise<FetchResultVolume> => {
  const limitLogs: ILog[] = (
    (await Promise.all(
      topic0_limit_ex.map(async (topic0) =>
        getLogs({
          targets: contract_addresses[chain],
          topics: [topic0],
        })
      )
    )) as ILog[][]
  ).flat();

  const marketLogs: ILog[] = (
    (await Promise.all(
      topic0_market_ex.map(async (topic0) =>
        getLogs({
          targets: contract_addresses[chain],
          topics: [topic0],
        })
      )
    )) as ILog[][]
  ).flat();

  const limit_volume = limitLogs
    .map((e: ILog) => {
      const data = e.data.replace("0x", "");
      const leverage = Number("0x" + data.slice(512, 576));
      const positionSizeDai = Number("0x" + data.slice(896, 960)) / (precisionException[e.address] ?? 1e18);
      const collateralPrice = (data.length === 1216 ? Number("0x" + data.slice(1088, 1152)) : 1e8) / 1e8;
      return leverage * positionSizeDai * collateralPrice;
    })
    .reduce((a: number, b: number) => a + b, 0);

  const market_volume = marketLogs
    .map((e: ILog) => {
      const data = e.data.replace("0x", "");
      const leverage = Number("0x" + data.slice(448, 512));
      const positionSizeDai = Number("0x" + data.slice(832, 896)) / (precisionException[e.address] ?? 1e18);
      const collateralPrice = (data.length === 1088 ? Number("0x" + data.slice(1024, 1088)) : 1e8) / 1e8;
      return leverage * positionSizeDai * collateralPrice;
    })
    .reduce((a: number, b: number) => a + b, 0);

  const dailyVolume = limit_volume + market_volume;

  return { dailyVolume, timestamp, };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: 1684972800, },
    [CHAIN.POLYGON]: { fetch, start: 1684972800, },
  },
};

export default adapter;
