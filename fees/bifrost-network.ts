import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const STATS_API = "https://explorer-stats.mainnet.thebifrost.io";

async function fetch(options: FetchOptions) {
  const date = options.dateString;
  const { chart } = await fetchURL(`${STATS_API}/api/v1/lines/txnsFee?from=${date}&to=${date}&resolution=DAY`);
  const entry = chart?.find((e: any) => e.date === date);
  if (!entry) throw new Error(`Bifrost Network: no txnsFee data for ${date}`);

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("bifrost", Number(entry.value));

  return { dailyFees };
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BFC],
  start: "2023-01-17",
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Total transaction fees paid by users on Bifrost Network.",
  },
};

export default adapter;
