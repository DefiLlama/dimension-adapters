import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const DTRADE_FEE_WALLET = "0:93C1B918FA90EAC774C9BBEFF0E49742B4BFAC15D49E289A43351782C59A650C";

const toBigInt = (v: any): bigint => {
  if (v === null || v === undefined) return 0n;
  if (typeof v === "string") return BigInt(v);
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return 0n;
};

const getInboundComment = (inMsg: any): string => {
  const decoded = inMsg?.message_content?.decoded;
  if (typeof decoded?.comment === "string") return decoded.comment;
  if (typeof decoded?.text === "string") return decoded.text;
  return "";
};

const fetchFeeInflows = async (start: number, end: number): Promise<bigint> => {
  let feeNanoton = 0n;

  let before_lt: string | undefined;
  let before_hash: string | undefined;
  let offset = 0;
  const seen = new Set<string>();

  while (true) {
    const url =
      `https://toncenter.com/api/v3/transactions?account=${DTRADE_FEE_WALLET}&start_utime=${start}&end_utime=${end}&limit=1000&offset=${offset}&sort=desc` +
      (before_lt && before_hash ? `&before_lt=${before_lt}&before_hash=${before_hash}` : "");

    let data: any;
    try {
      data = await fetchURL(url);
    } catch (e) {
      throw new Error(`DTrade: failed to fetch fee wallet transactions: ${e}`);
    }

    const txs: any[] = data.transactions;
    if (!txs?.length) break;

    for (const tx of txs) {
      const key = tx.hash ?? `${tx.lt}:${tx.now}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (!tx?.description?.action?.success) continue;

      const inMsg = tx.in_msg;
      if (!inMsg || inMsg.destination?.toLowerCase() !== DTRADE_FEE_WALLET.toLowerCase()) continue;
      if (inMsg.bounced) continue;

      const comment = getInboundComment(inMsg).toLowerCase();
      if (!comment.includes("dtrade")) continue;

      feeNanoton += toBigInt(inMsg.value);
    }

    if (txs.length < 1000) break;

    const lastTx = txs[txs.length - 1];
    if (lastTx?.lt == null || lastTx?.hash == null) break;

    before_lt = String(lastTx.lt);
    before_hash = String(lastTx.hash);
    offset += 1000;

    await sleep(1000);
  }

  return feeNanoton;
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { startTimestamp: start, endTimestamp: end } = options;
  const feeNanoton = await fetchFeeInflows(start, end);

  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  dailyFees.addGasToken(feeNanoton, METRIC.TRADING_FEES);
  // Mirrors the xRocket TON Trading Bots dashboard's DTrade methodology:
  // inferred volume = collected fees / 1% effective fee rate.
  dailyVolume.addGasToken(feeNanoton * 100n);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Volume: "Trading volume inferred from directly observed fees using the 1% effective fee heuristic used by the public TON Trading Bots Dune dashboard.",
  Fees: "Trading fees paid by DTrade users as separate inbound TON messages to the DTrade fee wallet with DTrade fee memos. Revenue is not reported because referral payouts are not reliably separable on-chain.",
  UserFees: "Trading fees paid by DTrade users as separate inbound TON messages to the DTrade fee wallet with DTrade fee memos.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by DTrade users as separate inbound TON messages to the DTrade fee wallet with DTrade fee memos.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Trading fees paid by DTrade users as separate inbound TON messages to the DTrade fee wallet with DTrade fee memos.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TON],
  start: "2024-10-01",
  methodology,
  breakdownMethodology,
  skipBreakdownValidation: true,
};

export default adapter;
