import { FetchOptions } from "../../adapters/types";
import BigNumber from "bignumber.js";

export const iETHv2_VAULT = "0xA0D3707c569ff8C87FA923d3823eC5D81c98Be78";
export const stETHAddress = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";

const EventLogCollectRevenue =
  "event LogCollectRevenue(uint256 amount, address indexed to)";

export async function fetchLiteEth(options: FetchOptions) {
  const dailyRevenue = options.createBalances();
  const [currentRevenueValue, startRevenueValue] = await Promise.all([
    options.api.call({
      abi: "function revenue() view returns (uint256)",
      target: iETHv2_VAULT,
    }),
    options.fromApi.call({
      abi: "function revenue() view returns (uint256)",
      target: iETHv2_VAULT,
    }),
  ]);

  const revenueDelta = Number(currentRevenueValue) - Number(startRevenueValue);
  dailyRevenue.add(stETHAddress, revenueDelta, "Lite Vaults Fees");

  const collectRevenueLogs = await options.getLogs({
    target: iETHv2_VAULT,
    onlyArgs: true,
    eventAbi: EventLogCollectRevenue,
    fromBlock: Number(options.fromApi.block),
    toBlock: Number(options.api.block),
    skipCacheRead: true,
    skipIndexer: true,
  });

  const collectedRevenueAmount: BigNumber = collectRevenueLogs.reduce(
    (acc, log) => acc.plus(new BigNumber(log[0])),
    new BigNumber(0)
  );

  dailyRevenue.add(stETHAddress, collectedRevenueAmount.toFixed(), "Lite Vaults Fees");

  return { dailyFees: dailyRevenue, dailyRevenue };
}
