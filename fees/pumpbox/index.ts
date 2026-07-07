import type { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { addTokensReceived } from "../../helpers/token";

// PumpBox checkout contract on Base:
// https://basescan.org/address/0x64FEeB41A17Dd29b9BAF6d45Ca2d359aE55d8C68
const CHECKOUT_CONTRACT = "0x64FEeB41A17Dd29b9BAF6d45Ca2d359aE55d8C68";
const USDC_BASE = ADDRESSES.base.USDC;
// PumpBox treasury / PumpDaily subscription receiver on Base:
// https://basescan.org/address/0x646308ef20fb48101662dda0fb2dc7c677bc1b59
const PUMPDAILY_SUBSCRIPTION_RECEIVER = "0x646308ef20fb48101662dda0fb2dc7c677bc1b59";

const OPEN_BOX_REQUESTED =
  "event OpenBoxRequested(address indexed user, bytes32 indexed boxId, uint256 indexed requestId, uint32 quantity, uint256 paidAmount, uint256 clientEntropy)";

const BUYBACK_EXECUTED = "event BuybackExecuted(address indexed seller, uint256 indexed tokenId, uint256 buybackPrice)";

const isSubscriptionFee = (log: any) =>
  (log.from_address ?? log.from ?? "").toLowerCase() !== CHECKOUT_CONTRACT.toLowerCase();

const fetch = async (options: FetchOptions) => {
  const { getLogs, createBalances } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyVolume = createBalances();

  const boxOpenedLogs = await getLogs({
    target: CHECKOUT_CONTRACT,
    eventAbi: OPEN_BOX_REQUESTED,
  });

  const buybackLogs = await getLogs({
    target: CHECKOUT_CONTRACT,
    eventAbi: BUYBACK_EXECUTED,
  });

  const subscriptionFees = await addTokensReceived({
    options,
    tokens: [USDC_BASE],
    target: PUMPDAILY_SUBSCRIPTION_RECEIVER,
    logFilter: isSubscriptionFee,
  });

  for (const log of boxOpenedLogs) {
    dailyVolume.add(USDC_BASE, log.paidAmount);
    dailyFees.add(USDC_BASE, log.paidAmount, "Box Opening Fees");
    dailyRevenue.add(USDC_BASE, log.paidAmount, "Box Opening Fees");
  }

  for (const log of buybackLogs) {
    dailyFees.add(USDC_BASE, -1 * Number(log.buybackPrice), "Buyback Spends");
    dailyRevenue.add(USDC_BASE, -1 * Number(log.buybackPrice), "Buyback Spends");
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
  chains: [CHAIN.BASE],
  start: "2026-06-01",
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // Buyback spends can exceed box opening fees in a window
};

export default adapter;
