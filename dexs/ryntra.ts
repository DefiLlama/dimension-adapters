import { zeroPadValue } from "ethers";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { assertDuneSolanaIndexed } from "../helpers/duneSolanaDex";
import { METRIC } from "../helpers/metrics";
import { CONFIGS_CREATED, LAUNCH_CONFIGS, LAUNCH_POOL_PAYER } from "./ryntra-launch";

// Ryntra (https://ryntra.io) is a trading app: people swap and trade spot, memes and tokenized stocks through it, and
// it charges its own fee inside the trade's transaction. A trade is Ryntra's when it paid that fee. Every address
// below is in Ryntra's public attribution registry (Solana: https://ryntra.io/api/stats/registry, drawn on
// https://ryntra.io/stats; Arc: https://arc.ryntra.io/api/arc-registry). Every trade is routed through a venue that
// already lists it (Jupiter and the pools it crosses on Solana; Circle's swap service and KyberSwap on Arc), so the
// volume is double counted. Tokens launched with Ryntra are the Ryntra Launch listing (dexs/ryntra-launch.ts).

const JUPITER_REFERRAL = "F9pV233uBksW4U1BKiK7u9qShgXkwoR6F8MzU4FZYPUv";
const FEE_WALLET = "5sWCoxARMPyGdqTu9ru6z69REZ1ZZLojcb1rfABDP2Ne";
const FEE_ACCOUNTS = [
  { account: "A3QWi67fFpQ2PrGXghjLMQdWAkHeN43NbFp9FxpCeorY", mint: ADDRESSES.solana.SOL, recipient: "jupiter-referral" },
  { account: "55p9Zk8tzq6YhnPgopW5X1sX5kHX1v1zuRiQNwqa5hYH", mint: ADDRESSES.solana.USDC, recipient: "jupiter-referral" },
  { account: "4kbERimV3PwxwiL72n1NBRpX5HG2Mwja1QNhb4yEp578", mint: ADDRESSES.solana.SOL, recipient: "fee-wallet" },
  { account: "GfZQv5L2fAmqNgMsUv97ecV3MUF8GYs7rE7K4ySJDhod", mint: ADDRESSES.solana.USDC, recipient: "fee-wallet" },
  { account: "3QzAhYsiAXEWB64FHwmms63sZcbBKtC1hkPENFMAjMbA", mint: ADDRESSES.solana.USDT, recipient: "fee-wallet" },
];
const ROUTERS = ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", "DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH"];

const quoted = (values: string[]) => values.map((value) => `'${value}'`).join(", ");

