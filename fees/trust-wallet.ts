import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const chains = [
  CHAIN.ETHEREUM,
];

const targets: any = {
  [CHAIN.ETHEREUM]: [
    "0x9cdFbB62C42767E911b696292eF7179Df66bEE27",
    "0xe020C8934B23E5bCcA1E7EEcdb6f39674029Fe47",
    "0xaD01C20d5886137e056775af56915de824c8fCe5",
    "0x19cd4F3820E7BBed45762a30BFA37dFC6c9C145b",
    "0xeb4Af8a64070Ef0dEa6260e0Bf2310748f014d88",
    "0xb16Ad1a21185823c780D0a69B777DbdcB9aB87d1",
    "0xfc0f33C016589a4a4823F31D748DF0d0360D825A",
    "0xcA868ef1dF9e52d7d5AC79f7e52F492e619f2bAB",
    "0xb27028fcd9cb9d621646bb1e769ab9b6a4bf69f3",
    "0x37815fC86c61b06eff53EC7c4DEA59784499d74A",
    "0xf2eF6cDFd963091b3fDd2097299f90C8e18DC379"
  ]
}

const tokens: any = {
  [CHAIN.ETHEREUM]: [
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  ]
}

const tokens_type_percent: any = {
  [CHAIN.ETHEREUM]: [
    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  ]
}
const targets_type_percent: any = {
  [CHAIN.ETHEREUM]: [
    "0x8a2cCb2AC2aDFbA97d6Ec6eF04aeF5587EEE33Ce",
  ]
}
const fromAdddesses_type_percent: any = {
  [CHAIN.ETHEREUM]: [
    "0xB685760EBD368a891F27ae547391F4E2A289895b",
  ]
}

const fromAdddesses: any = {
  [CHAIN.ETHEREUM]: [
    "0xD37BbE5744D730a1d98d8DC97c42F0Ca46aD7146"
  ]
}

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  await addTokensReceived({
    options,
    targets: targets[options.chain],
    tokens: tokens[options.chain],
    toAddressFilter: targets[options.chain],
    fromAddressFilter: fromAdddesses[options.chain],
    balances: dailyFees,
  });

  const fees_percet = await addTokensReceived({
    options,
    targets: targets_type_percent[options.chain],
    tokens: tokens_type_percent[options.chain],
    toAddressFilter: targets_type_percent[options.chain],
    fromAddressFilter: fromAdddesses_type_percent[options.chain],
  });
  fees_percet.resizeBy(0.01)
  dailyFees.addBalances(fees_percet)
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetchFees,
      },
    };
  }, {}),
};

export default adapter;
