import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const CONTRACTS: Record<string, string> = {
  [CHAIN.GATELAYER]: "0x7C8FbD15E4c8B722920C1570A4704622D5391113",
};

const EVENT_TRADE =
  "event Trade(address indexed mint, address indexed user, uint256 gtAmount, uint256 tokenAmount, bool buy, uint256 virtualGtReserves, uint256 virtualTokenReserves)";

const fetch = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: CONTRACTS[options.chain],
    eventAbi: EVENT_TRADE,
  })

  const dailyVolume = options.createBalances()
  logs.forEach(log => {
    dailyVolume.addGasToken(log.gtAmount)
  })

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
	Volume: 'Total swap volume collected from gatefun contract 0x7C8FbD15E4c8B722920C1570A4704622D5391113',
  },
  start: '2025-09-27',
  chains: [CHAIN.GATELAYER],
  fetch,
}

export default adapter
