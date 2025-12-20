import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const STREAMING_FEE_MODULES: { [chain: string]: string } = {
  [CHAIN.ETHEREUM]: "0x165EDF07Bb61904f47800e13F5120E64C4B9A186", // v1
  [CHAIN.ARBITRUM]: "0x42bf8b14277bb77244e693f98f848e7594022310",
  [CHAIN.BASE]: "0x4580dbe79b8fcb1282eb43113536d62e882fc044",
};

const DEBT_ISSUANCE_MODULES: { [chain: string]: string } = {
  [CHAIN.ETHEREUM]: "0x04b59f9f09750c044d7cfbc177561e409085f0f3", // v1
  [CHAIN.ARBITRUM]: "0x4ac26c26116fa976352b70700af58bc2442489d8",
  [CHAIN.BASE]: "0xa30e87311407ddcf1741901a8f359b6005252f22",
};

// Ethereum v2 modules
const ETHEREUM_V2_STREAMING_FEE_MODULE =
  "0x08f866c74205617b6f3903ef481798eced10cdec";

const ETHEREUM_V2_DEBT_MODULE_MAIN =
  "0xd8EF3cACe8b4907117a45B0b125c68560532F94D"; // DPI / BED / MVI

const ETHEREUM_V2_DEBT_MODULE_ICETH =
  "0x69a592d2129415a4a1d1b1e309c17051b7f28d57"; // icETH

const ETHEREUM_SET_TOKENS = [
  // v1
  "0x65c4C0517025Ec0843C9146aF266A2C5a2D148A2", // ETH2x
  "0x23C3e5B3d001e17054603269EDFC703603AdeFd8", // ETH3x
  "0xc7068657FD7eC85Ea8Db928Af980Fc088aff6De5", // BTC3x
  "0xD2AC55cA3Bbd2Dd1e9936eC640dCb4b745fDe759", // BTC2x
  "0x1d86FBAd389068E19fa665Eba12A0Ebd4c68BB08", // GOLD3x
  "0x72e364f2abdc788b7e918bc238b21f109cd634d7", // MVI
  "0xada0a1202462085999652dc5310a7a9e2bf3ed42", // CGI
  "0x33d63Ba1E57E54779F7dDAeaA7109349344cf5F1", // DATA
  "0x47110d43175f7f2c2425e7d15792acc5817eb44f", // GMI
  "0x341c05c0E9b33C0E38d64de76516b2Ce970bB3BE", // dsETH
  "0xc4506022Fb8090774E8A628d5084EED61D9B99Ee", // hyETH
  "0x55b2CFcfe99110C773f00b023560DD9ef6C8A13B", // cdETI
  "0x1B5E16C5b20Fb5EE87C61fE9Afe735Cca3B21A65", // ic21
  "0x36c833Eed0D376f75D1ff9dFDeE260191336065e", // gtcETH
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC

  // v2
  "0x1494CA1F11D487c2bBe4543E90080AeBa4BA3C2b", // DeFi Pulse Index (DPI)
  "0x2aF1dF3AB0ab157e1E2Ad8F88A7D04fbea0c7dc6", // Bankless BED Index (BED) 
  "0x72e364F2ABdC788b7E918bc238B21f109Cd634D7", // MVI 
  "0x7c07f7abe10ce8e33dc6c5ad68fe033085256a84", // icETH 
];

// Arbitrum Set Tokens
const ARBITRUM_SET_TOKENS = [
  "0x26d7D3728C6bb762a5043a1d0CeF660988Bca43C", // eth2xArb
  "0xA0A17b2a015c14BE846C5d309D076379cCDfa543", // eth3xArb
  "0x749654601a286833aD30357246400D2933b1C89b", // iEthArb
  "0xeb5bE62e6770137beaA0cC712741165C594F59D7", // btc2xArb
  "0x3bDd0d5c0C795b2Bf076F5C8F177c58e42beC0E6", // btc3xArb
  "0x80e58AEA88BCCaAE19bCa7f0e420C1387Cc087fC", // iBtcArb
  "0xE7b1Ce8DfEE3D7417397cd4f56dBFc0d49E43Ed1", // eth2xBtcArb
  "0x77f69104145f94a81cec55747c7a0fc9cb7712c3", // btc2xEthArb
  "0xaF0408C1Cc4b41cf878143423015937032878913", // LINK2x
  "0xFc01f273126B3d515e6ce6CaB9e53d5C6990D6CB", // ARB2x
];

// Base Set Tokens
const BASE_SET_TOKENS = [
  "0xC884646E6C88d9b172a23051b38B0732Cc3E35a6", // eth2xBase
  "0x329f6656792c7d34D0fBB9762FA9A8F852272acb", // eth3xBase
  "0x186f3d8bb80dff50750babc5a4bcc33134c39cde", // btc2xBase
  "0x1F4609133b6dAcc88f2fa85c2d26635554685699", // btc3xBase
  "0x0a0fbd86d2deb53d7c65fecf8622c2fa0dcdc9c6", // uSOL2x
  "0x16c469F88979e19A53ea522f0c77aFAD9A043571", // uSOL3x
  "0x2f67e4be7fbf53db88881324aac99e9d85208d40", // uSUI2x
  "0x8D08CE52e217aD61deb96dFDcf416B901cA2dC22", // uSUI3x
  "0x32BB8FF692A2F14C05Fe7a5ae78271741bD392fC", // uXRP2x
  "0x5c600527D2835F3021734504E53181E54fA48f73", // uXRP3x
  "0xc8DF827157AdAf693FCb0c6f305610C28De739FD", // wstETH15x
];

