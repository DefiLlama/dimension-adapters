import BigNumber from "bignumber.js";
import { Adapter, FetchOptions } from "../../adapters/types";
import { OPTIMISM } from "../../helpers/chains";

const STAKER = "0xc30877315f3b621a8f7bcda27819ec29429f3817";
const DONATE_EVENT =
  "event DonatedRewards(address indexed account, uint256 amount)";

const sUsdPrice = async (): Promise<number> => {
  const ID = "optimism:0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9";
  const ENDPOINT = `https://coins.llama.fi/prices/current/${ID}`;
  const response = await fetch(ENDPOINT);
  const data = await response.json();
  if (!data) throw new Error("no data");
  if (!data.coins) throw new Error("no data.coins");
  const priceData = data.coins[ID];
  if (!priceData) throw new Error("no priceData");
  const price = priceData.price;
  if (!price) throw new Error("no price");
  if (price === 0) throw new Error("price is 0");
  return price;
};

const getFees = async (options: FetchOptions) => {
  const { getLogs } = options;
  const logs = await getLogs({
    targets: [STAKER],
    eventAbi: DONATE_EVENT,
  });
  const sUsdFees = logs
    .reduce((acc: any, log: any) => acc.plus(log.amount), new BigNumber(0))
    .div(1e18)
    .toNumber();
  const susdPrice = await sUsdPrice();
  const fees = sUsdFees * susdPrice;

  return {
    dailyFees: `${fees}`,
    dailyRevenue: `${fees}`,
    dailyHoldersRevenue: `${fees}`,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [OPTIMISM]: {
      fetch: getFees,
      start: 1712727843,
    },
  },
};
export default adapter;
