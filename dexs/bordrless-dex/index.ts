import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Bordrless's indexer of its own programs (source: https://github.com/BordrlessDex/bordrless-sdk). Amounts
// are raw base units by mint; bridged SOL is told as SOL.
const fetch = async (options: FetchOptions) => {
  const data = await httpGet(`https://bordrless.app/api/stats/defillama?start=${options.startTimestamp}&end=${options.endTimestamp}`);
  const dailyVolume = options.createBalances();
  for (const [mint, raw] of Object.entries(data.dex.volume as Record<string, string>)) dailyVolume.add(mint, Number(raw));
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: { [CHAIN.SOLANA]: { fetch, start: "2026-10-08" } },
  methodology: { Volume: "Sum of trades on the Bordrless DEX, including launched coins after they graduate." },
};

export default adapter;
