import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Current payment contracts (ShinyOrders -- emits PaymentReceived with drand round)
const SHINY_ORDERS_BASE = "0x2F84B71ad6cC656C35316E728290eeb75cbAeD0F";
const SHINY_ORDERS_ABSTRACT = "0x5c9CE8Be7Aa92fD089bE31B154be47a0e59d4282";

// Deprecated payment contracts (legacy PaymentRouter -- emits PaymentReceived w/o round)
const PAYMENT_ROUTER_BASE = "0x9dB95986c6AbcF0eb8799EeF1c37E5c3C99f56D6";
const PAYMENT_ROUTER_ABSTRACT = "0xBb8c7575F798a82eF02B428aB4693dFfe258E266";

const NFT_BASE = "0x911Dbdd9841B53eE5a08170109DAf7Ad82684108";
const NFT_ABSTRACT = "0x911Dbdd9841B53eE5a08170109DAf7Ad82684108";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_ABSTRACT = "0x84A71ccD554Cc1b02749b35d22F684CC8ec987e1";

const PAYMENT_RECEIVED_V2 =
  "event PaymentReceived(uint256 indexed orderId, address indexed from, uint256 amount, uint256 timestamp, uint64 round)";
const PAYMENT_RECEIVED_V1 =
  "event PaymentReceived(uint256 indexed orderId, address indexed from, uint256 amount, uint256 timestamp)";
const TOKEN_SOLD_BACK =
  "event TokenSoldBack(uint256 indexed tokenId, address indexed seller, uint256 usdcAmount, string uuid)";

const fetchData = (
  shinyOrders: string,
  paymentRouter: string,
  nft: string,
  usdc: string,
) => {
  return async ({ getLogs, createBalances }: FetchOptions) => {
    const dailyVolume = createBalances();
    const dailyRevenue = createBalances();

    // Pack purchases via current contract
    const paymentsV2 = await getLogs({
      target: shinyOrders,
      eventAbi: PAYMENT_RECEIVED_V2,
    });

    // Pack purchases via legacy contract (still has historical volume)
    const paymentsV1 = await getLogs({
      target: paymentRouter,
      eventAbi: PAYMENT_RECEIVED_V1,
    });

    // Sellbacks (NFT burned, USDC returned to user)
    const sellbacks = await getLogs({
      target: nft,
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
    dailyVolume.add(usdc, totalSpend + totalSellback);

    // Revenue = pack spend net of sellback payouts (what the protocol keeps)
    const net = totalSpend > totalSellback ? totalSpend - totalSellback : 0n;
    dailyRevenue.add(usdc, net);

    return {
      dailyVolume,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
    };
  };
};

const methodology = {
  Volume:
    "Total USDC moved through the protocol: gacha pack purchases (PaymentReceived events on ShinyOrders and the legacy PaymentRouter) plus sellback payouts (TokenSoldBack events on the NFT contract).",
  Revenue:
    "Net protocol revenue: gross pack spend minus sellback payouts.",
  ProtocolRevenue:
    "Net protocol revenue: gross pack spend minus sellback payouts.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchData(SHINY_ORDERS_BASE, PAYMENT_ROUTER_BASE, NFT_BASE, USDC_BASE),
      start: "2026-01-20",
    },
    [CHAIN.ABSTRACT]: {
      fetch: fetchData(SHINY_ORDERS_ABSTRACT, PAYMENT_ROUTER_ABSTRACT, NFT_ABSTRACT, USDC_ABSTRACT),
      start: "2026-01-20",
    },
  },
  methodology,
  allowNegativeValue: true,
};

export default adapter;
