import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FeeCollectedEvent = "event FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)"

const WARPFeeCollector = '0x312a6be6bD9850D6a2F793b8425c39eFC01C3585';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const data: any[] = await options.getLogs({
    target: WARPFeeCollector,
    eventAbi: FeeCollectedEvent,
  });
  data.forEach((log: any) => {
    dailyFees.add(log._token, log._integratorFee);
  });
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: 'All fees paid by users for swap and bridge tokens via LI.FI.',
  Revenue: 'Fees are distributed to Warp Finance and creators',
  ProtocolRevenue: 'Fees are distributed to Warp Finance.',
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2023-07-27',
  methodology
}

export default adapter;