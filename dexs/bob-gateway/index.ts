import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import ADDRESSES from "../../helpers/coreAssets.json";
import { CHAIN } from "../../helpers/chains";
import { getTransactionsWithRetry } from "../../helpers/getTxReceipts";

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
  onrampV8FeesPaid: "event FeesPaid(bytes32 indexed orderId)",
  offrampProcessed:
    "event OrderProcessed(uint256 orderId, uint256 amountForSolver, uint256 amountForProtocol, uint256 totalAmountForAffiliates, uint256 btcAmount, address token)",
};

// V8 pays an order's fees in USDT straight from the solver to each recipient and emits FeesPaid
// without amounts; the amounts are in the calldata of the call that emitted it.
// Source: https://github.com/bob-collective/bob-gateway/blob/master/contracts/src/GatewayOnrampV8.sol
const onrampV8Interface = new Interface([
  "function payFees(bytes32 _orderId, (uint256 amount, address recipient)[] _affiliateFees, uint256 _protocolFeeAmount)",
  "function releaseFundsAndCallStrategyAndPayFees(bytes32 _orderId, (uint256 tokenFillAmount, address strategy, uint256 tokenWithheldForGasAmount, bytes32 recipient, bytes strategyExtraData) _args, (uint256 amount, address recipient)[] _affiliateFees, uint256 _protocolFeeAmount)",
]);

const getOnrampV8Fees = async (options: FetchOptions) => {
  const feesPaid = await options.getLogs({ targets: ONRAMPS.v8, eventAbi: EVENTS.onrampV8FeesPaid, entireLog: true });
  const txHashes = [...new Set(feesPaid.map((log: any) => log.transactionHash as string))];
  const txs = await getTransactionsWithRetry(options.chain, txHashes);

  let fees = 0n;
  txs.forEach((tx: any, i: number) => {
    if (!tx) throw new Error(`bob-gateway: missing FeesPaid transaction ${txHashes[i]}`);
    const target = String(tx.to).toLowerCase();
    if (!ONRAMPS.v8.some((onramp) => onramp.toLowerCase() === target)) {
      throw new Error(`bob-gateway: FeesPaid in ${txHashes[i]} was not a direct onramp call; calldata cannot be decoded`);
    }
    const call = onrampV8Interface.parseTransaction({ data: tx.data });
    if (!call) throw new Error(`bob-gateway: unknown onramp call in ${txHashes[i]}`);
    for (const affiliateFee of call.args._affiliateFees) fees += affiliateFee.amount;
    fees += call.args._protocolFeeAmount;
  });
  return fees;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const usdt = ADDRESSES.ethereum.USDT;

  // Onramp volume is the gross USDT value of the fill: payout to the user plus protocol and affiliate fees.
  const onrampV6 = await options.getLogs({ targets: ONRAMPS.v6, eventAbi: EVENTS.onrampV6 });
  const onrampV7 = await options.getLogs({ targets: ONRAMPS.v7, eventAbi: EVENTS.onrampV7 });
  for (const log of [...onrampV6, ...onrampV7]) {
    dailyVolume.add(usdt, log.tokenAmountOut + log.protocolFeesAmount + log.affiliateFeesAmount);
  }

  const onrampV8 = await options.getLogs({ targets: ONRAMPS.v8, eventAbi: EVENTS.onrampV8 });
  for (const log of onrampV8) dailyVolume.add(usdt, log.tokenAmountOut);
  dailyVolume.add(usdt, await getOnrampV8Fees(options));

  // Offramp volume is the total the user locked, which already includes protocol and affiliate fees.
  const offramps = await options.getLogs({ targets: OFFRAMP_REGISTRIES, eventAbi: EVENTS.offrampProcessed });
  for (const log of offramps) {
    dailyVolume.add(log.token, log.amountForSolver + log.amountForProtocol + log.totalAmountForAffiliates);
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
      "Completed BTC <-> USDT swaps settled by the BOB Gateway contracts on Ethereum, gross of fees. Onramps (BTC to USDT) count the USDT released to the user plus the protocol and affiliate fees: from OnrampExecuted on V6/V7, and on V8 from OnrampExecuted plus the fee amounts in the calls that emit FeesPaid. Offramps (USDT to BTC) count the tokens the user locked, from OrderProcessed events, which fire only after the solver's Bitcoin payment is proven on-chain. Refunded orders are not counted.",
  },
};

export default adapter;
