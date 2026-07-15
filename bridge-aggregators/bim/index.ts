import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeData } from "../../helpers/aggregators/bungee";
import {
  bimAdapterChains,
  bimTxsCte,
  duneChains,
  getDuneChain,
  DUNE_START_TIMESTAMP,
  ALLOWANCE_HOLDER,
  BIM_FEE_WALLET,
  BRIDGE_SELECTOR,
  SWAP_AND_BRIDGE_SELECTOR,
  PERFORM_ACTIONS_SELECTOR,
} from "../../aggregators/bim/config";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import fetchURL from "../../utils/fetchURL";

const STELLAR_BRIDGE_URL = "https://defillama-data.bim.finance/bridge";

const prefetch = async (options: FetchOptions) => {
  if (options.endTimestamp <= DUNE_START_TIMESTAMP) return [];

  // Bridge volume = input token/amount of bridge, swapAndBridge and performActions
  // (batched cross-chain routes) txs. For bridge/swapAndBridge the input sits right
  // before the fee wallet word in calldata; performActions has no fixed layout, so
  // the input is read from the AllowanceHolder.exec wrapper args instead (token at
  // byte 49, amount at byte 69) - performActions called directly on OpenRouter is
  // skipped as there is no fixed position to read from.
  return queryDuneSql(options, `
    WITH bim_txs AS (${bimTxsCte}),
    bridge_inputs AS (
      SELECT
        blockchain,
        CASE
          WHEN selector IN (${BRIDGE_SELECTOR}, ${SWAP_AND_BRIDGE_SELECTOR})
            THEN bytearray_substring(data, fee_pos - 52, 20)
          WHEN selector = ${PERFORM_ACTIONS_SELECTOR} AND tx_to = ${ALLOWANCE_HOLDER}
            THEN bytearray_substring(data, 49, 20)
        END AS token,
        CASE
          WHEN selector IN (${BRIDGE_SELECTOR}, ${SWAP_AND_BRIDGE_SELECTOR})
            THEN bytearray_to_uint256(bytearray_substring(data, fee_pos - 32, 32))
          WHEN selector = ${PERFORM_ACTIONS_SELECTOR} AND tx_to = ${ALLOWANCE_HOLDER}
            THEN bytearray_to_uint256(bytearray_substring(data, 69, 32))
        END AS amount
      FROM bim_txs
      WHERE fee_pos > 64
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
        AND b.selector IN (${BRIDGE_SELECTOR}, ${SWAP_AND_BRIDGE_SELECTOR}, ${PERFORM_ACTIONS_SELECTOR})
        AND TIME_RANGE
      GROUP BY 1, 2
    )
    SELECT
      blockchain,
      'volume' AS metric,
      token,
      CAST(SUM(amount) AS varchar) AS amount
    FROM bridge_inputs
    WHERE token IS NOT NULL
    GROUP BY 1, 3
    UNION ALL
    SELECT
      blockchain,
      'fees' AS metric,
      token,
      CAST(amount AS varchar) AS amount
    FROM fees
  `);
};

const fetchStellarBridge = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const data = await fetchURL(`${STELLAR_BRIDGE_URL}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`);
  const dailyBridgeVolume = options.createBalances();
  const dailyFees = options.createBalances();
  if (data.volume?.USDC) { const v = Number(data.volume.USDC); if (Number.isFinite(v)) dailyBridgeVolume.addCGToken("usd-coin", v); }
  if (data.volume?.XLM) { const v = Number(data.volume.XLM); if (Number.isFinite(v)) dailyBridgeVolume.addCGToken("stellar", v); }
  if (data.fees?.USDC) { const v = Number(data.fees.USDC); if (Number.isFinite(v)) dailyFees.addCGToken("usd-coin", v); }
  if (data.fees?.XLM) { const v = Number(data.fees.XLM); if (Number.isFinite(v)) dailyFees.addCGToken("stellar", v); }
  return { dailyBridgeVolume, dailyFees };
};

const fetch: any = async (options: FetchOptions): Promise<FetchResult> => {
  if (options.startTimestamp < DUNE_START_TIMESTAMP) {
    const { dailyBridgeVolume } = await fetchBungeeData(options, { bridgeVolume: true }, '2758')
    return {
      dailyBridgeVolume,
    };
  }
  const dailyBridgeVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const rows = (options.preFetchedResults || []) as Array<{ blockchain: string, metric: string, token: string | null, amount: string }>;
  rows.filter((row) => row.blockchain === getDuneChain(options.chain)).forEach((row) => {
    // volume rows use 0xeeee... for native input, fee rows (tokens.transfers) use null
    const token = !row.token || row.token.toLowerCase() === ADDRESSES.GAS_TOKEN_2 ? ADDRESSES.null : row.token;
    if (row.metric === 'volume') dailyBridgeVolume.add(token, row.amount);
    else if (row.metric === 'fees') dailyFees.add(token, row.amount);
  });
  return {
    dailyBridgeVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  doublecounted: true, //Bungee
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
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
      fetch: fetchStellarBridge,
      start: '2026-04-19',
    },
  }
};

export default adapter;
