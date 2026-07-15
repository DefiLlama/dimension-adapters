import { Dependencies, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeData } from "../../helpers/aggregators/bungee";
import { fetchBimChains, bimTxsCte, duneChains, getDuneChain, DUNE_START_TIMESTAMP, SWAP_SELECTOR } from "./config";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import fetchURL from "../../utils/fetchURL";

const STELLAR_SWAP_URL = "https://defillama-data.bim.finance/swap";

const prefetch = async (options: FetchOptions) => {
  if (options.endTimestamp <= DUNE_START_TIMESTAMP) return [];

  // Same-chain swaps only (OpenRouter.swap): bridge/swapAndBridge/performActions
  // are counted by the bridge-aggregators/bim adapter instead.
  return queryDuneSql(options, `
    WITH bim_txs AS (${bimTxsCte})
    SELECT
      d.blockchain,
      SUM(d.amount_usd) AS volume
    FROM dex.trades d
    INNER JOIN bim_txs b ON d.blockchain = b.blockchain AND d.tx_hash = b.hash
    WHERE d.blockchain IN (${duneChains})
      AND b.selector = ${SWAP_SELECTOR}
      AND d.amount_usd IS NOT NULL
      AND TIME_RANGE
    GROUP BY 1
  `);
};

const fetchStellarSwap = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const data = await fetchURL(`${STELLAR_SWAP_URL}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`);
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  if (data.volume?.USDC) { const v = Number(data.volume.USDC); if (Number.isFinite(v)) dailyVolume.addCGToken("usd-coin", v); }
  if (data.volume?.XLM) { const v = Number(data.volume.XLM); if (Number.isFinite(v)) dailyVolume.addCGToken("stellar", v); }
  if (data.fees?.USDC) { const v = Number(data.fees.USDC); if (Number.isFinite(v)) dailyFees.addCGToken("usd-coin", v); }
  if (data.fees?.XLM) { const v = Number(data.fees.XLM); if (Number.isFinite(v)) dailyFees.addCGToken("stellar", v); }
  return { dailyVolume, dailyFees };
};

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  if (options.startTimestamp < DUNE_START_TIMESTAMP) {
    const { dailyVolume } = await fetchBungeeData(options, { swapVolume: true }, '2758')
    return {
      dailyVolume,
    };
  }
  const rows = (options.preFetchedResults || []) as Array<{ blockchain: string, volume: number }>;
  const chainData = rows.find((row) => row.blockchain === getDuneChain(options.chain));
  return {
    dailyVolume: chainData?.volume ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  doublecounted: true, //Bungee
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  prefetch,
  adapter: {
    ...fetchBimChains().reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch,
          start: '2026-01-13',
        }
      }
    }, {}),
    [CHAIN.STELLAR]: {
      fetch: fetchStellarSwap,
      start: '2026-04-19',
    },
  }
};

export default adapter;
