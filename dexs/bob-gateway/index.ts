import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";
import { CHAIN } from "../../helpers/chains";

// BOB Gateway swaps native BTC <-> USDT through an intents protocol: a solver fills orders from its
// own inventory and settles them on Ethereum, whichever chain the user started from (the routers on
// other chains only bridge into or out of these contracts). Counting the Ethereum settlement
// contracts therefore covers every route once.
// Addresses: https://github.com/bob-collective/bob-gateway/blob/master/contracts/README.md

// Onramp (BTC -> USDT): the solver releases USDT to the user (or to a strategy that forwards it).
// token() is USDT on every deployment below. Each version has a different OnrampExecuted signature.
const ONRAMPS = {
  v6: [
    "0x61F5C10B468a72f0306F6C30FCd9024f1cedCfDd", // 2026-05-05
    "0x42C04Ac4dAD3Af5133C4B52d2463C5eCbA0F853b", // 2026-05-11
    "0x82d912fBEB52b7fFaE4206A2c5505A45B026622F", // 2026-05-12
  ],
  v7: [
    "0x9C9CAD0Ec73ECD169519AF9a4De854cB0FE206B0", // 2026-06-08
  ],
  v8: [
    "0xD2D0aeB6032eCe39264fDa021BA37bA50332cF73", // 2026-08-13
    "0x0d3ead994f783DC8e6E6Ab4a92C59471852dAEEC", // 2026-08-20, current
  ],
};

// Offramp (USDT -> BTC): users lock tokens in the registry, and OrderProcessed fires once the
// solver's Bitcoin payment is proven on-chain. The event is identical across V5-V7.
const OFFRAMP_REGISTRIES = [
  "0xc112B16EafD6314Db33F8B9C953EB2E2214247b3", // V5, 2026-05-05
  "0x85c9a57714234e5dbee19b17d001eeadf28c8c5c", // V6, 2026-07-17
  "0x79F11Bbf3f438ba40FEB48bDdCc8bbFb42a8baa1", // V7, 2026-08-20
  "0xca79896bcec80aa7628d67c6fac85bdf6ae63b1c", // V7, 2026-08-24, current
];

const EVENTS = {
  onrampV6:
    "event OnrampExecuted(bytes32 indexed orderId, address indexed recipient, uint256 tokenAmountOut, uint256 protocolFeesAmount, uint256 affiliateFeesAmount, uint256 relayerEthFee, uint256 excessEth, bool strategySkipped)",
  onrampV7:
    "event OnrampExecuted(bytes32 indexed orderId, bytes32 indexed recipient, uint256 tokenAmountOut, uint256 protocolFeesAmount, uint256 affiliateFeesAmount, uint256 relayerEthFee, uint256 excessEth, bool strategySkipped)",
  onrampV8: "event OnrampExecuted(bytes32 indexed orderId, bytes32 indexed recipient, uint256 tokenAmountOut)",
  offrampProcessed:
    "event OrderProcessed(uint256 orderId, uint256 amountForSolver, uint256 amountForProtocol, uint256 totalAmountForAffiliates, uint256 btcAmount, address token)",
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const [onrampV6, onrampV7, onrampV8, offramps] = await Promise.all([
    options.getLogs({ targets: ONRAMPS.v6, eventAbi: EVENTS.onrampV6 }),
    options.getLogs({ targets: ONRAMPS.v7, eventAbi: EVENTS.onrampV7 }),
    options.getLogs({ targets: ONRAMPS.v8, eventAbi: EVENTS.onrampV8 }),
    options.getLogs({ targets: OFFRAMP_REGISTRIES, eventAbi: EVENTS.offrampProcessed }),
  ]);

  for (const log of [...onrampV6, ...onrampV7, ...onrampV8]) {
    dailyVolume.add(ADDRESSES.ethereum.USDT, log.tokenAmountOut, "Onramp (BTC to USDT)");
  }

  for (const log of offramps) {
    const tokensLocked = log.amountForSolver + log.amountForProtocol + log.totalAmountForAffiliates;
    dailyVolume.add(log.token, tokensLocked, "Offramp (USDT to BTC)");
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-05-05", // first Ethereum onramp and offramp deployments
  methodology: {
    Volume:
      "Completed BTC <-> USDT swaps settled by the BOB Gateway contracts on Ethereum. Onramps (BTC to USDT) count the USDT released to the user, net of fees, from OnrampExecuted events. Offramps (USDT to BTC) count the tokens the user locked, from OrderProcessed events, which fire only after the solver's Bitcoin payment is proven on-chain. Refunded orders are not counted.",
  },
  breakdownMethodology: {
    Volume: {
      "Onramp (BTC to USDT)": "USDT released to users who sent BTC, net of protocol and affiliate fees.",
      "Offramp (USDT to BTC)": "Tokens locked by users whose BTC payout was proven on-chain, including fees.",
    },
  },
};

export default adapter;
