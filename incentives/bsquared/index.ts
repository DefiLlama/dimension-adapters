import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Source: https://buzz.bsquared.network/
const WAD = 10n ** 18n;
const FARMING_REWARDS = "0xd5B5f1CA0fa5636ac54b0a0007BA374A1513346e";
const MINING_REWARDS = "0x8dc7F4565D72aBD3E40EFBB92063eC8bfca39570";
const B2 = "bsquared-network";

const MINING_EVENTS = [
  "event GetReward(address indexed user, uint256 phase, uint256 reward, uint256 time)",
  "event GetRewardToBSC(address indexed user, uint256 phase, uint256 reward, uint256 time, address airdrop_address, bytes32 message_id)",
];

const toB2 = (amount: bigint) => Number(amount / WAD) + Number(amount % WAD) / 1e18;

const fetch = async (options: FetchOptions) => {
  const tokenIncentives = options.createBalances();
  let b2Incentives = 0n;
  const [fromBlock, toBlock] = await Promise.all([options.getStartBlock(), options.getEndBlock()]);

  const [b2PerBlock, startBlock, endBlock] = await options.api.batchCall([
    { target: FARMING_REWARDS, abi: "function b2PerBlock() view returns (uint256)" },
    { target: FARMING_REWARDS, abi: "function startBlock() view returns (uint256)" },
    { target: FARMING_REWARDS, abi: "function endBlock() view returns (uint256)" },
  ]);
  const activeBlocks = Math.max(0, Math.min(toBlock, Number(endBlock)) - Math.max(fromBlock, Number(startBlock)));
  b2Incentives += BigInt(activeBlocks) * BigInt(b2PerBlock);

  for (const eventAbi of MINING_EVENTS) {
    const logs = await options.getLogs({
      target: MINING_REWARDS,
      eventAbi,
    });
    logs.forEach((log: any) => {
      b2Incentives += BigInt(log.reward);
    });
  }

  tokenIncentives.addCGToken(B2, toB2(b2Incentives));
  return { tokenIncentives };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSQUARED]: {
      fetch,
      start: "2025-04-30",
    },
  },
  methodology: {
    tokenIncentives:
      "B2 incentives include the on-chain Buzz Farming B2/block reward schedule and B2 Mining Rig rewards claimed from the mining rewards contract. Partner points displayed in Buzz are excluded because they are off-chain or partner-side rewards.",
  },
};

export default adapter;
