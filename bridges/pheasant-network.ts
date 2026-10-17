import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Pheasant Network bridge: a user deposit emits NewTrade on the source chain's bridge contract (outgoing), and the
// destination payout emits Filled on that chain's ERC-7683 payout executor (incoming, after fees; the source Withdraw
// only reimburses the relayer). Addresses from the bridges-server adapter; payout executors from params.payoutExecutor(networkCode).
// Not counted: the old adapter's CCTP wrapper (DepositForBurnCalled, value moves through Circle CCTP) and PheasantSwap
// (SwapNewTrade, tokens handed to third-party aggregators); both registered one log as a deposit and a withdrawal.
const NEW_TRADE = "event NewTrade(address indexed userAddress, uint256 index, address to, uint256 amount, address token)";
const FILLED = "event Filled(bytes32 indexed orderId, bytes32 indexed orderTermsHash, address indexed recipient, address token, uint256 amount, address filler)";

const chainConfig: Record<string, { bridge: string; payoutExecutor: string }> = {
  [CHAIN.ETHEREUM]: { bridge: "0x20A41749545eB0C6266838257aDeA7b86d5369Ac", payoutExecutor: "0xb56De9d9Fb52f7Ef86407DC669868D24b61714A0" },
  [CHAIN.OPTIMISM]: { bridge: "0x0C4F10259c8b5Ed7238B76A0a6EfEf82cd2908Bf", payoutExecutor: "0x3ADf0Ae154c6FAd0aEf6bCdf8a7198Ebea37AD60" },
  [CHAIN.ARBITRUM]: { bridge: "0x97450C9B5fC6D1b86bF87EFDCbB137f26F8b497e", payoutExecutor: "0xD0d9df958bB728B0C90E7c94Aa398C26D2e4a3C5" },
  [CHAIN.SCROLL]: { bridge: "0xcAebc3309bFe45313922BFBa1a36C4458937E2A2", payoutExecutor: "0xd24E559A023729e95863d0Afc4B99Ff01969d8E3" },
  [CHAIN.BASE]: { bridge: "0x8A7Ee008B18DF025bc778B034Dbd7ad507221e10", payoutExecutor: "0x25cf6B24eC351d1695490B2046310cA3e8AdBE7B" },
  [CHAIN.LINEA]: { bridge: "0xbe7F97E4B54747B75B8aaF84ecafE876BaCA9198", payoutExecutor: "0x4393Cd250B2EC2cF7d3391c79de902207b246539" },
  [CHAIN.TAIKO]: { bridge: "0x7a651Ef5A53B128d406c9093feA2650e8A6156b5", payoutExecutor: "0xaae93A258792cFa4734e3fE897910fB0A90fE01d" },
  [CHAIN.MORPH]: { bridge: "0x56DE23ed536b2Bf8D398F2E1703Ce9aDb48B09F4", payoutExecutor: "0x52bC80E50FE8C8C4Fa131E7169eF9B64dA905685" },
  [CHAIN.ERA]: { bridge: "0xaFDaD3F10c7c906434422F229bCfB120bcE51C6c", payoutExecutor: "0x7120a850cD4FAd691147164D2eD8F2DEDb77Cc60" },
  [CHAIN.UNICHAIN]: { bridge: "0x81505846153403EBd6Cf5e89dD9f3eF2277fe374", payoutExecutor: "0x5c2E7369f044Ae87e40B19582056ede717953337" },
  [CHAIN.MEGAETH]: { bridge: "0x554590DC69830507248Ebc7AD3Bc9d6fA94488d2", payoutExecutor: "0x89E31B12e5fD6961474F7d814F90a5a0fDD7d55A" },
};

const fetch = async (options: FetchOptions) => {
  const { bridge, payoutExecutor } = chainConfig[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();

  const trades = await options.getLogs({ target: bridge, eventAbi: NEW_TRADE });
  const fills = await options.getLogs({ target: payoutExecutor, eventAbi: FILLED });
  for (const l of trades) dailyOutgoingVolume.add(l.token, l.amount);
  for (const l of fills) dailyIncomingVolume.add(l.token, l.amount);

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount: trades.length, dailyIncomingTxCount: fills.length };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: Object.keys(chainConfig),
  methodology: {
    OutgoingVolume: "Value of tokens users deposit into Pheasant Network's bridge on each chain.",
    IncomingVolume: "Value of tokens paid out to users on each chain when their Pheasant Network transfer is filled, after fees.",
    OutgoingTxCount: "Number of Pheasant Network deposits on each chain.",
    IncomingTxCount: "Number of Pheasant Network payouts on each chain.",
  },
};

export default adapter;
