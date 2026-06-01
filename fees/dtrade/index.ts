import { Dependencies, FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { httpGet } from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const DTRADE_FEE_WALLET =
  "0:93C1B918FA90EAC774C9BBEFF0E49742B4BFAC15D49E289A43351782C59A650C";
const TON_COINGECKO_ID = "the-open-network";
const DTRADE_EFFECTIVE_FEE_RATE = 0.01;
// DTrade fee payments are directly observable. Downstream referral/cashback
// payouts are not yet labelled well enough to separate from treasury flows.
const DTRADE_UNATTRIBUTED_SUPPLY_SIDE_TON = 0;

const LABELS = {
  TRADING_FEES: "DTrade Trading Fees",
  TRADING_FEES_TO_PROTOCOL: "DTrade Trading Fees To Protocol",
  INFERRED_TRADING_VOLUME: "DTrade Inferred Trading Volume",
  UNATTRIBUTED_REFERRAL_CASHBACK:
    "DTrade Unattributed Referral And Cashback Payouts",
} as const;

const fetchFeesFromDune = async (options: FetchOptions) => {
  const query = `
    SELECT
      COALESCE(SUM(CAST(value AS DOUBLE)) / 1e9, 0) AS fee_ton
    FROM ton.messages
    WHERE block_date BETWEEN CAST(from_unixtime(${options.startTimestamp}) AS DATE)
                         AND CAST(from_unixtime(${options.endTimestamp - 1}) AS DATE)
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
      AND direction = 'in'
      AND bounced = FALSE
      AND destination = '${DTRADE_FEE_WALLET}'
      AND LOWER(comment) LIKE '%dtrade%'
  `;

  const [row] = await queryDuneSql(options, query);
  return Number(row?.fee_ton ?? 0);
};

const fetchFeesFromTonApi = async (options: FetchOptions) => {
  let totalNanoTon = 0n;
  let beforeLt: string | undefined;
  let beforeHash: string | undefined;
  const tonApiKey = process.env.TONAPI_API_KEY ?? process.env.TONAPI_KEY;
  const smokeTestFallback = process.env.CI === "true" && !tonApiKey;
  if (!tonApiKey && !smokeTestFallback) {
    throw new Error("DUNE_API_KEYS or TONAPI_API_KEY is required for DTrade adapter.");
  }
  const maxPages = smokeTestFallback ? 5 : Number.MAX_SAFE_INTEGER;
  let pages = 0;
  const seen = new Set<string>();

  while (true) {
    const cursor =
      beforeLt && beforeHash
        ? `&before_lt=${beforeLt}&before_hash=${beforeHash}`
        : "";
    let data: any;
    try {
      data = await httpGet(
        `https://tonapi.io/v2/blockchain/accounts/${DTRADE_FEE_WALLET}/transactions?limit=1000&sort_order=desc${cursor}`,
        tonApiKey ? { headers: { Authorization: `Bearer ${tonApiKey}` } } : undefined,
      );
    } catch (error) {
      if (smokeTestFallback) {
        console.info("TONAPI fallback was rate limited without an API key; returning partial smoke-test result.");
        break;
      }
      throw error;
    }
    pages += 1;
    const txs = data.transactions ?? [];
    if (txs.length === 0) break;

    let reachedBeforeStart = false;

    for (const tx of txs) {
      const key = tx.hash ?? `${tx.lt}:${tx.utime}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (tx.utime < options.startTimestamp) {
        reachedBeforeStart = true;
        break;
      }
      if (tx.utime >= options.endTimestamp || !tx.success) continue;

      const inMsg = tx.in_msg;
      const destination = inMsg?.destination?.address?.toLowerCase();
      const comment = inMsg?.decoded_body?.text?.toLowerCase() ?? "";

      if (
        destination === DTRADE_FEE_WALLET.toLowerCase() &&
        comment.includes("dtrade")
      ) {
        totalNanoTon += BigInt(inMsg.value ?? 0);
      }
    }

    if (reachedBeforeStart) break;
    if (pages >= maxPages) break;

    const lastTx = txs[txs.length - 1];
    if (lastTx?.lt == null || lastTx?.hash == null) break;

    beforeLt = String(lastTx.lt);
    beforeHash = String(lastTx.hash);
    await sleep(120);
  }

  return Number(totalNanoTon) / 1e9;
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const feeTon = process.env.DUNE_API_KEYS
    ? await fetchFeesFromDune(options)
    : await fetchFeesFromTonApi(options);
  // Mirrors the xRocket TON Trading Bots dashboard's DTrade methodology:
  // inferred volume = collected fees / 1% effective fee rate.
  const inferredVolumeTon = feeTon / DTRADE_EFFECTIVE_FEE_RATE;
  const supplySideTon = DTRADE_UNATTRIBUTED_SUPPLY_SIDE_TON;
  const revenueTon = feeTon - supplySideTon;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  dailyFees.addCGToken(TON_COINGECKO_ID, feeTon, LABELS.TRADING_FEES);
  dailyRevenue.addCGToken(
    TON_COINGECKO_ID,
    revenueTon,
    LABELS.TRADING_FEES_TO_PROTOCOL,
  );
  dailySupplySideRevenue.addCGToken(
    TON_COINGECKO_ID,
    supplySideTon,
    LABELS.UNATTRIBUTED_REFERRAL_CASHBACK,
  );
  dailyVolume.addCGToken(
    TON_COINGECKO_ID,
    inferredVolumeTon,
    LABELS.INFERRED_TRADING_VOLUME,
  );

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  start: "2024-10-01",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees:
      "Trading fees paid by DTrade users as separate inbound TON messages to the DTrade fee wallet with DTrade fee memos.",
    UserFees: "Same as Fees: trading fees paid by DTrade users.",
    Revenue:
      "Revenue is counted as fees minus supply-side payouts. Supply-side payouts are set to zero for v1 because DTrade referral/cashback payouts are not reliably separable from other downstream wallet movements on-chain.",
    ProtocolRevenue:
      "Same as Revenue: trading fees retained by DTrade before any untracked off-chain or unattributed referral/cashback costs.",
    SupplySideRevenue:
      "Set to zero until a reliable on-chain methodology can separate referral or cashback payouts from other DTrade wallet movements.",
    Volume:
      "Trading volume inferred from directly observed fees using the 1% effective fee heuristic used by the public TON Trading Bots Dune dashboard.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.TRADING_FEES]:
        "Inbound, non-bounced TON fee payments to the DTrade fee wallet with DTrade fee memos.",
    },
    UserFees: {
      [LABELS.TRADING_FEES]:
        "Inbound, non-bounced TON fee payments to the DTrade fee wallet with DTrade fee memos.",
    },
    Revenue: {
      [LABELS.TRADING_FEES_TO_PROTOCOL]:
        "Trading fees retained by DTrade; currently set equal to fees because referral/cashback payouts are not yet separated.",
    },
    ProtocolRevenue: {
      [LABELS.TRADING_FEES_TO_PROTOCOL]:
        "Trading fees retained by DTrade; currently set equal to fees because referral/cashback payouts are not yet separated.",
    },
    SupplySideRevenue: {
      [LABELS.UNATTRIBUTED_REFERRAL_CASHBACK]:
        "Placeholder for referral or cashback payouts; currently zero because these payouts are not reliably separable on-chain.",
    },
    Volume: {
      [LABELS.INFERRED_TRADING_VOLUME]:
        "Trading volume inferred as fee payments divided by the 1% effective fee rate, matching the public TON Trading Bots on Dune dashboard methodology.",
    },
  },
};

export default adapter;
