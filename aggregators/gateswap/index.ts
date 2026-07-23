import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

// Solana Gate Swap programs
const SOL_ALPHA_PROGRAM = "4w3DZU3zBu7149sTmEZ2XFTNxuvuX3F9f9heQFi6YtS6";
const SOL_NATIVE_PROGRAM = "2rwUXt3JeyPtUBjH5pscZLRDBoh9WADfXq7gyoDnLcC4";
// Jupiter route txs have no Gate program ID, identified by fee transfer to this address
const SOL_FEE_COLLECTOR = "BmDFarMxxp6ZBMZc768iWXbSEiGBVb4UvnE7hEUG7at7";

const GATE_SWAP_ROUTER = "0x0000000025e904C59aFDB33d50F982d46A7FF880";
const GATE_SWAP_ROUTER_ZKSYNC = "0x00000000599e65803D946115C7f817E2e8C7656a";
// Alpha routers by chain
const ALPHA_ROUTER = "0x000000003d55f1535A0116376858e6008De1435a"; // ETH,BSC,Base,ARB,OP,AVAX,Polygon,Bera,GateLayer,ENI,WC
const ALPHA_ROUTER_LINEA = "0xefE7a50f92b089B06d0e6cbCC85D7584424921B2";
const ALPHA_ROUTER_ROBINHOOD = "0x0000000055eC25287227AA8693471eE5f89221BE";
const ALPHA_ROUTER_ZKSYNC = "0xc438733Eb259D18bCA253495b209C3cd82B73902";

const EVENT_SWAP_DETAIL = "event SwapDetail(uint256 amountIn,uint256 amountOut,address tokenIn,address tokenOut,address sender,address receiver)";
const EVENT_ALPHA_ORDER = "event Order(uint160 indexed orderId,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)";
const EEE_NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

type ChainConfig = {
  start: string;
  routers: string[];
  alphaRouters?: string[];
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.BSC]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.BASE]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.ARBITRUM]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.AVAX]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.BLAST]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER] },
  [CHAIN.LINEA]: { start: "2025-09-10", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER_LINEA] },
  [CHAIN.OPTIMISM]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.GATE_LAYER]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.BERACHAIN]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.ENI]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.SONIC]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.POLYGON]: { start: "2026-03-04", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.ROBINHOOD]: { start: "2026-07-15", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER_ROBINHOOD] },
  [CHAIN.WC]: { start: "2026-02-28", routers: [GATE_SWAP_ROUTER], alphaRouters: [ALPHA_ROUTER] },
  [CHAIN.ERA]: { start: "2025-09-01", routers: [GATE_SWAP_ROUTER_ZKSYNC], alphaRouters: [ALPHA_ROUTER_ZKSYNC] },
};

function addTokenAmount(balances: any, token: string, amount: string) {
  if (!amount || amount === "0") return;
  const normalizedToken = token.toLowerCase();
  if (normalizedToken === ADDRESSES.null || normalizedToken === EEE_NATIVE_TOKEN) balances.addGasToken(amount);
  else balances.add(token, amount);
}

async function fetch(options: FetchOptions) {
  const { createBalances, chain } = options;
  const dailyVolume = createBalances();
  const chainConfig = config[chain];

  const swapDetailLogs = await options.getLogs({
    targets: chainConfig.routers,
    eventAbi: EVENT_SWAP_DETAIL,
    flatten: true,
  });

  swapDetailLogs.forEach((log: any) => addTokenAmount(dailyVolume, log.tokenOut, log.amountOut));

  if (chainConfig.alphaRouters?.length) {
    const alphaOrderLogs = await options.getLogs({
      targets: chainConfig.alphaRouters,
      eventAbi: EVENT_ALPHA_ORDER,
      flatten: true,
    });

    alphaOrderLogs.forEach((log: any) => addTokenAmount(dailyVolume, log.tokenOut, log.amountOut));
  }

  return { dailyVolume };
}

async function fetchSolana(options: FetchOptions) {
  const data = await queryDuneSql(
    options,
    `
    WITH gateswap_txs AS (
      -- Native + Alpha: identified by Gate program ID in account_keys
      SELECT DISTINCT id AS tx_id
      FROM solana.transactions
      WHERE TIME_RANGE
        AND success = true
        AND (
          CONTAINS(account_keys, '${SOL_ALPHA_PROGRAM}')
          OR CONTAINS(account_keys, '${SOL_NATIVE_PROGRAM}')
        )

      UNION

      -- Jupiter route: no Gate program ID, identified by fee transfer to fee collector
      SELECT DISTINCT tx_id
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND address = '${SOL_FEE_COLLECTOR}'
        AND balance_change > 0
    )
    SELECT COALESCE(SUM(t.amount_usd), 0) AS daily_volume
    FROM dex_solana.trades t
    JOIN gateswap_txs g ON t.tx_id = g.tx_id
    WHERE TIME_RANGE
    `,
  );

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(data[0]?.daily_volume ?? 0);
  return { dailyVolume };
}

const evmAdapter = Object.fromEntries(Object.entries(config).map(([chain, { start }]) => [chain, { fetch, start }]));

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Gate Swap aggregator volume: EVM chains use SwapDetail/Alpha Order events; Solana uses dex_solana.trades for txs identified by Gate program IDs (自研/Alpha) or fee transfers to the Gate fee collector (Jupiter route).",
  },
  adapter: {
    ...evmAdapter,
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-02-28" },
  },
};

export default adapter;
