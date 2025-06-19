import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const eventRouted = `event Routed(
  bytes indexed uniquePID,
  address indexed userAddress,
  address outputReceiver,
  address inputToken,
  uint256 inputAmount,
  address outputToken,
  uint256 outputAmount,
  uint256 partnerFee,
  uint256 routingFee,
  uint256 finalOutputAmount
)`;

const DEFAULT_ROUTER = "0x6Ec7612828B776cC746fe0Ee5381CC93878844f7";
const gasTokens = new Set([
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  '0x0000000000000000000000000000000000000000',
  '0x2222222222222222222222222222222222222222',  // hyperliquid
  '0x0000000000000000000000000000000000001010',  // polygon
])

const config: any = {
  [CHAIN.ETHEREUM]: {},
  [CHAIN.ARBITRUM]: {},
  [CHAIN.BASE]: {},
  [CHAIN.XDAI]: {},
  [CHAIN.BSC]: {},
  [CHAIN.POLYGON]: {},
  [CHAIN.AVAX]: {},
  [CHAIN.OPTIMISM]: {},
  [CHAIN.BLAST]: {},
  [CHAIN.LINEA]: {},
  [CHAIN.MANTLE]: { router: "0x85fb41c470B8Dd2C9aD262F38e38E42a2f92C285" },
  [CHAIN.SCROLL]: {},
  [CHAIN.TAIKO]: { router: "0x75e74A67Bd4A76BcE60bb0546f092571c3133523" },
  [CHAIN.BERACHAIN]: {},
  [CHAIN.SONIC]: {},
  [CHAIN.UNICHAIN]: {},
  [CHAIN.HYPERLIQUID]: {},
}

const START = '2025-03-14'; // Mar-14-2025

async function fetch({ getLogs, createBalances, chain }: FetchOptions) {
  const { router = DEFAULT_ROUTER } = config[chain]
  const logs = await getLogs({ targets: [router], eventAbi: eventRouted, });
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  logs.forEach((log) => {
    const token = log.outputToken.toLowerCase();
    const outputAmount = log.outputAmount;
    const revenue = log.routingFee; // comment from the team:  We are currently setting it to 1 as default because the contract requires routingFee > 0. That was a design failure we overlook. Effectively routingFee should be 0 at the moment, i.e. Gluex is not charging a protocol fee
    const fee = log.routingFee + log.partnerFee;

    const isNative = gasTokens.has(token)

    if (isNative) {
      dailyVolume.addGasToken(outputAmount);
      dailyFees.addGasToken(fee);
      dailyRevenue.addGasToken(revenue);
    } else {
      dailyVolume.add(token, outputAmount);
      dailyFees.add(token, fee);
      dailyRevenue.add(token, revenue);
    }
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: '0',
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {},
};

Object.keys(config).forEach(chain => {
  adapter.adapter[chain] = { fetch, start: START, }
})

export default adapter;