import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json';
import { addTokensReceived } from "../../helpers/token";

const GRAIL_CONTRACT = "0x36B162DE23E4E809d78Fb0EAe4a2272Bc313d738";

async function fetch(options: FetchOptions) {
  const dailyVolume = await addTokensReceived({
    options,
    target: GRAIL_CONTRACT,
    token: ADDRESSES.base.USDC,
  });

  return {
    dailyVolume,
  }
}

const methodology = {
  Volume: "Volume of grail pack sales, tracked as USDC received on the Grail contract."
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-04-27",
  methodology,
}

export default adapter;