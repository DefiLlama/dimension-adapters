import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";
import { isCoreAsset } from "../../helpers/prices";

const chainConfig: Record<string, { start: string; routers: string[]; swapEvent?: string; orderRouters?: string[]; orderRoutersStart?: string }> = {
  [CHAIN.BASE]: {
    start: "2025-07-03",
    // The first router stopped emitting around 2026-07-24; the others are its redeployments.
    routers: [
      "0x282970F452371454332Ca522cE59F318a2C81484",
      "0x8a33650bbBd7622D7bF1b98d4ae851c134126C18",
      "0xf0eBB9bA1c3cd95c315f4F80197b85782E756e49",
      "0x5028b3b07a254cee0767f6ba2e2bd459c5efc64f",
    ],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
    orderRouters: ["0xaae8a5bad1824a87d8132313027478b505da471a"],
  },
  [CHAIN.BSC]: {
    start: "2025-07-03",
    routers: [
      "0xd270845b7EBb0B013DfCCD9cA782a57Bfb7A359A",
      "0xd36b6d646ac6e23672e9eedec558164c7f2d6deb",
      "0x296b00198dc7ec3410e12da814d9267bb8df506a",
      "0x34a61953419751a99fca665dbea6670d532d64ad",
    ],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
    // Limit-order routers, listed in fees/aveai with the same ProxyAdmin and owner: they emit an order-filled event, not Swap.
    orderRouters: [
      "0xeef1138334c4f7f5b058002b81219048e04f7a2c",
      "0xe21c2cf3e3ce95974afbfece42100ecb7e14ad37",
      "0x8cd019facde1b3d4abb48ce84446d68ee1bcf894",
    ],
    // Until 2025-08-21 0xe21c2cf3.. emitted an older layout of the event without amountIn.
    orderRoutersStart: "2025-08-22",
  },
  [CHAIN.ETHEREUM]: {
    start: "2025-07-15",
    routers: [
      "0x60943cb06b76A24431659165c81a03c16F1C325C",
      "0x77edae6a5f332605720688c7fda7476476e8f83f", // older proxy build, same ProxyAdmin and implementation as 0x60943cb0..
      "0xe8b8373f80a534cc30680570163301c37d3aaeb1",
    ],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
    orderRouters: ["0x72cb924a78b9335d547e6896bbcc6b94744927f6"],
  },
  [CHAIN.HYPERLIQUID]: {
    start: "2025-05-31",
    routers: ["0x81DA6BCd98AE46621A1E9743a3F51B10B7e16D97"],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
  },
  [CHAIN.XLAYER]: {
    start: "2026-06-25",
    routers: ["0xc2402c8453f39e97113f094e3402fbbdd7e0ede3"],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
    orderRouters: ["0x78db03b357f4262c591f305f86a16dacff540c2b"],
  },
  [CHAIN.ROBINHOOD]: {
    start: "2026-07-03",
    routers: ["0x81DA6BCd98AE46621A1E9743a3F51B10B7e16D97", "0x31ba053698e5dd483ddc90e671fa99bf699baa14"],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
    orderRouters: ["0x17ba2bb7ade691f2c115f9385383ff617df9dae7"],
  },
  [CHAIN.ARC]: {
    start: "2026-07-25",
    routers: ["0x81DA6BCd98AE46621A1E9743a3F51B10B7e16D97"],
    swapEvent: "event Swap(address trader, address tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 amountOut)",
    orderRouters: ["0x991303c0d4c5e27d161052c75f123e6b466b5628"],
  },
  [CHAIN.SOLANA]: {
    start: "2025-01-17",
    routers: ["AveaiuA1emN71q9mS2QQ9BEWNAAHmp8sHSvwLFHQjufM"],
  },
};

const ORDER_FILLED_TOPIC = "0x01a51532428af9a5568aeedb8ea45eccb10821f0e9033de01cd4126033f5deff";

const fetchEVM = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const { routers, swapEvent, orderRouters, orderRoutersStart } = chainConfig[options.chain];

  const logs = await options.getLogs({
    targets: routers,
    eventAbi: swapEvent,
    flatten: true,
  });

  const isNative = (token: string) => token.toLowerCase() === ADDRESSES.GAS_TOKEN_2;
  const addSide = (token: string, amount: any) => {
    if (isNative(token)) dailyVolume.addGasToken(amount);
    else dailyVolume.add(token, amount);
  };

  const addSwap = (tokenIn: string, amountIn: any, tokenOut: string, amountOut: any) => {
    if (isNative(tokenIn) || isCoreAsset(options.chain, tokenIn)) addSide(tokenIn, amountIn);
    else addSide(tokenOut, amountOut);
  };

  logs.forEach((log) => addSwap(log.tokenIn, log.amountIn, log.tokenOut, log.amountOut));

  if (orderRouters && !(orderRoutersStart && options.startTimestamp < Date.parse(orderRoutersStart) / 1e3)) {
    // The implementations are unverified, so the event is read by topic. Data: (bytes32 id, uint256 amountOut, bytes order),
    // where order starts (address keeper, uint256, offset 0x80, offset, address tokenIn, address tokenOut, uint256 amountIn, ...).
    const fills = await options.getLogs({ targets: orderRouters, topics: [ORDER_FILLED_TOPIC], onlyArgs: false, flatten: true });
    fills.forEach((log: any) => {
      const word = (i: number) => "0x" + log.data.slice(2 + 64 * i, 2 + 64 * (i + 1));
      const amountIn = BigInt(word(10));
      if (Number(word(2)) !== 0x60 || Number(word(6)) !== 0x80 || amountIn >= 2n ** 128n) throw new Error(`aveai: unexpected order-filled layout in ${log.transactionHash}`);
      const address = (i: number) => "0x" + word(i).slice(26);
      addSwap(address(8), amountIn, address(9), BigInt(word(1)));
    });
  }

  return { dailyVolume };
};

const fetchSolana = async (options: FetchOptions): Promise<FetchResult> => {
  const [router] = chainConfig[CHAIN.SOLANA].routers;

  // Use 10 hours delay as dune has indexing delay for dex_solana.trades table
  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const rows = await queryDuneSql(options, `
    WITH bot_trades AS (
      SELECT
        t.tx_id,
        t.trader_id,
        t.amount_usd,
        ROW_NUMBER() OVER (
          PARTITION BY t.tx_id, t.trader_id
          ORDER BY t.amount_usd DESC
        ) AS row_num
      FROM dex_solana.trades t
      WHERE
        TIME_RANGE
        AND EXISTS (
          SELECT 1
          FROM solana.transactions tx
          WHERE
            TIME_RANGE
            AND tx.id = t.tx_id
            AND tx.success = true
            AND CONTAINS(tx.account_keys, '${router}')
        )
    )
    SELECT
      COALESCE(SUM(amount_usd), 0) AS daily_volume
    FROM bot_trades
    WHERE row_num = 1
  `) as { daily_volume?: string | number }[];

  return { dailyVolume: Number(rows[0]?.daily_volume) };
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  if (options.chain === CHAIN.SOLANA) return fetchSolana(options);
  return fetchEVM(options);
};

const methodology = {
  Volume: "Total USD value of the swaps ave.ai routes through underlying DEXs, including filled limit orders, valued on EVM chains by the native-token, stablecoin or major-token side of each swap. Double-counted, since those same swaps are also reported by the DEXs that actually execute them.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  doublecounted: true,
  methodology,
};

export default adapter;
