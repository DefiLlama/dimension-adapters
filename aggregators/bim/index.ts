import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeData } from "../../helpers/aggregators/bungee";
import { bimAdapterChains, bimTxsCte, duneChains, getDuneChain, DUNE_START_TIMESTAMP, SWAP_SELECTOR, BIM_FEE_WALLET } from "./config";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import fetchURL from "../../utils/fetchURL";

const STELLAR_SWAP_URL = "https://defillama-data.bim.finance/swap";

const prefetch = async (options: FetchOptions) => {
  if (options.endTimestamp <= DUNE_START_TIMESTAMP) return [];

  // Same-chain swaps only (OpenRouter.swap)
  return queryDuneSql(options, `
    WITH bim_txs AS (${bimTxsCte}),
    volume AS (
      SELECT
        d.blockchain,
        SUM(d.amount_usd) AS value
      FROM dex.trades d
      INNER JOIN bim_txs b ON d.blockchain = b.blockchain AND d.tx_hash = b.hash
      WHERE d.blockchain IN (${duneChains})
        AND b.selector = ${SWAP_SELECTOR}
        AND d.amount_usd IS NOT NULL
        AND TIME_RANGE
      GROUP BY 1
    ),
    fees AS (
      SELECT
        tt.blockchain,
        tt.contract_address AS token,
        SUM(tt.amount_raw) AS amount
      FROM tokens.transfers tt
      INNER JOIN bim_txs b ON tt.blockchain = b.blockchain AND tt.tx_hash = b.hash
      WHERE tt.blockchain IN (${duneChains})
        AND tt."to" = ${BIM_FEE_WALLET}
        AND b.selector = ${SWAP_SELECTOR}
        AND TIME_RANGE
      GROUP BY 1, 2
    )
    SELECT blockchain, 'volume' AS metric, NULL AS token, CAST(value AS varchar) AS amount FROM volume
    UNION ALL
    SELECT blockchain, 'fees' AS metric, token, CAST(amount AS varchar) AS amount FROM fees
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

const fetch: any = async (options: FetchOptions): Promise<FetchResult> => {
  if (options.startTimestamp < DUNE_START_TIMESTAMP) {
    const { dailyVolume } = await fetchBungeeData(options, { swapVolume: true }, '2758')
    return {
      dailyVolume,
    };
  }
  const dailyFees = options.createBalances();
  const rows = (options.preFetchedResults || []) as Array<{ blockchain: string, metric: string, token: string | null, amount: string }>;
  const chainRows = rows.filter((row) => row.blockchain === getDuneChain(options.chain));
  chainRows.filter((row) => row.metric === 'fees').forEach((row) => {
    dailyFees.add(row.token ?? ADDRESSES.null, row.amount);
  });
  return {
    dailyVolume: Number(chainRows.find((row) => row.metric === 'volume')?.amount ?? 0),
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  doublecounted: true, //Bungee
  dependencies: [Dependencies.DUNE],
  prefetch,
  adapter: {
    ...bimAdapterChains.reduce((acc, chain) => {
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
