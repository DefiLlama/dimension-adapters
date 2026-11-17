import fetchURL from "../utils/fetchURL"
import { Chain, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const historicalVolumeEndpoint = "https://stats.mux.network/api/public/dashboard/13f401da-31b4-4d35-8529-bb62ca408de8/dashcard/389/card/306"

interface IVolumeall {
  volume: string;
  time: string;
  title: string;
}

const chainsMap = {
  [CHAIN.ARBITRUM]: "Arbitrum",
  [CHAIN.AVAX]: "Avalanche",
  [CHAIN.BSC]: "BNB Chain",
  [CHAIN.FANTOM]: "Fantom",
  [CHAIN.OPTIMISM]: "Optimism",
}

// Without the dashboard's date filters the card returns only its newest 2000 rows (about the last 640 days), so older
// days come back empty. Ask for the one day instead: start_date is inclusive, end_date exclusive.
const dayParameters = (start: string, end: string) => encodeURIComponent(JSON.stringify([
  { id: "4af86e51", type: "date/single", value: start, target: ["variable", ["template-tag", "start_date"]] },
  { id: "258bc4e7", type: "date/single", value: end, target: ["variable", ["template-tag", "end_date"]] },
]))

const fetch = async ({ chain, dateString, startOfDay }: FetchOptions) => {
  // The card's row for the current day is a running total.
  if (startOfDay + 86400 > Date.now() / 1e3)
    throw new Error(`mux-protocol-agge: ${dateString} has not ended yet`)

  const nextDay = new Date((startOfDay + 86400) * 1000).toISOString().slice(0, 10)
  const callhistoricalVolume = (await fetchURL(`${historicalVolumeEndpoint}?parameters=${dayParameters(dateString, nextDay)}`))?.data.rows;

  const historicalVolume: IVolumeall[] = callhistoricalVolume.map((e: string[] | number[]) => {
    const [time, title, volume] = e;
    return {
      time,
      volume,
      title
    } as IVolumeall;
  });

  // If the filter ids ever change, Metabase drops the filter and returns the capped default rows instead.
  if (historicalVolume.some((e: IVolumeall) => e.time.slice(0, 10) !== dateString))
    throw new Error(`mux-protocol-agge: the card ignored the date filter for ${dateString}`)
  // Arbitrum alone has a row on every day since 2022-08, so no rows at all means the day isn't there.
  if (!historicalVolume.length)
    throw new Error(`mux-protocol-agge: the card has no rows for ${dateString}`)

  const historical = historicalVolume.filter((e: IVolumeall) => e.title === (chainsMap as any)[chain]);
  // The card leaves a chain out on a day it had no trades.
  const dailyVolume = historical
    .find(dayItem => dayItem.time.slice(0, 10) === dateString)?.volume ?? 0

  return {
    dailyVolume,
  };
}

export default {
  version: 1,
  fetch,
  chains: Object.keys(chainsMap) as Chain[],
}