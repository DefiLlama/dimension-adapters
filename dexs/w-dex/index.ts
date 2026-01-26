import { CHAIN } from "../../helpers/chains";
import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { filterPools } from "../../helpers/uniswap";
import { ethers } from "ethers";
import { addOneToken } from "../../helpers/prices";
import { all } from "axios";

const poolEvent = "event Pool(address indexed token0, address indexed token1, address pool)";
const poolSwapEvent = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)";

const factory = "0x215fDE4B415B9Ce21DEE6CAcEfc27Aa92441C4AA";
const fromBlock = 65913036;

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options;

  let logs = await options.getLogs({
    target: factory,
    eventAbi: poolEvent,
    fromBlock: fromBlock,
    entireLog: true,
    cacheInCloud: true,
  });

  const iface = new ethers.Interface([poolEvent]);
  logs = logs.map((log: any) => iface.parseLog(log)?.args);

  const pairObject: IJSON<string[]> = {};
  const fees: any = {};

  logs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1];
  });

  let _fees = await api.multiCall({
    abi: "function fee() view returns (uint24)",
    calls: logs.map((log: any) => log.pool),
  });

  _fees.forEach((fee: any, i: number) => (fees[logs[i].pool] = fee / 1e6));

  const filteredPairs = await filterPools({
    api,
    pairs: pairObject,
    createBalances,
  });
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const allFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const filteredPairs2 = Object.keys(filteredPairs)
  const allLogs = await getLogs({ targets: filteredPairs2, eventAbi: poolSwapEvent, flatten: false, });

  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = filteredPairs2[index];
    const [token0, token1] = pairObject[pair];
    const fee = fees[pair];
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1, });
      addOneToken({ chain, balances: allFees, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee, });
    });
  });

  const protocolFees = allFees.clone(0.135, 'ProtocolFee');
  const infraFees = allFees.clone(0.015, 'InfraFee');
  const lpFees = allFees.clone(0.85, 'LPFee');

  dailyFees.addBalances(infraFees, 'InfraFee');
  dailyFees.addBalances(protocolFees, 'ProtocolFee');
  dailyRevenue.addBalances(protocolFees, 'ProtocolFee');

  dailyFees.addBalances(lpFees, 'LPFee');
  dailySupplySideRevenue.addBalances(lpFees, 'LPFee');

  dailyFees.add(protocolFees, 'ProtocolFee');
  dailyRevenue.add(protocolFees, 'ProtocolFee');

  dailyFees.add(infraFees, 'InfraFee');
  dailySupplySideRevenue.add(infraFees, 'InfraFee');

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyProtocolRevenue: dailyRevenue,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
};


const breakdownMethodology = {
  Fees: {
    'InfraFee': '1.5% of swap fees go to Algebra.',
    'LPFee': '85% of swap fees go to liquidity providers.',
    'ProtocolFee': '13.5% of swap fees go to the protocol.',
  },
  Revenue: {
    'ProtocolFee': '13.5% of swap fees go to the protocol.',
  },
  SupplySideRevenue: {
    'InfraFee': '1.5% of swap fees go to Algebra.',
    'LPFee': '85% of swap fees go to liquidity providers.',
  },
  ProtocolRevenue: {
    'ProtocolFee': '13.5% of swap fees go to the protocol.',
  },
}

const methodology = {
  Fees: "All swap fees paid by users.",
  UserFees: "All swap fees paid by users.",
  SupplySideRevenue: "LPs get 85% of swap fees, Algebra 1.5%",
  Revenue: "13.5% of swap fees go to the protocol.",
  ProtocolRevenue: "Protocol get 13.5%",
}

const adapter: SimpleAdapter = {
  breakdownMethodology,
  version: 2,
  fetch,
  chains: [CHAIN.POLYGON],
  methodology
};

export default adapter;
