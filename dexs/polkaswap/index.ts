import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const API = "https://sorametrics.org";

// SoraMetrics limits each route per IP per minute (10-300 requests); wait out a 429 instead of failing the window
async function get(path: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await httpGet(`${API}${path}`, { timeout: 30000 });
    } catch (e: any) {
      if (attempt >= 3 || !String(e?.message).includes("429")) throw e;
      await sleep(61000);
    }
  }
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  const { jobs } = await get("/health/freshness");
  const cursor = jobs?.find((job: any) => job.job_name === "substrate_live")?.last_processed_block;
  if (!Number.isInteger(cursor)) throw new Error("SoraMetrics: no indexer cursor");
  const { timestamp: cursorMs } = await get(`/block/${cursor}`);
  if (!(cursorMs >= endTimestamp * 1000)) throw new Error(`SoraMetrics indexer is behind the window end (block ${cursor})`);

  const previous = await get(`/history/global/swaps?limit=1&timestamp=${startTimestamp * 1000 - 1}`);
  const startBlock = previous?.data?.[0]?.block;
  if (!Number.isInteger(startBlock)) throw new Error("SoraMetrics: no swap before the window start");

  const dailyVolume = options.createBalances();
  let path = `/history/global/swaps?limit=100&timestamp=${endTimestamp * 1000 - 1}`;
  while (true) {
    const { data, next_before } = await get(path);
    if (!Array.isArray(data) || !data.length) throw new Error("SoraMetrics: swaps ended before the window start");
    for (const swap of data) {
      if (swap.block <= startBlock) return { dailyVolume };
      dailyVolume.addUSDValue(swap.in.usd);
    }
    if (!next_before) throw new Error("SoraMetrics: swaps ended before the window start");
    path = `/history/global/swaps?limit=100&before=${next_before}`;
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SORA],
  start: '2023-01-08',
  methodology: {
    Volume: "Swaps executed through Polkaswap's liquidity proxy on SORA, each valued at its cheaper priced leg; swaps where neither token has a price are excluded.",
  },
};

export default adapter;
