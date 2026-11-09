import { ChainApi } from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { toPositionedLogArgs } from "../../helpers/logs";
import { httpGet } from "../../utils/fetchURL";

export const FACTORY = "0x6a00c8Cb5Fb5aAac9C91A2649bd42a26Ca3dEeE1";
const FACTORY_DEPLOY_BLOCK = 185543532;

export const PLATFORM_PRESET = 3;

const ABI = {
  count: "uint256:count",
  quoteToken: "address:quoteToken",
  launches: "function launches(uint256 index) view returns (address token, address market, address vault, address schedule, address adapter, address creator, bytes32 marketId, bool shortThesis, uint8 leverage, uint8 profile, uint8 preset)",
  // gross USDC traded through the market: buys fee included, sells before the fee is taken, founding-sale tickets
  totalVolume: "uint256:totalVolume",
  // 0 founding sale (RUNUP token only), 1 bonding curve, 2 graduated pool
  phase: "uint8:phase",
  graduated: "event Graduated(uint256 poolQuote, uint256 treasuryCapital)",
  traded: "event Traded(address indexed trader, address indexed recipient, bool buy, uint256 quoteAmount, uint256 tokens, uint256 fee)",
};
const PHASE_GRADUATED = 2;

export interface ActiveMarket {
  market: string;
  preset: number;
  existedAtFrom: boolean;
  fromVolume: bigint;
  volume: bigint;
}

export interface MarketWindow {
  quote: string;
  fromBlock: number;
  toBlock: number;
  fromApi: ChainApi;
  toApi: ChainApi;
  markets: ActiveMarket[];
}

const getBlock = async (timestamp: number): Promise<number> => {
  const { height } = await httpGet(`https://coins.llama.fi/block/${CHAIN.INJECTIVE}/${timestamp}`);
  if (!height) throw new Error(`RunUp: no injective block for timestamp ${timestamp}`);
  return height;
};

const getCount = async (api: ChainApi, block: number) =>
  block < FACTORY_DEPLOY_BLOCK ? 0 : Number(await api.call({ target: FACTORY, abi: ABI.count }));

export async function getMarketWindow(options: FetchOptions): Promise<MarketWindow> {
  const fromBlock = await getBlock(options.fromTimestamp);
  const toBlock = await getBlock(options.toTimestamp);
  const fromApi = new ChainApi({ chain: options.chain, block: fromBlock });
  const toApi = new ChainApi({ chain: options.chain, block: toBlock });

  const fromCount = await getCount(fromApi, fromBlock);
  const toCount = await getCount(toApi, toBlock);
  if (!toCount) return { quote: "", fromBlock, toBlock, fromApi, toApi, markets: [] };

  const quote = await toApi.call({ target: FACTORY, abi: ABI.quoteToken });
  const launches = await toApi.multiCall({ target: FACTORY, abi: ABI.launches, calls: [...Array(toCount).keys()] });
  const marketList: string[] = launches.map((launch: any) => launch.market);
  const toVolumes = await toApi.multiCall({ abi: ABI.totalVolume, calls: marketList });

  const fromVolumes = await fromApi.multiCall({ abi: ABI.totalVolume, calls: marketList.slice(0, fromCount) });

  const markets: ActiveMarket[] = [];
  marketList.forEach((market, i) => {
    const fromVolume = BigInt(i < fromCount ? fromVolumes[i] : 0);
    const volume = BigInt(toVolumes[i]) - fromVolume;
    if (volume < 0n) throw new Error(`RunUp: totalVolume of market ${market} decreased between blocks ${fromBlock} and ${toBlock}`);
    if (volume > 0n) markets.push({ market, preset: Number(launches[i].preset), existedAtFrom: i < fromCount, fromVolume, volume });
  });

  return { quote, fromBlock, toBlock, fromApi, toApi, markets };
}

export async function getCurveVolume(options: FetchOptions, window: MarketWindow): Promise<bigint> {
  const { markets, fromApi, toApi, fromBlock, toBlock } = window;
  if (!markets.length) return 0n;

  const existing = markets.filter((m) => m.existedAtFrom);
  const toPhase = await toApi.multiCall({ abi: ABI.phase, calls: markets.map((m) => m.market) });
  const fromPhaseList = await fromApi.multiCall({ abi: ABI.phase, calls: existing.map((m) => m.market) });
  const fromPhase = new Map(existing.map((m, i) => [m.market, Number(fromPhaseList[i])]));

  let curveVolume = 0n;
  const graduating: ActiveMarket[] = [];
  markets.forEach((m, i) => {
    if (Number(toPhase[i]) !== PHASE_GRADUATED) curveVolume += m.volume;
    else if (fromPhase.get(m.market) !== PHASE_GRADUATED) graduating.push(m);
  });
  if (!graduating.length) return curveVolume;

  const logRange = { targets: graduating.map((m) => m.market), fromBlock: fromBlock + 1, toBlock, onlyArgs: false, flatten: false };
  const graduationLogs: any[][] = await options.getLogs({ ...logRange, eventAbi: ABI.graduated });
  const tradeLogs: any[][] = await options.getLogs({ ...logRange, eventAbi: ABI.traded });

  for (const [i, m] of graduating.entries()) {
    const [graduation] = graduationLogs[i].map(toPositionedLogArgs);
    if (!graduation) throw new Error(`RunUp: market ${m.market} graduated in blocks ${fromBlock}-${toBlock} but no Graduated event was found`);
    const block = graduation.blockNumber;
    const volumeAtGraduation = BigInt(await new ChainApi({ chain: options.chain, block }).call({ target: m.market, abi: ABI.totalVolume }));
    const poolTradesInBlock = tradeLogs[i].map(toPositionedLogArgs)
      .filter((trade) => trade.blockNumber === block && trade.logIndex > graduation.logIndex)
      .reduce((acc, trade) => acc + BigInt(trade.quoteAmount) + (trade.buy ? 0n : BigInt(trade.fee)), 0n);
    curveVolume += volumeAtGraduation - poolTradesInBlock - m.fromVolume;
  }
  return curveVolume;
}
