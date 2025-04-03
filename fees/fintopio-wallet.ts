import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addGasTokensReceived, addTokensReceived } from "../helpers/token";

type TMulitsig = {
  [s: string]: string[];
}
const multisig1 = "0xCB203fbB9dA1A930578a2d62AD49af8d27aadd01";
const multisig2 = "0xe5C68E943b3aEaD59709F9fe51b5eb6598bed3b2";
const multisig2 = "0xe5C68E943b3aEaD59709F9fe51b5eb6598bed3b2";
const multisig2 = "0xe5C68E943b3aEaD59709F9fe51b5eb6598bed3b2";

const multisigs: TMulitsig = {
  [CHAIN.BSC]: ["0xCB203fbB9dA1A930578a2d62AD49af8d27aadd01"],
  [CHAIN.BSC]: ["0xe5C68E943b3aEaD59709F9fe51b5eb6598bed3b2"],
  [CHAIN.TON]: ["UQCXwlp0CZbvT1gI7TTgmcAFTw2FKaOSc5ZLT2NN2df4cbBY"],
  [CHAIN.TON]: ["UQC3LEsF4S1YJRl1qBRdyVSBj-PQ8iW4wze5z0ozJmpalEdP"],
}

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await addGasTokensReceived({ multisigs: multisigs[options.chain], options })
  await addTokensReceived({ targets: multisigs[options.chain], options, balances: dailyFees,})
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const methodology = {
  Fees: "Take 0.3% from trading volume",
  Revenue: "Take 0.3% from trading volume",
}

const chainAdapter = { fetch, start: '2025-01-01', meta: { methodology } }
const tonAdapter = { fetch, start: '2024-11-01', meta: { methodology } }
const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: chainAdapter,
    [CHAIN.TON]: tonAdapter,
  }
}

export default adapter;
