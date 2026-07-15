import { Dependencies, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeData } from "../../helpers/aggregators/bungee";
import { fetchBimChains } from "./config";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import fetchURL from "../../utils/fetchURL";

const STELLAR_SWAP_URL = "https://defillama-data.bim.finance/swap";

// Bim moved to Bungee's new API: txs now go through AllowanceHolder -> OpenRouter
// (same addresses on every chain). The RequestExecuted event only carries an opaque
// quoteId, but bim's integrator fee wallet is always present in the calldata
// (FeeData.receiver), so we filter txs on it and price swaps via dex.trades.
const DUNE_START_TIMESTAMP = 1782259200; // 2026-06-24, first day fully on the new API
const ALLOWANCE_HOLDER = '0x50c4e75a512f2a14a7b304787adf79c4531a5909';
const OPEN_ROUTER = '0x50cfe7c1938db66a1a6d2e86d36f39fbef3d5c4a';
const REQUEST_EXECUTED_TOPIC = '0xe2a752598b97815acff854b1d0b6d5c7f33b848bcbb541df9b76038287282467';
const BIM_FEE_WALLET_WORD = '0x0000000000000000000000005c6bcf885453394ea71986bb8de596c34f9a19ee';
const SWAP_SELECTOR = '0x1bb1a530'; // OpenRouter.swap - bridge/swapAndBridge are bridge volume

const DUNE_CHAIN_MAP: { [key: string]: string } = {
  [CHAIN.BSC]: 'bnb',
  [CHAIN.XDAI]: 'gnosis',
};

const getDuneChain = (chain: string) => DUNE_CHAIN_MAP[chain] ?? chain;
const duneChains = fetchBimChains().map((chain) => `'${getDuneChain(chain)}'`).join(', ');

const prefetch = async (options: FetchOptions) => {
  if (options.endTimestamp <= DUNE_START_TIMESTAMP) return [];

  // OpenRouter.swap calls with bim's fee wallet in FeeData.receiver, entered either
  // directly or through AllowanceHolder.exec (inner calldata starts at byte 197).
  return queryDuneSql(options, `
    WITH bim_swaps AS (
      SELECT
        t.blockchain,
        t.hash
      FROM evms.transactions t
      INNER JOIN (
        SELECT blockchain, tx_hash
        FROM evms.logs
        WHERE blockchain IN (${duneChains})
          AND contract_address = ${OPEN_ROUTER}
          AND topic0 = ${REQUEST_EXECUTED_TOPIC}
          AND TIME_RANGE
        GROUP BY 1, 2
      ) l ON t.blockchain = l.blockchain AND t.hash = l.tx_hash
      WHERE t.blockchain IN (${duneChains})
        AND t."to" IN (${ALLOWANCE_HOLDER}, ${OPEN_ROUTER})
        AND bytearray_position(t.data, ${BIM_FEE_WALLET_WORD}) > 0
        AND CASE WHEN t."to" = ${ALLOWANCE_HOLDER}
          THEN bytearray_substring(t.data, 197, 4)
          ELSE bytearray_substring(t.data, 1, 4)
        END = ${SWAP_SELECTOR}
        AND TIME_RANGE
    )
    SELECT
      d.blockchain,
      SUM(d.amount_usd) AS volume
    FROM dex.trades d
    INNER JOIN bim_swaps b ON d.blockchain = b.blockchain AND d.tx_hash = b.hash
    WHERE d.blockchain IN (${duneChains})
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
