import { Adapter } from "../utils/adapter";
import { ethers } from "ethers";
import { CHAIN } from "../helpers/chains";
import { getLogs } from "../utils/blockchain"; // 

const FACTORY = '0x0569F2A6B281b139bC164851cf86E4a792ca6e81';
const START_BLOCK = 20846873; // 
const CHAIN_NAME = "sonic"; // or use CHAIN.SONIC if available

const SWAP_EVENT_SIGNATURE = 'event Swap(address indexed sender,uint amount0In,uint amount1In,uint amount0Out,uint amount1Out,address indexed to)';

const fetchVolume = async (timestamp: number) => {
  const dayTimestamp = Math.floor(timestamp / 86400) * 86400;
  const { fromBlock, toBlock } = await getLogs.getBlockRange({
    chain: CHAIN_NAME,
    timestamp: dayTimestamp,
  });

  const pairLength = await getLogs.singleCall({
    target: FACTORY,
    abi: 'function allPairsLength() view returns (uint256)',
    chain: CHAIN_NAME,
    block: toBlock,
  });

  const allPairCalls = Array.from({ length: Number(pairLength) }, (_, i) => ({
    target: FACTORY,
    abi: 'function allPairs(uint) view returns (address)',
    params: [i],
  }));

  const pairAddresses = await getLogs.multiCall({
    abi: 'function allPairs(uint) view returns (address)',
    calls: allPairCalls,
    chain: CHAIN_NAME,
    block: toBlock,
  });

  const allSwapLogs = await getLogs.getLogs({
    targets: pairAddresses.map(p => p.output),
    eventAbi: SWAP_EVENT_SIGNATURE,
    chain: CHAIN_NAME,
    fromBlock,
    toBlock,
  });

  let totalVolume = ethers.BigNumber.from(0);

  for (const log of allSwapLogs) {
    const amount0In = ethers.BigNumber.from(log.data.slice(2, 66));
    const amount1In = ethers.BigNumber.from(log.data.slice(66, 130));
    totalVolume = totalVolume.add(amount0In).add(amount1In);
  }

  return {
    dailyVolume: totalVolume.toString(),
    timestamp: dayTimestamp,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN_NAME]: {
      fetch: fetchVolume,
      start: START_BLOCK,
      runAtCurrTime: true,
    },
  },
};

export default adapter;

