import { Balances } from "@defillama/sdk";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const GEMINT_CORE = "0x2d656a263E3fa1f1309260c9bfdA55D2C97FA598";
const BNB_USDT = ADDRESSES[CHAIN.BSC].USDT;

const eventAbis = {
  drawPurchased: "event DrawPurchased(string indexed purchaseId, address payer, uint32 packId, uint32 quantity, uint256 paymentAmount)",
  battlePaymentCollected: "event BattlePaymentCollected(string indexed battleId, address indexed payer, uint256 paymentAmount)",
};

const addPaidVolume = (
  paymentAmount: bigint,
  dailyVolume: Balances,
  dailyFees: Balances,
  dailyRevenue: Balances,
  feeType: string,
): void => {
  const estimatedFee = paymentAmount * 6n / 100n;
  dailyVolume.add(BNB_USDT, paymentAmount);
  dailyFees.add(BNB_USDT, estimatedFee, feeType);
  dailyRevenue.add(BNB_USDT, estimatedFee, feeType);
};

const getGachaPurchases = async (
  options: FetchOptions,
  dailyVolume: Balances,
  dailyFees: Balances,
  dailyRevenue: Balances,
): Promise<void> => {
  const logs = await options.getLogs({
    target: GEMINT_CORE,
    eventAbi: eventAbis.drawPurchased,
  });

  logs.forEach(({ paymentAmount }) => {
    addPaidVolume(paymentAmount, dailyVolume, dailyFees, dailyRevenue, "Gacha Fees");
  });
};

const getBattlePayments = async (
  options: FetchOptions,
  dailyVolume: Balances,
  dailyFees: Balances,
  dailyRevenue: Balances,
): Promise<void> => {
  const logs = await options.getLogs({
    target: GEMINT_CORE,
    eventAbi: eventAbis.battlePaymentCollected,
  });

  logs.forEach(({ paymentAmount }) => {
    addPaidVolume(paymentAmount, dailyVolume, dailyFees, dailyRevenue, "Battle Fees");
  });
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  await getGachaPurchases(options, dailyVolume, dailyFees, dailyRevenue);
  await getBattlePayments(options, dailyVolume, dailyFees, dailyRevenue);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyUserFees: dailyFees,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Volume: "Volume from Gacha purchases and Battle payments.",
  Fees: "Estimated fees from Gacha purchases and Battle payments, calculated as 6% of paid volume.",
  Revenue: "Estimated revenue from Gacha purchases and Battle payments, calculated as 6% of paid volume.",
  UserFees: "Estimated user fees from Gacha purchases and Battle payments, calculated as 6% of paid volume.",
  ProtocolRevenue: "Estimated protocol revenue from Gacha purchases and Battle payments, calculated as 6% of paid volume.",
};

const breakdownMethodology = {
  Fees: {
    "Gacha Fees": "Estimated fees from Gacha purchases, calculated as 6% of paid volume.",
    "Battle Fees": "Estimated fees from Battle payments, calculated as 6% of paid volume.",
  },
  Revenue: {
    "Gacha Fees": "Estimated revenue from Gacha purchases, calculated as 6% of paid volume.",
    "Battle Fees": "Estimated revenue from Battle payments, calculated as 6% of paid volume.",
  },
  ProtocolRevenue: {
    "Gacha Fees": "Estimated revenue from Gacha purchases, calculated as 6% of paid volume.",
    "Battle Fees": "Estimated revenue from Battle payments, calculated as 6% of paid volume.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: "2026-06-08",
  methodology,
  breakdownMethodology,
};

export default adapter;