const INDEX_COOP_SET_TOKENS: { [chain: string]: string[] } = {
  [CHAIN.ETHEREUM]: ETHEREUM_SET_TOKENS,
  [CHAIN.ARBITRUM]: ARBITRUM_SET_TOKENS,
  [CHAIN.BASE]: BASE_SET_TOKENS,
};

const ABI = {
  FeeActualized:
    "event FeeActualized(address indexed _setToken, uint256 _managerFee, uint256 _protocolFee)",
  SetTokenIssued:
    "event SetTokenIssued(address indexed _setToken, address indexed _issuer, address indexed _to, address _hookContract, uint256 _quantity, uint256 _managerFee, uint256 _protocolFee)",
  SetTokenRedeemed:
    "event SetTokenRedeemed(address indexed _setToken, address indexed _redeemer, address indexed _to, uint256 _quantity, uint256 _managerFee, uint256 _protocolFee)",
};

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const tokenSet = new Set(
    (INDEX_COOP_SET_TOKENS[options.chain] || []).map(t => t.toLowerCase())
  );

  const processFeeEvent = (log: any) => {
    const token = String(log._setToken || "").toLowerCase();
    if (!tokenSet.has(token)) return;

    const managerFee = BigInt(log._managerFee || 0);
    const protocolFee = BigInt(log._protocolFee || 0);

    // const totalFee = managerFee + protocolFee;
    dailyFees.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyFees.add(token, managerFee, METRIC.MANAGEMENT_FEES);
    dailyProtocolRevenue.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyProtocolRevenue.add(token, managerFee, METRIC.MANAGEMENT_FEES);
  };

  // streaming
  const streamingModule = STREAMING_FEE_MODULES[options.chain];
  if (streamingModule) {
    const logs = await options.getLogs({
      target: streamingModule,
      eventAbi: ABI.FeeActualized,
    });
    logs.forEach(processFeeEvent);
  }

  // issuance
  const debtModule = DEBT_ISSUANCE_MODULES[options.chain];
  if (debtModule) {
    const [issued, redeemed] = await Promise.all([
      options.getLogs({ target: debtModule, eventAbi: ABI.SetTokenIssued }),
      options.getLogs({ target: debtModule, eventAbi: ABI.SetTokenRedeemed }),
    ]);
    [...issued, ...redeemed].forEach(processFeeEvent);
  }

  // Ethereum v2
  if (options.chain === CHAIN.ETHEREUM) {
    const v2StreamingLogs = await options.getLogs({
      target: ETHEREUM_V2_STREAMING_FEE_MODULE,
      eventAbi: ABI.FeeActualized,
    });
    v2StreamingLogs.forEach(processFeeEvent);

    const [v2Issued, v2Redeemed] = await Promise.all([
      options.getLogs({ target: ETHEREUM_V2_DEBT_MODULE_MAIN, eventAbi: ABI.SetTokenIssued }),
      options.getLogs({ target: ETHEREUM_V2_DEBT_MODULE_MAIN, eventAbi: ABI.SetTokenRedeemed }),
    ]);
    [...v2Issued, ...v2Redeemed].forEach(processFeeEvent);

    const [icIssued, icRedeemed] = await Promise.all([
      options.getLogs({ target: ETHEREUM_V2_DEBT_MODULE_ICETH, eventAbi: ABI.SetTokenIssued }),
      options.getLogs({ target: ETHEREUM_V2_DEBT_MODULE_ICETH, eventAbi: ABI.SetTokenRedeemed }),
    ]);
    [...icIssued, ...icRedeemed].forEach(processFeeEvent);
  }

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees: "Streaming fees and issuance/redemption fees paid by users.",
    Revenue: "Fees retained by the Index Coop protocol, including manager and protocol portions.",
    ProtocolRevenue: "Fees allocated to Protocol and approved managers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]:
        "Protocol fees generated from streaming fees, issuance, and redemption events.",
      [METRIC.MANAGEMENT_FEES]:
        "Manager fees generated from streaming fees, issuance, and redemption events.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]:
        "Protocol fees collected and retained by Index Coop from streaming fees, issuance, and redemption events.",
      [METRIC.MANAGEMENT_FEES]:
        "Manager fees collected by Index Coop and allocated to approved managers",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]:
        "Protocol fees collected and retained by Index Coop from streaming fees, issuance, and redemption events.",
      [METRIC.MANAGEMENT_FEES]:
        "Manager fees collected by Index Coop and allocated to approved managers.",
    },
  },
  
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2022-09-30" }, 
    [CHAIN.ARBITRUM]: { fetch, start: "2024-05-22" },
    [CHAIN.BASE]: { fetch, start: "2023-08-22" },
  },
};

export default adapter;