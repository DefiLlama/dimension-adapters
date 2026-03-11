import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter, FetchResultFees } from "../adapters/types";

interface TonLstExportConfigs {
  poolAddress: string;
  feeShareRatio?: number;
  methodology?: any;
};

async function fetchData(blockNumber: number, poolAddress: string): Promise<[number, number]> {
  const url = 'https://ton-mainnet.core.chainstack.com/f2a2411bce1e54a2658f2710cd7969c3/api/v2/runGetMethod';
  const payload: any = {
    address: poolAddress,
    method: "get_pool_full_data",
    stack: [
      [
        "tvm.Slice",
        "te6cckEBAQEAJAAAQ4AbUzrTQYTUv8s/I9ds2TSZgRjyrgl2S2LKcZMEFcxj6PARy3rF",
      ],
    ],
    seqno: blockNumber
  };

  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };

  const response = await fetch(url, options);
  const data = await response.json();
  const totalAssets = parseInt(data.result.stack[3][1], 16);
  const totalShares = parseInt(data.result.stack[14][1], 16);
  return [totalAssets, totalShares];
}

const fetchFees = async (options: FetchOptions, config: TonLstExportConfigs): Promise<FetchResultFees> => {
  const fromBlock = await options.getFromBlock()
  const toBlock = await options.getToBlock()

  let dailyFees = options.createBalances();
  let dailyRevenue = options.createBalances();
  const feeShareRatio = config.feeShareRatio ?? 0;
  const yesterdaysData = await fetchData(fromBlock, config.poolAddress);
  const todaysData = await fetchData(toBlock, config.poolAddress);

  if (yesterdaysData[0] && todaysData[0]) {
    const votingRewardsInTonAfterFee = ((todaysData[0] / todaysData[1]) - (yesterdaysData[0] / yesterdaysData[1])) * (todaysData[1] / 1e9);

    const votingRewardsInTon = votingRewardsInTonAfterFee / ((100 - feeShareRatio) / 100);

    dailyFees.addCGToken("the-open-network", votingRewardsInTon);
    dailyRevenue.addCGToken("the-open-network", votingRewardsInTon - votingRewardsInTonAfterFee);
  } else {
    throw new Error('Invalid data')
  }

  if (config.feeShareRatio === undefined) return { dailyFees }  // if fee sharing info is missing, dont return revenue field

  return {
    dailyFees,
    dailyRevenue,
  };
}

export function tonLstExport(exportConfig: TonLstExportConfigs) {
  const adapter: SimpleAdapter = {
    version: 1,
    methodology: exportConfig.methodology ?? {
      Fees: 'Includes TON voting rewards earned by the pool',
      Revenue: 'Fee share taken from voting rewards',
      ProtocolRevenue: 'Part of the fees going to the protocol treasury',
    },
    fetch: (_: any, _1: any, options: FetchOptions) => fetchFees(options, exportConfig),
    chains: [CHAIN.TON],
  }
  return adapter
}
