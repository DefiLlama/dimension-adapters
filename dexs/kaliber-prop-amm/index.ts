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

const evmConfig: Record<string, { contract: string; pairId: string; quoteToken: string }> = {
  [CHAIN.OPTIMISM]: {
    contract: "0x60a8fA0eB9eDBF97a7487f7163C793768385Adc4",
    pairId: "0x660f2184f8c377402dbebe7852461071959e588b1021bb453433a14deb138b98",
    quoteToken: ADDRESSES.optimism.USDC_CIRCLE,
  },
  [CHAIN.INK]: {
    contract: "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    pairId: "0x6ee444c16eec064b95d512a539ae8eec901aacf781d43360d6d7c9e703ea6db9",
    quoteToken: ADDRESSES.ink.USDC,
  },
  [CHAIN.BASE]: {
    contract: "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    pairId: "0xf4f8ea3842a086279eb37b8946ea63e9704caf38c0cf1c53ffea53d50193f615",
    quoteToken: ADDRESSES.base.USDC,
  },
  [CHAIN.LINEA]: {
    contract: "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    pairId: "0xa9d20043a1973faa460e23c993812ac77e0e5b62987111ea0022e90fe36b120d",
    quoteToken: ADDRESSES.linea.USDC,
  },
  [CHAIN.ETHEREUM]: {
    contract: "0xf639CF213b63F7E77D699FF686d591C0Ba55Fc63",
    pairId: "0x7c85004568584fbf3665f41ebe85146ee0483587d65d9ea5a56c79816bb720d0",
    quoteToken: ADDRESSES.ethereum.USDC,
  },
  [CHAIN.XLAYER]: {
    contract: "0x154586B2479b9a11e3d4db90024Dc0e26F097312",
    pairId: "0x335c400406e84be9c8026ae2b9f8ab07fad4d26bcb8a4c8aede0c9b463618258",
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

  logs
    .filter((log: any) => log.pairId.toLowerCase() === config.pairId)
    .forEach((log: any) => {
      if (log.tokenIn.toLowerCase() === quoteToken) {
        dailyVolume.add(config.quoteToken, log.amountIn);
      } else if (log.tokenOut.toLowerCase() === quoteToken) {
        dailyVolume.add(config.quoteToken, log.amountOut);
      } else {
        throw new Error(`Missing quote token for Kaliber pair ${config.pairId} on ${options.chain}`);
      }
    });

  return { dailyVolume };
};

const methodology = {
  Volume:
    "Daily volume is calculated from Kaliber Prop AMM swaps. EVM chains use the stable side of Swap events filtered to the configured pairId; Aptos uses Dune to aggregate USDC amounts from Kaliber swap events.",
};

const adapter: SimpleAdapter = {
  version: 2,
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
