import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchOmnipairDuneDaily } from "../../helpers/omnipairDune";

const methodology = {
  Volume: "Trading volume on Omnipair, measured as raw input token amount (amount_in) per swap and aggregated by token_in_mint from Dune.",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const rows = await fetchOmnipairDuneDaily(options);

  for (const row of rows) {
    dailyVolume.add(row.token_in_mint, row.daily_volume);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  start: "2026-02-01",
  methodology,
  dependencies: [Dependencies.DUNE],
  fetch,
};

export default adapter;