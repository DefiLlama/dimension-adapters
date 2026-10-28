import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const dailyFees = await addTokensReceived({ target: '0x45CF73349a4895fabA18c0f51f06D79f0794898D', tokens: ['0x922d8563631b03c2c4cf817f4d18f6883aba0109'], options })
  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees, }
}


const adapter: Adapter = {
  fetch,
  start: '2023-01-16',
  pullHourly: true,
  chains: [CHAIN.ETHEREUM],
  methodology: {
    Fees: 'Swap fees paid by users.',
    Revenue: 'Swap fees paid by users.',
    HoldersRevenue: 'All swap fees distributed to token holders.',
  }
}

export default adapter;
