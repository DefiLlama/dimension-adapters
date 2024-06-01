import { Adapter, FetchOptions, FetchResultFees, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume';
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

interface IPoolData {
  id: number;
  feesUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.SCROLL]: "https://api.thegraph.com/subgraphs/name/bitdeep/keller-cl", 
}
const fetch = (chain: Chain) => {
  return async (timestamp: any): Promise<FetchResultFees> => {
    const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp.fromTimestamp * 1000));
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(todayTimestamp) / 86400)
    const graphQuery = gql
      `
      {
        uniswapDayData(id: ${dateId}) {
          id
          feesUSD
        }
      }
    `;

    const graphRes: IPoolData = (await request(endpoints[chain], graphQuery)).uniswapDayData;
    const dailyFeeUSD = graphRes;
    console.log("🚀 ~ return ~ dailyFeeUSD:", dailyFeeUSD)
    const dailyFee = dailyFeeUSD?.feesUSD ? new BigNumber(dailyFeeUSD.feesUSD) : undefined
    if (dailyFee === undefined) return { timestamp }

    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyUserFees: dailyFee.toString(),
      dailyRevenue: dailyFee.times(0.2).toString(),
      dailyHoldersRevenue: dailyFee.times(0.2).toString(),
    };
  };
}

const getFees = async (fetchOptions: FetchOptions): Promise<FetchResultFees> => {
  const v3PoolCreated = 'event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)';
  const v3SwapEvent = 'event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)'
  const collectProtocolEvent = 'event CollectProtocol(address indexed sender,address indexed recipient,uint128 amount0,uint128 amount1)';
  const factory = '0x952aC46B2586737df679e836d9B980E43E12B2d8';
  const timestamp = fetchOptions.fromTimestamp;
  const logs = await fetchOptions.getLogs({
    target: factory,
    eventAbi: v3PoolCreated,
    fromBlock: 4627488,
    toBlock: await fetchOptions.getToBlock(),
  });
  const fees = fetchOptions.createBalances();
  const protocolFees = fetchOptions.createBalances();
  const pools = logs.map((log: any) => log.pool);
  const feesPercentage = (await fetchOptions.api.multiCall({
    abi: 'function fee() view returns (uint24)',
    calls: pools,
  })).map((fee: any) => fee / 10000); 
  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    // Protocol Fees
    const collectProtocolLogs = await fetchOptions.getLogs({
      target: pool,
      eventAbi: collectProtocolEvent,
      fromBlock: await fetchOptions.getFromBlock(),
      toBlock: await fetchOptions.getToBlock(),
    });
    // User Fees
    const swapLogs = await fetchOptions.getLogs({
      target: pool,
      eventAbi: v3SwapEvent,
      fromBlock: await fetchOptions.getFromBlock(),
      toBlock: await fetchOptions.getToBlock(),
    });
    for (let j = 0; j < swapLogs.length; j++) {
      const log = swapLogs[j];
      const protocolLog = collectProtocolLogs[j];
      if(!log.length) continue;
      const isToken0 = log[2] > 0;
      let tokenAddress;
      let tokenDecimals;
      let feeAccumulated = 0n;
      let feeProtocol = 0n;
      if (isToken0) {
        tokenAddress = await fetchOptions.api.call({
          target: pool,
          abi: 'address:token0',
          chain: CHAIN.SCROLL,
        });
        tokenDecimals = await fetchOptions.api.call({
          target: tokenAddress,
          abi: 'function decimals() view returns (uint8)',
          chain: CHAIN.SCROLL,
        });
        feeAccumulated = BigInt((Number(log[2]) * feesPercentage[i]).toFixed(0));
        feeProtocol = BigInt((Number(protocolLog[2]) * feesPercentage[i]).toFixed(0));
      }else {
        tokenAddress = await fetchOptions.api.call({
          target: pool,
          abi: 'address:token1',
          chain: CHAIN.SCROLL,
        });
        tokenDecimals = await fetchOptions.api.call({
          target: tokenAddress,
          abi: 'function decimals() view returns (uint8)',
          chain: CHAIN.SCROLL,
        });
        feeAccumulated = BigInt((Number(log[3]) * feesPercentage[i]).toFixed(0));
        feeProtocol = BigInt((Number(protocolLog[3]) * feesPercentage[i]).toFixed(0));
      }
      fees.add(tokenAddress, feeAccumulated);
      protocolFees.add(tokenAddress, feeProtocol);
    };
  }
  return {
    timestamp,
    dailyFees: fees,
    dailyHoldersRevenue: fees,
    dailyProtocolRevenue: protocolFees,
  };
}



const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SCROLL]: {
      fetch: getFees,
      start: 1712740841,
  }
}
};
export default adapter;


