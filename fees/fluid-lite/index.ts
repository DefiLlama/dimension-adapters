import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions } from "../../adapters/types";
import BigNumber from 'bignumber.js';

const iETHv2_VAULT = "0xA0D3707c569ff8C87FA923d3823eC5D81c98Be78";
const stETHAddress = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const EventLogCollectRevenue = 'event LogCollectRevenue(uint256 amount, address indexed to)';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  const [currentRevenueValue, startRevenueValue] = await Promise.all([
    options.api.call({
      abi: 'function revenue() view returns (uint256)',
      target: iETHv2_VAULT,
    }),

    options.fromApi.call({
      abi: 'function revenue() view returns (uint256)',
      target: iETHv2_VAULT,
    }),
  ]);

  // Add revenue delta to daily revenue
  const revenueDelta = Number(currentRevenueValue) - Number(startRevenueValue)
  dailyRevenue.add(
    stETHAddress,
    revenueDelta,
  );

  const collectRevenueLogs = await options.getLogs({
    target: iETHv2_VAULT,
    onlyArgs: true,
    eventAbi: EventLogCollectRevenue,
    fromBlock: Number(options.fromApi.block),
    toBlock: Number(options.api.block),
    skipCacheRead: true,
    skipIndexer: true,
    // More resource-intensive but prevents logs from being cached.
    // Currently, the adapter is updated every hour.
    // In case of an error within a given time range for some reasons, the next sequence
    // can likely fix the issue naturally if it retries fetching all the logs
  });

  // If revenue is collected in this timeframe, add the collected amount to daily fees
  const collectedRevenueAmount: BigNumber = collectRevenueLogs.reduce(
    (acc, log) => acc.plus(new BigNumber(log[0])),
    new BigNumber(0)
  );

  dailyRevenue.add(
    stETHAddress,
    collectedRevenueAmount.toFixed(),
  );

  return { dailyFees: dailyRevenue, dailyRevenue }
};

const adapter: Adapter = {
  version: 1,
  methodology: {
    Fees: 'Lite Vault charges a 20% performance fee on vaults and an additional 0.05% exit fee. Revenue is collected and transferred to the Instadapp treasury.',
    Revenue: 'Lite Vault charges a 20% performance fee on vaults and an additional 0.05% exit fee. Revenue is collected and transferred to the Instadapp treasury.',
  },
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-02-13',
};

export default adapter;
