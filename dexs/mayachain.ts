import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

// Maya's Midgard mirrors THORChain's swaps endpoint. CACAO is 1e10-denominated
// (THORChain's RUNE is 1e8), and the day's price field is cacaoPriceUSD.
interface IVolumeInterval {
  totalVolume: string;
  cacaoPriceUSD: string;
  startTime: string;
}

// CACAO has 10 decimals (1e10 base units), unlike THORChain's RUNE which has 8.
// https://docs.mayaprotocol.com/mayachain-dev-docs/introduction/technology/native-assets
const CACAO_BASE_UNIT = 1e10;

// Parse a required Midgard numeric field. Reject empty/missing values explicitly:
// Number("") and Number(null) both coerce to a finite 0, which would silently
// publish a false zero instead of failing closed.
const requireFinite = (raw: string, field: string): number => {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`MAYAChain: missing Midgard field ${field}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`MAYAChain: non-numeric Midgard field ${field}=${raw}`);
  }
  return value;
};

const calVolume = (interval: IVolumeInterval): number => {
  const cacaoPriceUSD = requireFinite(interval.cacaoPriceUSD, "cacaoPriceUSD");
  const totalVolume = requireFinite(interval.totalVolume, "totalVolume");
  return (totalVolume / CACAO_BASE_UNIT) * cacaoPriceUSD;
};

const fetch = async (options: FetchOptions) => {
  const url = `https://midgard.mayachain.info/v2/history/swaps?interval=day&from=${options.startOfDay}&to=${options.endTimestamp}`;
  const intervals: IVolumeInterval[] = (await httpGet(url, { headers: { "x-client-id": "defillama" } })).intervals;
  const day = intervals.find((i: IVolumeInterval) => Number(i.startTime) === options.startOfDay);
  if (!day) {
    throw new Error(`MAYAChain: no Midgard swap interval for startOfDay ${options.startOfDay}`);
  }
  return { dailyVolume: calVolume(day) };
};

const methodology = {
  Volume: "Total USD value of swaps executed through MAYAChain's liquidity pools, sourced from MAYAChain Midgard. Every swap routes through native CACAO and settles on the MAYAChain L1, so volume is reported on the MAYAChain chain. Daily CACAO-denominated swap volume is converted to USD using that day's CACAO price.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MAYA],
  start: '2023-03-16', // MAYAChain mainnet launch
  methodology,
};

export default adapter;
