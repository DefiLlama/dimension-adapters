import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getETHReceived } from "../helpers/token";
import { getAlliumChain, queryAllium } from "../helpers/allium";

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
    "0x74379aD026eF386679a27B320841224A08722C66",
    "0x92f980a7aae3574cfe45e30a21d6aa14d08f7c7d",
    "0xe020C8934B23E5bCcA1E7EEcdb6f39674029Fe47",
    "0xaD01C20d5886137e056775af56915de824c8fCe5",
    "0x19cd4F3820E7BBed45762a30BFA37dFC6c9C145b",
    "0xeb4Af8a64070Ef0dEa6260e0Bf2310748f014d88",
    "0xb16Ad1a21185823c780D0a69B777DbdcB9aB87d1",
    "0xfc0f33C016589a4a4823F31D748DF0d0360D825A",
    "0xcA868ef1dF9e52d7d5AC79f7e52F492e619f2bAB",
    "0xb27028fcd9cb9d621646bb1e769ab9b6a4bf69f3",
    "0x37815fC86c61b06eff53EC7c4DEA59784499d74A",
    "0xf2eF6cDFd963091b3fDd2097299f90C8e18DC379",
    "0xc84f14C250128357C82E1b737Bf19e6Efb1111bc",
    "0xab28e2d6e4713dc0f6F1aDdf74abc3d2313445cc"
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
    ADDRESSES.avax.USDt
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
    "0xD37BbE5744D730a1d98d8DC97c42F0Ca46aD7146",
    "0xCE99790A72037EDcFEDCd667bA837FfF29DFf969",
    "0x790D46F47a1934229452D8C1e6aF1De2c1326Ed3"
  ],
}

// Swaps that Trust Wallet routes through CoW Swap carry a 70 bps partner fee: app data appCode "Trust wallet",
// partnerFee { volumeBps: 70, recipient: 0xea5B...334ec }, e.g.
// https://explorer.cow.fi/orders/0x911c3a9f99e1d25a4010eb1bdbdb4b795757b036236fbbbe0f096f634c92d42a5d0875aab555bb3a604e2ce8e12e7d336ec123316ae528a8?tab=overview
// CoW Protocol pays it out weekly, in the native token, from its "Solver payouts" Safe 0xa03be496...
// (https://docs.cow.fi/governance/multisigs) and, on Arbitrum and Polygon, from 0x66331f0b..., a Safe that
// shares its owners. First payout 2026-05-20, e.g. https://bscscan.com/tx/0xd5c1caf85bacca4125e8bdf3f4f6d3f39591e5c435f0b14435bff89f59cfd0a1
// The payouts are internal value transfers (Safe.execTransaction), so they are read from Allium.
const COW_PARTNER_FEE_RECIPIENT = '0xea5b5991f761ced44ffa99beacb72d691ee334ec'
const COW_PARTNER_FEE_PAYERS = [
  '0xa03be496e67ec29bc62f01a428683d7f9c204930',
  '0x66331f0b9cb30d38779c786bda5a3d57d12fba50',
]
const COW_PARTNER_FEES_FROM = 1779235200 // 2026-05-20, the first payout

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  await addTokensReceived({
    options,
    targets: targets[options.chain],
    tokens: tokens[options.chain],
    toAddressFilter: targets[options.chain],
    fromAdddesses: fromAdddesses[options.chain] ?? [],
    balances: dailyFees,
  });
  const fees_percet = options.createBalances()
  if (targets_type_percent[options.chain]) {
    await addTokensReceived({
      options,
      targets: targets_type_percent[options.chain] ?? [],
      tokens: tokens_type_percent[options.chain] ?? [],
      toAddressFilter: targets_type_percent[options.chain] ?? [],
      fromAdddesses: fromAdddesses_type_percent[options.chain] ?? [],
      balances: fees_percet,
    });
  }
  fees_percet.resizeBy(0.01)
  dailyFees.addBalances(fees_percet)

  // Native gas-token fees. When a user swap is paid in the chain's native token
  // (ETH / BNB / POL / AVAX / etc.), 0x Settler (Trust Wallet's documented swap router
  // partner — verified Sourcify source at 0x7f54f05635d15cde17a49502fedb9d1803a3be8a /
  // contract MainnetSettler @custom:security-contact security@0x.org) forwards the
  // Trust Wallet integrator fee to the same fee collectors as plain internal value
  // calls. Those calls do not emit ERC20 Transfer events and so are invisible to the
  // addTokensReceived path above. Pulled via Allium native_token_transfers / traces.
  await getETHReceived({
    options,
    targets: targets[options.chain],
    balances: dailyFees,
  });

  if (options.endTimestamp > COW_PARTNER_FEES_FROM) {
    const [{ amount }] = await queryAllium(`
      SELECT COALESCE(SUM(raw_amount), 0) AS amount
      FROM ${getAlliumChain(options.chain)}.assets.native_token_transfers
      WHERE to_address = '${COW_PARTNER_FEE_RECIPIENT}'
        AND from_address IN (${COW_PARTNER_FEE_PAYERS.map((a) => `'${a}'`).join(', ')})
        AND transfer_type = 'value_transfer'
        AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    `)
    dailyFees.addGasToken(amount)
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
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
    Fees: 'All fees paid by users for swapping, bridging in Trust Wallet. Captured from ERC20 Transfer events into the fee collectors (USDC and 1%-scaled USDT), from native gas-token internal transfers forwarded by the 0x Settler integrator, and from the CoW Swap partner fee that CoW Protocol pays out to Trust Wallet each week.',
    Revenue: 'Fees collected by Trust Wallet.',
    ProtocolRevenue: 'Fees collected by Trust Wallet.',
  }
};

export default adapter;
