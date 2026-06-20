import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const USDC = ADDRESSES.abstract.USDC;

const MAIN_CONTRACT = "0x458422e93bf89a109afc4fac00aacf2f18fcf541";
const MARKETPLACE = "0xC74d5002c10c13D2ad258B4584690829387f84dC";
const TRADING = "0x7627994b4B2d56A05cb2978b813cA0E1ccB22f97";
const PLATFORM_WALLET = "0xfB1302F5D6c5F107a0715b8Ce7303D1e3C647807";

const VENDING_MACHINES = [
  "0x92e6f37f41f78b7dd64d9741e2abd304cc3d9f0e",
  "0xbc4dD610d4930fAe06874a546561F4654D603387",
  "0x270Bbb21B1187Bc6e694F428DCb51432958Eb3d9",
];

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_EVENT = "event Transfer(address indexed from, address indexed to, uint256 value)";
const LISTING_BOUGHT =
  "event ListingBought(uint256 listingId, uint256 tokenId, address buyer, address seller, uint64 amount, uint128 pricePerItem)";
const BID_ACCEPTED =
  "event BidAccepted(uint256 bidId, uint256 tokenId, address seller, address buyer, uint64 amount, uint128 pricePerItem)";
const ORDER_ACCEPTED = "event OrderAccepted(uint256 indexed orderId, address indexed accepter)";

const MARKETPLACE_FEE_BPS = 500n;
const TRADE_FEE_BPS = 250n;
const BPS_DENOMINATOR = 10_000n;

const toAddressTopic = (address: string) =>
  `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

const normalize = (address?: string) => address?.toLowerCase();

const getTransferValue = (log: any) => BigInt(log.value ?? log.args?.value ?? 0);
const getTransferFrom = (log: any) => normalize(log.from ?? log.args?.from);
const getTransferTo = (log: any) => normalize(log.to ?? log.args?.to);

const addTransferLogs = (
  logs: any[],
  dailyVolume: any,
  dailyFees: any,
  excludedSenders = new Set<string | undefined>(),
) => {
  logs.forEach((log) => {
    if (excludedSenders.has(getTransferFrom(log))) return;
    const amount = getTransferValue(log);
    if (amount <= 0n) return;

    dailyVolume.add(USDC, amount);
    dailyFees.add(USDC, amount, METRIC.SERVICE_FEES);
  });
};

const addMarketplaceLogs = (
  logs: any[],
  dailyVolume: any,
  dailyFees: any,
) => {
  for (const log of logs) {
    const volume = BigInt(log.amount) * BigInt(log.pricePerItem);
    const fees = (volume * MARKETPLACE_FEE_BPS) / BPS_DENOMINATOR;

    dailyVolume.add(USDC, volume);
    dailyFees.add(USDC, fees, METRIC.TRADING_FEES);
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const [
    mainContractInflows,
    platformWalletInflows,
    vendingMachineInflows,
    listingBoughtLogs,
    bidAcceptedLogs,
    orderAcceptedLogs,
    usdcTransfers,
  ] = await Promise.all([
    options.getLogs({
      target: USDC,
      eventAbi: TRANSFER_EVENT,
      topics: [TRANSFER_TOPIC, null as any, toAddressTopic(MAIN_CONTRACT)],
    }),
    options.getLogs({
      target: USDC,
      eventAbi: TRANSFER_EVENT,
      topics: [TRANSFER_TOPIC, null as any, toAddressTopic(PLATFORM_WALLET)],
    }),
    Promise.all(
      VENDING_MACHINES.map((machine) =>
        options.getLogs({
          target: USDC,
          eventAbi: TRANSFER_EVENT,
          topics: [TRANSFER_TOPIC, null as any, toAddressTopic(machine)],
        }),
      ),
    ).then((logs) => logs.flat()),
    options.getLogs({
      target: MARKETPLACE,
      eventAbi: LISTING_BOUGHT,
    }),
    options.getLogs({
      target: MARKETPLACE,
      eventAbi: BID_ACCEPTED,
    }),
    options.getLogs({
      target: TRADING,
      eventAbi: ORDER_ACCEPTED,
      entireLog: true,
    }),
    options.getLogs({
      target: USDC,
      eventAbi: TRANSFER_EVENT,
      entireLog: true,
    }),
  ]);

  const platformWalletSenders = new Set([normalize(PLATFORM_WALLET)]);
  addTransferLogs(mainContractInflows, dailyVolume, dailyFees, platformWalletSenders);
  addTransferLogs(vendingMachineInflows, dailyVolume, dailyFees, platformWalletSenders);
  addTransferLogs(platformWalletInflows, dailyVolume, dailyFees);
  addMarketplaceLogs(listingBoughtLogs, dailyVolume, dailyFees);
  addMarketplaceLogs(bidAcceptedLogs, dailyVolume, dailyFees);

  const acceptedTradeTransactions = new Set(
    orderAcceptedLogs.map((log: any) => log.transactionHash?.toLowerCase()).filter(Boolean),
  );

  let tradingVolume = 0n;
  usdcTransfers.forEach((log: any) => {
    if (!acceptedTradeTransactions.has(log.transactionHash?.toLowerCase())) return;
    if (getTransferTo(log) === normalize(PLATFORM_WALLET)) return;
    tradingVolume += getTransferValue(log);
  });

  if (tradingVolume > 0n) {
    const tradingFees = (tradingVolume * TRADE_FEE_BPS) / BPS_DENOMINATOR;
    dailyVolume.add(USDC, tradingVolume);
    dailyFees.add(USDC, tradingFees, METRIC.TRADING_FEES);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  };
};

const methodology = {
  Volume:
    "Onchain USDC payments into DYLI mint, vending-machine, platform-wallet, and batchRedeem paths, plus marketplace and P2P trade settlement volume.",
  Fees:
    "Onchain USDC collected by DYLI contracts and wallet, plus 5% marketplace fees and 2.5% P2P trade fees. Stripe/card payments are excluded.",
  UserFees: "USDC paid by users through the tracked onchain DYLI payment paths.",
  Revenue: "Onchain USDC fees and payment flows retained by DYLI.",
  ProtocolRevenue: "Onchain USDC fees and payment flows retained by DYLI.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]:
      "USDC transfers into DYLI mint, vending-machine, platform-wallet, and batchRedeem fee paths.",
    [METRIC.TRADING_FEES]:
      "5% of secondary marketplace volume and 2.5% of accepted P2P trade USDC volume.",
  },
  UserFees: {
    [METRIC.SERVICE_FEES]:
      "USDC transfers into DYLI mint, vending-machine, platform-wallet, and batchRedeem fee paths.",
    [METRIC.TRADING_FEES]:
      "5% of secondary marketplace volume and 2.5% of accepted P2P trade USDC volume.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "USDC service-fee flows retained by DYLI.",
    [METRIC.TRADING_FEES]: "Marketplace and P2P trade fees retained by DYLI.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ABSTRACT],
  start: "2025-10-05",
  methodology,
  breakdownMethodology,
};

export default adapter;
