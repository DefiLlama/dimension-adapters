// Vultisig is a self-custodial MPC wallet; its native cross-chain swaps route through THORChain
// and MayaChain with per-platform affiliate names (v0 SDK/desktop/extension, vi iOS, va Android).
// Numbers come from Vultisig's own analytics service - the same source the team reports from -
// which attributes swaps per provider (thorchain, mayachain, lifi, kyberswap, 1inch). Only the
// thorchain and mayachain sources are counted here: LI.FI, KyberSwap and 1inch swaps are already
// counted inside those providers' own DefiLlama listings, so including them would double count.
// Cross-checked against public Midgard affiliate attribution for the v0/vi/va THORNames: daily
// volume matches within one cent on non-streaming days (e.g. 2026-08-09: 5,065.81 vs 5,065.80);
// streaming-swap accounting can differ by a few percent on heavy days.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const ANALYTICS_API = "https://analytics.vultisig.com";

// start = first day the analytics service reports the source
const chainConfig: Record<string, { start: string; source: string }> = {
  [CHAIN.THORCHAIN]: { start: "2024-04-16", source: "thorchain" },
  [CHAIN.MAYA]: { start: "2024-09-10", source: "mayachain" },
};

type VolumeRow = { date: string; source: string; volume: number };

// One request serves every (day, chain) fetch: relative ranges (r=7d, ...) would omit older
// adapter dates, so the full daily history is fetched once and memoized for the run.
let volumeRows: Promise<VolumeRow[]> | undefined;
const getVolumeRows = () =>
(volumeRows ??= httpGet(`${ANALYTICS_API}/api/swap-volume?r=all&g=d`).then(
  (res) => res.volumeOverTime as VolumeRow[],
));

// version 1: the analytics service serves daily rows.
const fetch = async (options: FetchOptions) => {
  const { source } = chainConfig[options.chain];
  const rows = await getVolumeRows();

  const dailyVolume = options.createBalances();
  const sourceRows = rows.filter((row) => row.source === source);
  if (!sourceRows.length) {
    throw new Error(`No rows found for ${source}`);
  }
  const todaysRows = sourceRows.filter((row) => row.date.slice(0, 10) === options.dateString);
  const total = todaysRows.reduce((sum, row) => sum + row.volume, 0);
  dailyVolume.addUSDValue(total);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume:
      "Swap volume the Vultisig wallet routes natively through THORChain and MayaChain, reported by Vultisig's analytics service and cross-checked against each chain's public Midgard affiliate history for the Vultisig affiliate names v0 (SDK, desktop, extension), vi (iOS) and va (Android). Swaps routed through LI.FI, KyberSwap or 1inch are excluded - they are counted in those providers' own listings.",
  },
};

export default adapter;