const query = ({ startTimestamp, endTimestamp }: FetchOptions) => {
  const window = (column: string) => `${column} >= from_unixtime(${startTimestamp}) AND ${column} < from_unixtime(${endTimestamp})`;
  return `
    WITH
    fee_accounts (token_account, mint, recipient) AS (
      VALUES ${FEE_ACCOUNTS.map(({ account, mint, recipient }) => `('${account}', '${mint}', '${recipient}')`).join(", ")}
    ),
    -- The fee, paid into those accounts by a swap router inside the trade. A plain transfer into them (a deposit,
    -- account rent) and Ryntra's own transactions are not fees.
    fees AS (
      SELECT t.tx_id, t.tx_signer AS trader, a.recipient, t.token_mint_address AS mint, CAST(t.amount AS DECIMAL(38, 0)) AS amount
      FROM tokens_solana.transfers t
      JOIN fee_accounts a ON a.token_account = t.to_token_account AND a.mint = t.token_mint_address
      WHERE ${window("t.block_time")}
        AND t.action = 'transfer'
        AND t.outer_executing_account IN (${quoted(ROUTERS)})
        AND t.tx_signer NOT IN (${quoted([JUPITER_REFERRAL, FEE_WALLET])})
    ),
    -- Trades that crossed the bonding curve of a token launched with Ryntra Launch are that listing's volume. A trade
    -- in a graduated pool stays here: Ryntra Launch counts curve volume only.
    launch_trades AS (
      SELECT DISTINCT s.evt_tx_id AS tx_id
      FROM meteora_solana.dynamic_bonding_curve_evt_evtswap2 s
      JOIN meteora_solana.dynamic_bonding_curve_evt_evtinitializepool p ON p.pool = s.pool
      WHERE ${window("s.evt_block_time")}
        AND p.config IN (${quoted(LAUNCH_CONFIGS)})
        AND p.evt_tx_signer = '${LAUNCH_POOL_PAYER}'
        AND p.evt_block_time >= TIMESTAMP '${CONFIGS_CREATED}'
    ),
    trades AS (
      SELECT DISTINCT tx_id, trader FROM fees WHERE tx_id NOT IN (SELECT tx_id FROM launch_trades)
    ),
    -- The trader's own token movements in each trade, per mint (SPL tokens; SOL counts as the wSOL it is swapped as).
    legs AS (
      SELECT t.tx_id, t.token_mint_address AS mint,
        SUM(CASE WHEN t.to_owner = x.trader THEN CAST(t.amount AS DECIMAL(38, 0)) ELSE 0 END)
          - SUM(CASE WHEN t.from_owner = x.trader THEN CAST(t.amount AS DECIMAL(38, 0)) ELSE 0 END) AS net
      FROM tokens_solana.transfers t
      JOIN trades x ON x.tx_id = t.tx_id
      WHERE ${window("t.block_time")}
        AND t.action = 'transfer'
        AND t.token_version <> 'native'
        AND (t.to_owner = x.trader OR t.from_owner = x.trader)
      GROUP BY 1, 2
    ),
    -- One side of each trade, in a token that can be priced: the stablecoin paid, else received; else SOL; else the
    -- token paid.
    sides AS (
      SELECT mint, ABS(net) AS amount,
        ROW_NUMBER() OVER (
          PARTITION BY tx_id
          ORDER BY
            CASE WHEN mint IN (${quoted([ADDRESSES.solana.USDC, ADDRESSES.solana.USDT])}) THEN 0 WHEN mint = '${ADDRESSES.solana.SOL}' THEN 1 ELSE 2 END,
            CASE WHEN net < 0 THEN 0 ELSE 1 END
        ) AS pick
      FROM legs
      WHERE net <> 0
    )
    SELECT 'fees' AS metric, recipient, mint, CAST(SUM(amount) AS VARCHAR) AS amount FROM fees GROUP BY 2, 3
    UNION ALL
    SELECT 'volume', NULL, mint, CAST(SUM(amount) AS VARCHAR) FROM sides WHERE pick = 1 GROUP BY 3
  `;
};

const LABELS = {
  TO_RYNTRA: "Trading Fees To Ryntra",
  TO_JUPITER: "Trading Fees To Jupiter",
  TO_CIRCLE: "Trading Fees To Circle",
};

// Jupiter takes 20% of an integrator's referral fee when it is claimed
// (https://developers.jup.ag/docs/swap/order-and-execute#how-it-works); nothing of what Jupiter /build pays the fee
// wallet (https://developers.jup.ag/docs/swap/build/index#fees).
const JUPITER_SHARE_PERCENT = 20n;

