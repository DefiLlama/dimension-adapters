import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import coreAssets from "../../helpers/coreAssets.json"

const SwapProcessedEvent = "event SwapProcessed(uint256 ethSwapped, uint256 welephantReceived, uint256 ethRemaining)";

const WelephantVault = '0x2209E478B23bc4F490357657B5E8a4fA063e1569';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const data: any[] = await options.getLogs({
    target: WelephantVault,
    eventAbi: SwapProcessedEvent,
  });
  data.forEach((log: any) => {
    dailyFees.add(coreAssets.GAS_TOKEN_2, log.ethSwapped);
  });
  
  const dailyProtocolRevenue = dailyFees.clone(0.10);
  const dailyHoldersRevenue = dailyFees.clone(0.90);

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyProtocolRevenue, dailyHoldersRevenue: dailyHoldersRevenue };
};

const methodology = {
    Fees: `Count WELEPHANT tokens swapped from 10% of total BNB deployed on WELEPHANT boards by protocol vault ${WelephantVault}.`,
    Revenue: 'All WELEPHANT fees are revenue.',
    ProtocolRevenue: '10% of WELEPHANT revenue goes to protocol operations.',
    HoldersRevenue: '90% of WELEPHANT fees are used to buyback WELEPHANT and distributed to WELEPHANT miners / stakers.',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: '2026-02-23',
  methodology
}

export default adapter;
