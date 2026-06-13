import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const configs: any = {
  [CHAIN.BASE]: {
    start: '2026-01-20',
    SHINY_ORDERS: '0x2F84B71ad6cC656C35316E728290eeb75cbAeD0F',
    PAYMENT_ROUTER: '0x2F84B71ad6cC656C35316E728290eeb75cbAeD0F',
    NFT: '0x911Dbdd9841B53eE5a08170109DAf7Ad82684108',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  [CHAIN.ABSTRACT]: {
    start: '2026-01-20',
    SHINY_ORDERS: '0x5c9CE8Be7Aa92fD089bE31B154be47a0e59d4282',
    PAYMENT_ROUTER: '0xBb8c7575F798a82eF02B428aB4693dFfe258E266',
    NFT: '0x911Dbdd9841B53eE5a08170109DAf7Ad82684108',
    USDC: '0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1',
  },
}

const PAYMENT_RECEIVED_V2 =
  "event PaymentReceived(uint256 indexed orderId, address indexed from, uint256 amount, uint256 timestamp, uint64 round)";
const PAYMENT_RECEIVED_V1 =
  "event PaymentReceived(uint256 indexed orderId, address indexed from, uint256 amount, uint256 timestamp)";
const TOKEN_SOLD_BACK =
  "event TokenSoldBack(uint256 indexed tokenId, address indexed seller, uint256 usdcAmount, string uuid)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Pack purchases via current contract
  const paymentsV2 = await options.getLogs({
    target: configs[options.chain].SHINY_ORDERS,
    eventAbi: PAYMENT_RECEIVED_V2,
  });

  // Pack purchases via legacy contract (still has historical volume)
  const paymentsV1 = await options.getLogs({
    target: configs[options.chain].PAYMENT_ROUTER,
    eventAbi: PAYMENT_RECEIVED_V1,
  });

  // Sellbacks (NFT burned, USDC returned to user)
  const sellbacks = await options.getLogs({
    target: configs[options.chain].NFT,
    eventAbi: TOKEN_SOLD_BACK,
  });

  let totalSpend = 0n;
  let totalSellback = 0n;

  paymentsV2.forEach((log: any) => {
    totalSpend += BigInt(log.amount.toString());
  });
  paymentsV1.forEach((log: any) => {
    totalSpend += BigInt(log.amount.toString());
  });
  sellbacks.forEach((log: any) => {
    totalSellback += BigInt(log.usdcAmount.toString());
  });

  // Volume = pack purchases (across both contracts) + sellback payouts
  dailyVolume.add(configs[options.chain].USDC, totalSpend + totalSellback);

  // Revenue = pack spend net of sellback payouts (what the protocol keeps)
  const net = totalSpend > totalSellback ? totalSpend - totalSellback : 0n;
  dailyRevenue.add(configs[options.chain].USDC, net);

  return {
    dailyVolume,
    dailyFees: dailyRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume:
    "Total USDC moved through the protocol: gacha pack purchases (PaymentReceived events on ShinyOrders and the legacy PaymentRouter) plus sellback payouts (TokenSoldBack events on the NFT contract).",
  Fees: "Net protocol revenue: gross pack spend minus sellback payouts.",
  Revenue: "Net protocol revenue: gross pack spend minus sellback payouts.",
  ProtocolRevenue: "Net protocol revenue: gross pack spend minus sellback payouts.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: configs,
  methodology,
  allowNegativeValue: true,
};

export default adapter;
