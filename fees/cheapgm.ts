
import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions } from "../adapters/types";

const TREASURY = "0x21ad6eF3979638d8e73747f22B92C4AadE145D82";

const CHAINS: Array<string> = [
  CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.OPTIMISM, CHAIN.ARBITRUM, CHAIN.POLYGON, CHAIN.BSC,
  CHAIN.SCROLL, CHAIN.MANTLE, CHAIN.LINEA, CHAIN.ERA, CHAIN.TAIKO, CHAIN.BLAST, CHAIN.MODE, CHAIN.ZORA, CHAIN.METIS,
  CHAIN.CRONOS, CHAIN.CELO, CHAIN.CONFLUX, CHAIN.RONIN, CHAIN.LISK, CHAIN.BERACHAIN, CHAIN.CORE, CHAIN.BOB,
  CHAIN.ABSTRACT, CHAIN.SONEIUM, CHAIN.INK, CHAIN.UNICHAIN, CHAIN.PLUME, CHAIN.SONIC,
]

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const balanceStart = await options.fromApi.provider.getBalance(TREASURY);
  const balanceEnd = await options.toApi.provider.getBalance(TREASURY);

  dailyFees.addGasToken(balanceEnd - balanceStart)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: CHAINS,
  methodology: {
    Fees: "Daily net increase in treasury address balance in each chain's native token (net inflow)",
    Revenue: "All fees are revenue.",
  },
};

export default adapter;
