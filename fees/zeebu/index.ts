import { request, } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// from official Zeebu dune: https://dune.com/zeebuofficial/staking-pools/40f70bfb-2014-4e3e-8480-d0e28625b403
const CONTRACTS = {
  [CHAIN.BASE]: [
    "0x24a4f5afc6a87005f00770e7e66d4a3d134f9923",
  ],
  [CHAIN.BSC]: [
    '0x8ae3d193a7dfeb4c8e36211d21e729feccfa738a',
  ],
  [CHAIN.ETHEREUM]: [
    '0xE843115fF0Dc2b20f5b07b6E7Ba5fED064468AC6'
  ],
};

const ZEBU_TOKEN = {
  [CHAIN.BASE]: '0x2c8c89c442436cc6c0a77943e09c8daf49da3161',
  [CHAIN.BSC]: '0x4D3dc895a9EDb234DfA3e303A196c009dC918f84',
  [CHAIN.ETHEREUM]: '0xe77f6aCD24185e149e329C1C0F479201b9Ec2f4B',
}

const EVENT = 'event RewardDistributionClaimed(address indexed user, uint256 indexed rewardDistributionId, address indexed token, uint256 amount)'

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()

  const logs = await options.getLogs({
    targets: CONTRACTS[options.chain],
    eventAbi: EVENT,
    flatten: true,
  })

  logs.forEach(log => dailyFees.add(log.token, log.amount))

  // exclude ZEBU token
  dailyFees.removeTokenBalance(ZEBU_TOKEN[options.chain])

  return { dailyFees, dailyRevenue: dailyFees };
};

const meta = {
  methodology: {
    Fees: "Track rewards distributed to stakers excluding ZEBU token.",
    Revenue: "Track rewards distributed to stakers excluding ZEBU token.",
  }
}

export default {
  version: 2,
  adapter: {
    // Define for each chain
    [CHAIN.BASE]: {
      fetch,
      start: '2024-09-17',
      meta,
    },
    [CHAIN.BSC]: {
      fetch,
      start: '2024-09-26',
      meta,
    },
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-10-29',
      meta,
    },
  },
} as Adapter;
