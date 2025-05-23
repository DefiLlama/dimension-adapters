import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import PromisePool from "@supercharge/promise-pool";
import ADDRESSES from '../../helpers/coreAssets.json';

const event_topics = {
    order: "0xe8137aa901976cc8eaf1cef5dec491873faadc99d9720ccaec95673294a9d7c5",
};

const eventAbis = {
  event_order:
    "event PassivePerpMatchOrder(uint128 indexed marketId, uint128 indexed accountId, int256 orderBase, (uint256 protocolFeeCredit, uint256 exchangeFeeCredit, uint256 takerFeeDebit, int256[] makerPayments, uint256 referrerFeeCredit) matchOrderFees, uint256 executedOrderPrice, uint128 referrerAccountId, uint256 blockTimestamp)",
};

const CONFIG = {
    priceDecimals: 18,
    baseDecimals: 18,
    quoteDecimals: 6
}

const fetch = async (_t: any, _a: any, options: FetchOptions): Promise<FetchResult> => {
  const [toBlock, fromBlock] = await Promise.all([
    options.getToBlock(),
    options.getFromBlock(),
  ]);
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const blockStep = 2000;
  let i = 0;
  let startBlock = fromBlock;
  let ranges: any = [];

  while (startBlock < toBlock) {
    const endBlock = Math.min(startBlock + blockStep - 1, toBlock);
    ranges.push([startBlock, endBlock]);
    startBlock += blockStep;
  }

  let errorFound = false;
  await PromisePool.withConcurrency(5)
    .for(ranges)
    .process(async ([startBlock, endBlock]: any) => {
      if (errorFound) return;
      try {
        const logs = await options.getLogs({
          noTarget: true,
          fromBlock: startBlock,
          toBlock: endBlock,
          eventAbi: eventAbis.event_order,
          topics: [event_topics.order],
          entireLog: true,
          skipCache: true,
        });
        const iface = new ethers.Interface([eventAbis.event_order]);

        logs.forEach((log: any) => {
          const parsedLog = iface.parseLog(log);

          const volume = Math.abs(Number(parsedLog!.args.orderBase)) / (10 ** (CONFIG.baseDecimals - CONFIG.quoteDecimals)) * Number(parsedLog!.args.executedOrderPrice) / (10 ** CONFIG.priceDecimals);
          const revenue = Number(parsedLog!.args.matchOrderFees.protocolFeeCredit);
          const fee = Number(parsedLog!.args.matchOrderFees.takerFeeDebit);

          dailyVolume.addToken(ADDRESSES.reya.RUSD, volume);
          dailyFees.addToken(ADDRESSES.reya.RUSD, fee);
          dailyRevenue.addToken(ADDRESSES.reya.RUSD, revenue);
        });
      } catch (e) {
        errorFound = e as boolean;
        throw e;
      }
    });

  if (errorFound) throw errorFound;

  return { dailyFees, dailyRevenue: dailyRevenue, dailyVolume: dailyVolume};
};

const adapters: SimpleAdapter = {
  version: 1,
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