import type { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { addTokensReceived } from "../../helpers/token";

type PumpBoxChainConfig = {
  checkout: string;
  paymentToken: string;
  subscriptionReceiver: string;
  start: string;
};

const CONFIG: Record<string, PumpBoxChainConfig> = {
  [CHAIN.BASE]: {
    // PumpBox checkout contract on Base:
    // https://basescan.org/address/0x64FEeB41A17Dd29b9BAF6d45Ca2d359aE55d8C68
    checkout: "0x64FEeB41A17Dd29b9BAF6d45Ca2d359aE55d8C68",
    paymentToken: ADDRESSES.base.USDC,
    // PumpBox treasury / PumpDaily subscription receiver on Base:
    // https://basescan.org/address/0x646308ef20fb48101662dda0fb2dc7c677bc1b59
    subscriptionReceiver: "0x646308ef20fb48101662dda0fb2dc7c677bc1b59",
    start: "2026-06-01",
  },
  [CHAIN.ROBINHOOD]: {
    // PumpBox checkout contract on Robinhood Chain:
    // https://robinhoodchain.blockscout.com/address/0x641c14BB5DeBE0a5e22546f48292c388e42459db
    checkout: "0x641c14BB5DeBE0a5e22546f48292c388e42459db",
    paymentToken: ADDRESSES.robinhood.USDG,
    // PumpBox treasury / PumpDaily subscription receiver on Robinhood Chain:
    // https://robinhoodchain.blockscout.com/address/0x646308ef20fb48101662dda0fb2dc7c677bc1b59
    subscriptionReceiver: "0x646308ef20fb48101662dda0fb2dc7c677bc1b59",
    start: "2026-08-13",
  },
};

const OPEN_BOX_REQUESTED =
  "event OpenBoxRequested(address indexed user, bytes32 indexed boxId, uint256 indexed requestId, uint32 quantity, uint256 paidAmount, uint256 clientEntropy)";

const BUYBACK_EXECUTED = "event BuybackExecuted(address indexed seller, uint256 indexed tokenId, uint256 buybackPrice)";

const isSubscriptionFee = (checkout: string) => (log: any) =>
  (log.from_address ?? log.from ?? "").toLowerCase() !== checkout.toLowerCase();

const fetch = async (options: FetchOptions) => {
  const { getLogs, createBalances } = options;
  const config = CONFIG[options.chain];
  if (!config) throw new Error(`Unsupported chain: ${options.chain}`);

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyVolume = createBalances();

  const boxOpenedLogs = await getLogs({
    target: config.checkout,
    eventAbi: OPEN_BOX_REQUESTED,
  });

  const buybackLogs = await getLogs({
    target: config.checkout,
    eventAbi: BUYBACK_EXECUTED,
  });

  const subscriptionFees = await addTokensReceived({
    options,
    tokens: [config.paymentToken],
    target: config.subscriptionReceiver,
    logFilter: isSubscriptionFee(config.checkout),
  });

  for (const log of boxOpenedLogs) {
    dailyVolume.add(config.paymentToken, log.paidAmount);
    dailyFees.add(config.paymentToken, log.paidAmount, "Box Opening Fees");
    dailyRevenue.add(config.paymentToken, log.paidAmount, "Box Opening Fees");
  }

  for (const log of buybackLogs) {
    dailyFees.add(config.paymentToken, -1 * Number(log.buybackPrice), "Buyback Spends");
    dailyRevenue.add(config.paymentToken, -1 * Number(log.buybackPrice), "Buyback Spends");
  }

  dailyFees.addBalances(subscriptionFees, "Subscription Fees");
  dailyRevenue.addBalances(subscriptionFees, "Subscription Fees");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume: "All USDC payments made by users when opening blind boxes. Each box has a fixed USDC price; users pay price × quantity.",
  Fees: "USDC paid by users to request blind box openings plus PumpDaily subscriptions, net of buyback spends.",
  Revenue: "USDC paid by users to request blind box openings plus PumpDaily subscriptions, net of buyback spends.",
  ProtocolRevenue: "USDC paid by users to request blind box openings plus PumpDaily subscriptions, net of buyback spends.",
};

const breakdownMethodology = {
  Fees: {
    "Box Opening Fees": "USDC paid by users to request blind box openings. The checkout contract escrows USDC and transfers it to the payment receiver upon fulfillment.",
    "Subscription Fees": "USDC paid by users for PumpDaily subscriptions via direct transfers to the protocol treasury.",
    "Buyback Spends": "USDC spent by the protocol on box buybacks.",
  },
  Revenue: {
    "Box Opening Fees": "USDC paid by users to request blind box openings.",
    "Subscription Fees": "USDC paid by users for PumpDaily subscriptions.",
    "Buyback Spends": "USDC spent by the protocol on box buybacks.",
  },
  ProtocolRevenue: {
    "Box Opening Fees": "USDC paid by users to request blind box openings.",
    "Subscription Fees": "USDC paid by users for PumpDaily subscriptions.",
    "Buyback Spends": "USDC spent by the protocol on box buybacks.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: CONFIG,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // Buyback spends can exceed box opening fees in a window
};

export default adapter;
