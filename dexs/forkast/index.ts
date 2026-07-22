import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'
import { getPolymarketVolume } from "../../helpers/polymarket";

const CTF_EXCHANGE = "0x2D7aa09fe8a9Af205aD6E0Fef1441834c4250cdc";

const PC_TOKEN = "0x4AC7b973fb4f10D94eda5Efa92fFABD6aDDFb65c";
const USDC = ADDRESSES[CHAIN.ARBITRUM].USDC;

const fetch = async (options: FetchOptions) => {
  // PC (Platform Credits) is pegged 1:1 to USDC; see https://docs.forkast.gg
  const { dailyVolume, dailyNotionalVolume } = await getPolymarketVolume({
    options,
    exchanges: [CTF_EXCHANGE],
    currency: USDC,
  });

  return {
    dailyVolume,
    dailyNotionalVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2025-10-28",
  methodology: {
    Volume: "Sum of PC (Platform Credits), Forkast's internal settlement token, moved through trades on our CTFExchange contract. PC is valued at a 1:1 ratio with USDC for this figure.",
    NotionalVolume: "Notional volume of all trades settled on the CTFExchange contract.",
  },
};

export default adapter;
