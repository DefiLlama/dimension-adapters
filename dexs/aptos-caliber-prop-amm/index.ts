import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const APTOS_SWAP_EVENT_V2 =
  "0x9f848aa20dc3829b23079d595ed719f55eec932a6805acf4909be88c88dd4d66::pools::SwapEventV2";
const APTOS_SWAP_EVENT_V3 =
  "0x759ead4f35266aff94d74d68d7c063e605742a496095c997e1cc9b07f7dd5f37::pools::SwapEvent";
const APTOS_USDC =
  "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b";

const VOLUME_THRESHOLD = 100_000_000;
const EVM_SWAP_EVENT =
  "event Swap(bytes32 indexed pairId, address indexed trader, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 timestampDiff)";

const EVM_START = "2026-07-14";
const EARLY_EVM_START = "2026-07-07";
const XLAYER_USDT0 = "0x779Ded0c9e1022225f8E0630b35a9b54bE713736";

const evmConfig: Record<string, { contract: string; quoteToken: string }> = {
  [CHAIN.OPTIMISM]: {
    contract: "0x60a8fA0eB9eDBF97a7487f7163C793768385Adc4",
    quoteToken: ADDRESSES.optimism.USDC_CIRCLE,
  },
  [CHAIN.INK]: {
    contract: "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    quoteToken: ADDRESSES.ink.USDC,
  },
  [CHAIN.BASE]: {
    contract: "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    quoteToken: ADDRESSES.base.USDC,
  },
  [CHAIN.LINEA]: {
    contract: "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    quoteToken: ADDRESSES.linea.USDC,
  },
  [CHAIN.ETHEREUM]: {
    contract: "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    quoteToken: ADDRESSES.ethereum.USDC,
  },
  [CHAIN.XLAYER]: {
    contract: "0x154586B2479b9a11e3d4db90024Dc0e26F097312",
    quoteToken: XLAYER_USDT0,
  },
};

const fetchAptos = async (options: FetchOptions) => {
  const query = `
    WITH raw AS (
      SELECT
        block_time,
        json_parse(data) AS event_json
      FROM aptos.events
      WHERE event_type IN ('${APTOS_SWAP_EVENT_V2}', '${APTOS_SWAP_EVENT_V3}')
        AND TIME_RANGE
    ),
    swaps AS (
      SELECT
        block_time,
        TRY_CAST(json_extract_scalar(event_json, '$.amount_in') AS DECIMAL(38,0)) AS amount_in,
        TRY_CAST(json_extract_scalar(event_json, '$.amount_out') AS DECIMAL(38,0)) AS amount_out,
        json_extract_scalar(event_json, '$.token_in.inner') AS token_in,
        json_extract_scalar(event_json, '$.token_out.inner') AS token_out
      FROM raw
    )
    SELECT
      COALESCE(SUM(
        CASE
          WHEN token_in = '${APTOS_USDC}' THEN amount_in / DECIMAL '1000000'
          WHEN token_out = '${APTOS_USDC}' THEN amount_out / DECIMAL '1000000'
        END
      ), 0) AS daily_volume
    FROM swaps
  `
  const data = await queryDuneSql(options, query)

  const dailyVolume = data[0]?.daily_volume ?? 0;

  if (dailyVolume > VOLUME_THRESHOLD) {
    throw new Error('Daily volume is inflated');
  }

  return {
    dailyVolume,
  }
}

const fetchEvm = async (options: FetchOptions) => {
  const config = evmConfig[options.chain];
  const dailyVolume = options.createBalances();
  const quoteToken = config.quoteToken.toLowerCase();

  const logs = await options.getLogs({
    target: config.contract,
    eventAbi: EVM_SWAP_EVENT,
  });

  logs.forEach((log: any) => {
    if (log.tokenIn.toLowerCase() === quoteToken) {
      dailyVolume.add(config.quoteToken, log.amountIn);
    } else if (log.tokenOut.toLowerCase() === quoteToken) {
      dailyVolume.add(config.quoteToken, log.amountOut);
    }
  });

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Daily volume is calculated from Kaliber Prop AMM swaps. EVM chains use the configured quote-token side of Swap events; Aptos uses Dune to aggregate USDC amounts from Kaliber swap events.",
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  adapter: {
    [CHAIN.APTOS]: {
      fetch: fetchAptos,
      start: "2026-03-02",
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchEvm,
      start: EVM_START,
    },
    [CHAIN.INK]: {
      fetch: fetchEvm,
      start: EVM_START,
    },
    [CHAIN.BASE]: {
      fetch: fetchEvm,
      start: EVM_START,
    },
    [CHAIN.LINEA]: {
      fetch: fetchEvm,
      start: EARLY_EVM_START,
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchEvm,
      start: EVM_START,
    },
    [CHAIN.XLAYER]: {
      fetch: fetchEvm,
      start: EARLY_EVM_START,
    },
  },
}

export default adapter;