const fetchSolana = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);
  const rows: { metric: string; recipient: string; mint: string; amount: string }[] = await queryDuneSql(options, query(options));

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  for (const row of rows) {
    if (row.metric === "volume") {
      dailyVolume.add(row.mint, row.amount);
      continue;
    }
    const amount = BigInt(row.amount);
    const jupiter = row.recipient === "jupiter-referral" ? (amount * JUPITER_SHARE_PERCENT) / 100n : 0n;
    dailyFees.add(row.mint, amount, METRIC.TRADING_FEES);
    dailyRevenue.add(row.mint, amount - jupiter, LABELS.TO_RYNTRA);
    if (jupiter > 0n) dailySupplySideRevenue.add(row.mint, jupiter, LABELS.TO_JUPITER);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

// Arc: Ryntra's swap fee lands on one address used for nothing else, inside the swap's own transaction, through one
// of two routes. Circle's swap service (App Kit) pays it as the developer fee of the swap: Circle's fee collector
// moves it and logs one event naming the token, the recipient and Circle's 10% share of it. KyberSwap's router pays
// it as the swap's fee and logs it in its Fee event, next to the Swapped event of the same swap. A swap is Ryntra's
// when one of these two events names the address; a plain transfer to it is not a fee. Only these events are read,
// never USDC Transfer logs: on Arc every USDC movement logs twice (the native 18-decimal system event and the
// 6-decimal ERC-20 one). Swaps priced off chain by Relay pay Ryntra's fee to Relay's off-chain balance and are not
// counted here.
const ARC_FEE_RECIPIENT = "0x4480dcf81d177a4295b4ff32393ebeda35bb02e2";
const ARC_NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ARC_USDC_SYSTEM = "0xfffffffffffffffffffffffffffffffffffffffe"; // logs native USDC movements, 18 decimals
const ARC_CORE = [ADDRESSES.arc.USDC, ADDRESSES.arc.EURC, ADDRESSES.arc.WETH, ADDRESSES.arc.cirBTC].map((a) => a.toLowerCase());
const CIRCLE_ADAPTER = "0x7fb8c7260b63934d8da38af902f87ae6e284a845";
const CIRCLE_FEE_COLLECTOR = "0xf992efcb5fa2ed7cb48310d9dd8cb4ce5fb7ddc9";
// topics [this, token, recipient, Circle's recipient]; data (bytes32 tag, uint256 toRecipient, uint256 toCircle)
const CIRCLE_FEE_TOPIC = "0x4f38c48982671f45b4ff27338f085a7489ee53fd3f5cd1f33950c171bed75802";
const CIRCLE_DEVELOPER_FEE_TAG = "0x535741505f444600000000000000000000000000000000000000000000000000"; // "SWAP_DF"
const KYBER_ROUTER = "0x6131b5fae19ea4f9d964eac0408e4408b66337b5"; // MetaAggregationRouterV2
const KYBER_FEE_EVENT = "event Fee(address token, uint256 totalAmount, uint256 totalFee, address[] recipients, uint256[] amounts, bool isBps)";
const KYBER_SWAPPED_EVENT = "event Swapped(address sender, address srcToken, address dstToken, address dstReceiver, uint256 spentAmount, uint256 returnAmount)";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// A token as DefiLlama prices it on Arc: native USDC (18 decimals) as the USDC interface (6 decimals).
const arcAmount = (token: string, amount: bigint): [string, bigint] =>
  token.toLowerCase() === ARC_NATIVE ? [ADDRESSES.arc.USDC, amount / 10n ** 12n] : [token, amount];

const fetchArc = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // KyberSwap: the fee leg paid to Ryntra, and the swap's priceable side (a core asset if either side is one).
  const kyberFees: any[] = await options.getLogs({ target: KYBER_ROUTER, eventAbi: KYBER_FEE_EVENT, entireLog: true });
  const kyberTxs = new Set<string>();
  for (const log of kyberFees) {
    const { token, totalAmount, recipients, amounts, isBps } = log.args;
    recipients.forEach((recipient: string, i: number) => {
      if (recipient.toLowerCase() !== ARC_FEE_RECIPIENT) return;
      const fee = isBps ? (BigInt(totalAmount) * BigInt(amounts[i])) / 10_000n : BigInt(amounts[i]);
      const [asset, amount] = arcAmount(String(token), fee);
      dailyFees.add(asset, amount, METRIC.TRADING_FEES);
      dailyRevenue.add(asset, amount, LABELS.TO_RYNTRA);
      kyberTxs.add(String(log.transactionHash).toLowerCase());
    });
  }
  if (kyberTxs.size) {
    const swaps: any[] = await options.getLogs({ target: KYBER_ROUTER, eventAbi: KYBER_SWAPPED_EVENT, entireLog: true });
    for (const log of swaps) {
      if (!kyberTxs.has(String(log.transactionHash).toLowerCase())) continue;
      const { srcToken, dstToken, spentAmount, returnAmount } = log.args;
      const useDst = !ARC_CORE.includes(String(srcToken).toLowerCase()) && String(srcToken).toLowerCase() !== ARC_NATIVE
        && (ARC_CORE.includes(String(dstToken).toLowerCase()) || String(dstToken).toLowerCase() === ARC_NATIVE);
      const [asset, amount] = useDst ? arcAmount(String(dstToken), BigInt(returnAmount)) : arcAmount(String(srcToken), BigInt(spentAmount));
      dailyVolume.add(asset, amount);
    }
  }

  // Circle: the developer fee naming Ryntra (Circle keeps 10% of it), and the input the trader sent the Adapter.
  const circleFees: any[] = await options.getLogs({
    target: CIRCLE_FEE_COLLECTOR,
    topics: [CIRCLE_FEE_TOPIC, null as any, zeroPadValue(ARC_FEE_RECIPIENT, 32)],
    entireLog: true,
  });
  const circleTxs = new Map<string, string>(); // tx -> fee token (the swap's input)
  for (const log of circleFees) {
    const data = String(log.data).slice(2);
    if ("0x" + data.slice(0, 64) !== CIRCLE_DEVELOPER_FEE_TAG) continue;
    const token = ("0x" + String(log.topics[1]).slice(26)).toLowerCase();
    const [asset, toRyntra] = arcAmount(token, BigInt("0x" + data.slice(64, 128)));
    const [, toCircle] = arcAmount(token, BigInt("0x" + data.slice(128, 192)));
    dailyFees.add(asset, toRyntra + toCircle, METRIC.TRADING_FEES);
    dailyRevenue.add(asset, toRyntra, LABELS.TO_RYNTRA);
    if (toCircle > 0n) dailySupplySideRevenue.add(asset, toCircle, LABELS.TO_CIRCLE);
    circleTxs.set(String(log.transactionHash).toLowerCase(), asset.toLowerCase());
  }
  for (const token of new Set(circleTxs.values())) {
    // USDC's input is read from the native system event alone, so an ERC-20 USDC transfer is not counted twice.
    const isUsdc = token === ADDRESSES.arc.USDC.toLowerCase();
    const inputs: any[] = await options.getLogs({
      target: isUsdc ? ARC_USDC_SYSTEM : token,
      topics: [TRANSFER_TOPIC, null as any, zeroPadValue(CIRCLE_ADAPTER, 32)],
      entireLog: true,
    });
    for (const log of inputs) {
      if (circleTxs.get(String(log.transactionHash).toLowerCase()) !== token) continue;
      const amount = BigInt(log.data);
      dailyVolume.add(token, isUsdc ? amount / 10n ** 12n : amount);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "One side of every trade made through Ryntra. On Solana, from the trader's own token movements in the trade: the stablecoin they paid or received, else the SOL, else the token they paid. On Arc, from the swap's own events: the side in USDC, EURC, WETH or cirBTC of a KyberSwap swap, and the input a trader sent Circle's swap Adapter. A trade is Ryntra's when it paid Ryntra's fee inside it. Trades on the bonding curve of a token launched with Ryntra are counted under Ryntra Launch. Double counted: the venues the trades are routed through already list this volume.",
  Fees: "Fees people pay Ryntra on trades made through it. On Solana: what the swap router (Jupiter, or DFlow when Jupiter routes through it) pays into Ryntra's fee wallet and its Jupiter referral account inside the trade. On Arc: the developer fee of a Circle swap and the fee leg of a KyberSwap swap that name Ryntra's fee address, read from Circle's fee collector and KyberSwap's router events. Plain transfers into these accounts are not fees.",
  UserFees: "Fees traders pay Ryntra inside the trades they make through it.",
  Revenue: "Trading fees kept by Ryntra: the whole fee paid into its fee wallet on Solana and from KyberSwap on Arc, what reached its Jupiter referral account less Jupiter's 20% share, and the Circle developer fee less Circle's 10% share. Cashback and invite rewards are paid later, when people claim them, and are not deducted.",
  ProtocolRevenue: "Trading fees kept by Ryntra, all of it for the protocol: Ryntra has no token and distributes nothing to holders.",
  SupplySideRevenue: "Jupiter's 20% share of the fees that reached Ryntra's Jupiter referral account, and Circle's 10% share of the developer fee on Arc.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Ryntra's fee on swaps and spot trades, paid into its fee wallet or its Jupiter referral account on Solana, or to its fee address on Arc, inside the trade.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Ryntra's fee on swaps and spot trades, paid by the trader inside the trade.",
  },
  Revenue: {
    [LABELS.TO_RYNTRA]: "The whole fee paid into the fee wallet and from KyberSwap, 80% of what reached the Jupiter referral account, and 90% of the Circle developer fee.",
  },
  ProtocolRevenue: {
    [LABELS.TO_RYNTRA]: "The whole fee paid into the fee wallet and from KyberSwap, 80% of what reached the Jupiter referral account, and 90% of the Circle developer fee.",
  },
  SupplySideRevenue: {
    [LABELS.TO_JUPITER]: "Jupiter's 20% share of the fees that reached Ryntra's Jupiter referral account.",
    [LABELS.TO_CIRCLE]: "Circle's 10% share of the developer fee its swap service pays Ryntra on Arc.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-09-10" },
    [CHAIN.ARC]: { fetch: fetchArc, start: "2026-10-08" },
  },
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
