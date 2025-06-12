import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';

const eventAbis = {
  event_order:
    "event PassivePerpMatchOrder(uint128 indexed marketId, uint128 indexed accountId, int256 orderBase, (uint256 protocolFeeCredit, uint256 exchangeFeeCredit, uint256 takerFeeDebit, int256[] makerPayments, uint256 referrerFeeCredit) matchOrderFees, uint256 executedOrderPrice, uint128 referrerAccountId, uint256 blockTimestamp)",
};

const CONFIG = {
  priceDecimals: 18,
  baseDecimals: 18,
  quoteDecimals: 6
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances()

  const logs = await options.getLogs({
   target: '0x27e5cb712334e101b3c232eb0be198baaa595f5f',
    eventAbi: eventAbis.event_order,
  });

  logs.forEach((log: any) => {
    const volume = Math.abs(Number(log.orderBase)) / (10 ** (CONFIG.baseDecimals - CONFIG.quoteDecimals)) * Number(log.executedOrderPrice) / (10 ** CONFIG.priceDecimals);
    const revenue = Number(log.matchOrderFees.protocolFeeCredit);
    const fee = Number(log.matchOrderFees.takerFeeDebit);

    dailyVolume.addToken(ADDRESSES.reya.RUSD, volume);
    dailyFees.addToken(ADDRESSES.reya.RUSD, fee);
    dailyRevenue.addToken(ADDRESSES.reya.RUSD, revenue);
  });


  return { dailyFees, dailyRevenue: dailyRevenue, dailyVolume: dailyVolume };
};

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.REYA]: {
      fetch,
      start: "2024-03-20",
      meta: {
        methodology: {
          Fees: "All fees paid by traders, including the APY earned by stakers",
          Revenue: "Portion of fees distributed to the DAO Treasury",
          Volume: "Notional volume of trades"
        }
      }
    },
  },
};

export default adapters;