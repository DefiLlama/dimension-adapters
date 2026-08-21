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
const COMMON_USDG = "0xe343167631d89B6Ffc58B88d6b7fB0228795491D";
const ARBITRUM_USDG = "0x004B506865409877C9fA29bfb1ebA929984B9bbC";
const XLAYER_USDG = "0x4ae46a509F6b1D9056937BA4500cb143933D2dc8";

const evmConfig: Record<string, { contracts: string[]; quoteTokens: string[] }> = {
  [CHAIN.ARBITRUM]: {
    contracts: [
      "0x154586B2479b9a11e3d4db90024Dc0e26F097312",
      "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    ],
    quoteTokens: [ADDRESSES.arbitrum.USDC_CIRCLE, ADDRESSES.arbitrum.USDT, ARBITRUM_USDG],
  },
  [CHAIN.AVAX]: {
    contracts: [
      "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
      "0x60a8fA0eB9eDBF97a7487f7163C793768385Adc4",
    ],
    quoteTokens: [ADDRESSES.avax.USDC, ADDRESSES.avax.USDt],
  },
  [CHAIN.BASE]: {
    contracts: [
      "0x5eBcee186821704aEAC480D51B539bA4eDE1fDF9",
      "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    ],
    quoteTokens: [ADDRESSES.base.USDC, ADDRESSES.base.USDT],
  },
  [CHAIN.BSC]: {
    contracts: [
      "0x97df7683443d215fe000e22258381d35ac2c55d1",
      "0x74dec7df10f026884c757445671b9e5137ce36e5",
    ],
    quoteTokens: [ADDRESSES.bsc.USDC, ADDRESSES.bsc.USDT],
  },
  [CHAIN.ETHEREUM]: {
    contracts: [
      "0x15b033daf461ad3e138601775e1d5cdad0e8c653",
      "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    ],
    quoteTokens: [ADDRESSES.ethereum.USDC, ADDRESSES.ethereum.USDT, COMMON_USDG],
  },
  [CHAIN.INK]: {
    contracts: ["0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63"],
    quoteTokens: [ADDRESSES.ink.USDC, ADDRESSES.ink.USDT0, COMMON_USDG],
  },
  [CHAIN.LINEA]: {
    contracts: ["0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63"],
    quoteTokens: [ADDRESSES.linea.USDC, ADDRESSES.linea.USDT],
  },
  [CHAIN.OPTIMISM]: {
    contracts: [
      "0x6431e61d4E745B031CF87b2C1DeCeb4A87557F20",
      "0x60a8fA0eB9eDBF97a7487f7163C793768385Adc4",
    ],
    quoteTokens: [ADDRESSES.optimism.USDC_CIRCLE, ADDRESSES.optimism.USDT],
  },
  [CHAIN.ROBINHOOD]: {
    contracts: [
      "0x49ccB1b4DCDE25Ff127d53C615168E4Ff471aFbe",
      "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    ],
    quoteTokens: [ADDRESSES.robinhood.USDG],
  },
  [CHAIN.XLAYER]: {
    contracts: [
      "0x3Cd6F2F61E8B03a8bCBfcf0D69b23CBA37183259",
      "0x154586b2479b9a11e3d4db90024dc0e26f097312",
    ],
    quoteTokens: [ADDRESSES.xlayer.USDC, ADDRESSES.xlayer.USDT, XLAYER_USDT0, XLAYER_USDG],
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
  const quoteTokenLookup = new Map(config.quoteTokens.map(token => [token.toLowerCase(), token]));

  const logs = await options.getLogs({
    targets: config.contracts,
    eventAbi: EVM_SWAP_EVENT,
  });

  logs.forEach((log: any) => {
    const tokenIn = quoteTokenLookup.get(log.tokenIn?.toLowerCase());
    if (tokenIn) return dailyVolume.add(tokenIn, log.amountIn);

    const tokenOut = quoteTokenLookup.get(log.tokenOut?.toLowerCase());
    if (tokenOut) dailyVolume.add(tokenOut, log.amountOut);
  });

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Daily volume is calculated from Kaliber Prop AMM swaps. EVM chains read Swap events from configured contracts and count the configured quote-token side (USDC, USDT/USDT0, USDG when available); Aptos uses Dune to aggregate USDC amounts from Kaliber swap events.",
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
    [CHAIN.ARBITRUM]: {
      fetch: fetchEvm,
      start: EVM_START,
    },
    [CHAIN.AVAX]: {
      fetch: fetchEvm,
      start: EVM_START,
    },
    [CHAIN.BSC]: {
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
    [CHAIN.ROBINHOOD]: {
      fetch: fetchEvm,
      start: EVM_START,
    },
  },
}

export default adapter;