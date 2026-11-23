import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

// daily series behind https://stats.monday.trade (the old thirdPart/defillama endpoint returns data: null since 2026-05-09)
const statsUrl = "https://files.monday.trade/monday-analytics-prod/latest"

const fetch = async (options: FetchOptions) => {
  const [volume, revenue] = await Promise.all([
    fetchURL(`${statsUrl}/perp-volume.json`),
    fetchURL(`${statsUrl}/perp-revenue.json`),
  ])

  const day = `${options.dateString}T00:00:00Z`
  const volumeDay = volume.data.find((i: any) => i.date === day)
  const feesDay = revenue.data.find((i: any) => i.date === day)
  if (!volumeDay || !feesDay) throw new Error(`stats.monday.trade has no perp data for ${options.dateString}`)

  return {
    dailyVolume: Number(volumeDay.volumeUsd),
    dailyFees: Number(feesDay.feesUsd),
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.MONAD],
  start: '2025-11-24',
  methodology: {
    Volume: "Daily perp trading volume from stats.monday.trade.",
    Fees: "fees paid by takers on the protocol by using market orders, these fees paid goes to limit order makers, AMM LP and protocol fees",
  }
};

export default adapter;
