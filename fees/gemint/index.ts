import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GEMINT_CORE = "0x2d656a263E3fa1f1309260c9bfdA55D2C97FA598";
const BNB_USDT = "0x55d398326f99059ff775485246999027b3197955";

const eventAbis = {
  drawPurchased: "event DrawPurchased(string indexed purchaseId, address payer, uint32 packId, uint32 quantity, uint256 paymentAmount)",
  battlePaymentCollected: "event BattlePaymentCollected(string indexed battleId, address indexed payer, uint256 paymentAmount)",
};

const addPaidVolume = (
  paymentAmount: bigint,
  dailyVolume: Balances,
  dailyFees: Balances,
  dailyRevenue: Balances,
): void => {
  const estimatedFee = paymentAmount * 6n / 100n;
  dailyVolume.add(BNB_USDT, paymentAmount);
  dailyFees.add(BNB_USDT, estimatedFee);
  dailyRevenue.add(BNB_USDT, estimatedFee);
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
    addPaidVolume(paymentAmount, dailyVolume, dailyFees, dailyRevenue);
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
    addPaidVolume(paymentAmount, dailyVolume, dailyFees, dailyRevenue);
  });
};

const fetch = async (options: FetchOptions): Promise<{
  dailyVolume: Balances;
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailyUserFees: Balances;
  dailyProtocolRevenue: Balances;
}> => {
  const dailyVolume = new Balances({ chain: CHAIN.BSC });
  const dailyFees = new Balances({ chain: CHAIN.BSC });
  const dailyRevenue = new Balances({ chain: CHAIN.BSC });

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
  UserFees: "Same as Fees.",
  ProtocolRevenue: "Same as Revenue.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC],
  start: "2026-06-08",
  methodology,
};

export default adapter;
