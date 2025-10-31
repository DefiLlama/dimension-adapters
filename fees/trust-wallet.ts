import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.OPTIMISM,
  CHAIN.ARBITRUM,
  CHAIN.BASE,
  CHAIN.POLYGON,
  CHAIN.AVAX,
  CHAIN.BSC
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
  ],
  [CHAIN.OPTIMISM]: [
    '0xaD01C20d5886137e056775af56915de824c8fCe5',
    '0x19cd4F3820E7BBed45762a30BFA37dFC6c9C145b'
  ],
  [CHAIN.ARBITRUM]: [
    '0xaD01C20d5886137e056775af56915de824c8fCe5',
    '0x19cd4F3820E7BBed45762a30BFA37dFC6c9C145b'
  ],
  [CHAIN.BASE]: [
    "0xaD01C20d5886137e056775af56915de824c8fCe5",
    "0xaD01C20d5886137e056775af56915de824c8fCe5",
    "0x19cd4F3820E7BBed45762a30BFA37dFC6c9C145b"
  ],
  [CHAIN.POLYGON]: [
    "0xaD01C20d5886137e056775af56915de824c8fCe5",
    "0x19cd4F3820E7BBed45762a30BFA37dFC6c9C145b"
  ],
  [CHAIN.AVAX]: [
    "0xaD01C20d5886137e056775af56915de824c8fCe5",
    "0x19cd4F3820E7BBed45762a30BFA37dFC6c9C145b"
  ],
  [CHAIN.BSC]: [
    '0x19cd4F3820E7BBed45762a30BFA37dFC6c9C145b'
  ]
}

const tokens: any = {
  [CHAIN.ETHEREUM]: [
    ADDRESSES.ethereum.USDC,
  ],
  [CHAIN.OPTIMISM]: [
    ADDRESSES.optimism.USDC_CIRCLE,
    ADDRESSES.kava.axlUSDC
  ],
  [CHAIN.ARBITRUM]: [
    ADDRESSES.arbitrum.USDC_CIRCLE,
    ADDRESSES.kava.axlUSDC
  ],
  [CHAIN.BASE]: [
    ADDRESSES.base.USDC,
    ADDRESSES.kava.axlUSDC
  ],
  [CHAIN.POLYGON]: [
    ADDRESSES.polygon.USDC_CIRCLE,
    "0x750e4C4984a9e0f12978eA6742Bc1c5D248f40ed"
  ],
  [CHAIN.AVAX]: [
    ADDRESSES.avax.USDC,
    "0x750e4C4984a9e0f12978eA6742Bc1c5D248f40ed"
  ],
  [CHAIN.BSC]: [
    '0x4268B8F0B87b6Eae5d897996E6b845ddbD99Adf3'
  ]
}

const tokens_type_percent: any = {
  [CHAIN.ETHEREUM]: [
    ADDRESSES.ethereum.USDT,
  ],
  [CHAIN.OPTIMISM]: [
    ADDRESSES.optimism.USDT
  ],
  [CHAIN.ARBITRUM]: [
    ADDRESSES.arbitrum.USDT
  ],
  [CHAIN.POLYGON]: [
    ADDRESSES.polygon.USDT
  ],
  [CHAIN.AVAX]: [
    ADDRESSES.polygon.USDT
  ],
  [CHAIN.BSC]: [
    ADDRESSES.bsc.USDT
  ]
}
const targets_type_percent: any = {
  [CHAIN.ETHEREUM]: [
    "0x8a2cCb2AC2aDFbA97d6Ec6eF04aeF5587EEE33Ce",
  ],
  [CHAIN.OPTIMISM]: [
    '0xa6ef7DBAc93698f1963954EDEb1daf4d77007a66'
  ],
  [CHAIN.ARBITRUM]: [
    '0xa6ef7DBAc93698f1963954EDEb1daf4d77007a66'
  ],
  [CHAIN.POLYGON]: [
    "0x6fE04472Aa2fd9314786eFABB5816DB968a6931a"
  ],
  [CHAIN.AVAX]: [
    "0x6fE04472Aa2fd9314786eFABB5816DB968a6931a"
  ],
  [CHAIN.BSC]: [
    '0xb0A67B70876dB53ea6EC0C9e0e9Bf2f59D97b663'
  ]
}
const fromAdddesses_type_percent: any = {
  [CHAIN.ETHEREUM]: [
    "0xB685760EBD368a891F27ae547391F4E2A289895b",
  ],
  [CHAIN.OPTIMISM]: [
    '0xB685760EBD368a891F27ae547391F4E2A289895b'
  ],
  [CHAIN.ARBITRUM]: [
    '0xB685760EBD368a891F27ae547391F4E2A289895b'
  ],
  [CHAIN.POLYGON]: [
    "0xB685760EBD368a891F27ae547391F4E2A289895b"
  ],
  [CHAIN.AVAX]: [
    "0xB685760EBD368a891F27ae547391F4E2A289895b"
  ],
  [CHAIN.BSC]: [
    '0xB685760EBD368a891F27ae547391F4E2A289895b'
  ]
}

const fromAdddesses: any = {
  [CHAIN.ETHEREUM]: [
    "0xD37BbE5744D730a1d98d8DC97c42F0Ca46aD7146"
  ],
}

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  await addTokensReceived({
    options,
    targets: targets[options.chain],
    tokens: tokens[options.chain],
    toAddressFilter: targets[options.chain],
    fromAddressFilter: fromAdddesses[options.chain] ?? [],
    balances: dailyFees,
  });
  const fees_percet = options.createBalances()
  if (targets_type_percent[options.chain]) {
    await addTokensReceived({
      options,
      targets: targets_type_percent[options.chain] ?? [],
      tokens: tokens_type_percent[options.chain] ?? [],
      toAddressFilter: targets_type_percent[options.chain] ?? [],
      fromAddressFilter: fromAdddesses_type_percent[options.chain] ?? [],
      balances: fees_percet,
    });
  }
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
        start: '2023-05-18',
      },
    };
  }, {}),
  methodology: {
    Fees: 'All fees paid by users for swapping, bridging in Trust wallet.',
    Revenue: 'Fees collected by Trust Wallet.',
    ProtocolRevenue: 'Fees collected by Trust Wallet.',
  }
};

export default adapter;
