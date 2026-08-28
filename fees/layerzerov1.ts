import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// LayerZero V1 messaging stack uses UltraLightNodeV2 as the SendLib on V1 endpoints.
// Native fees paid by users on `send()` are split internally into:
//   - relayer fee     (paid in native, accrued to relayer worker)
//   - oracle fee      (paid in native, accrued to oracle worker)
//   - treasury fee    (paid in native OR in ZRO, accrued to treasury contract)
// Workers/treasury later withdraw their share via withdrawNative / withdrawZRO,
// which emits WithdrawNative / WithdrawZRO. Summing those withdrawals gives total
// native + ZRO fees paid by users (lagged by withdrawal cadence, converges over time).
//
// Fees here represent V1-only traffic. V2 (SendUln302) and V2 V1-compat (SendUln301)
// are tracked separately in fees/layerzero.ts.

const eventWithdrawNative = "event WithdrawNative(address indexed msgSender, address indexed to, uint256 amount)";
const eventWithdrawZRO = "event WithdrawZRO(address indexed msgSender, address indexed to, uint256 amount)";

const ZRO_TOKEN_BY_CHAIN: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x6985884c4392d348587b19cb9eaaf157f13271cd",
};

type ChainConfig = {
  ultraLightNodeV2: string;
  start: string;
};

const config: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: { ultraLightNodeV2: "0x4D73AdB72bC3DD368966edD0f0b2148401A178E2", start: "2022-05-19" },
  [CHAIN.BSC]: { ultraLightNodeV2: "0x4D73AdB72bC3DD368966edD0f0b2148401A178E2", start: "2022-05-19" },
  [CHAIN.AVAX]: { ultraLightNodeV2: "0x4D73AdB72bC3DD368966edD0f0b2148401A178E2", start: "2022-05-19" },
  [CHAIN.POLYGON]: { ultraLightNodeV2: "0x4D73AdB72bC3DD368966edD0f0b2148401A178E2", start: "2022-05-19" },
  [CHAIN.ARBITRUM]: { ultraLightNodeV2: "0x4D73AdB72bC3DD368966edD0f0b2148401A178E2", start: "2022-05-19" },
  [CHAIN.OPTIMISM]: { ultraLightNodeV2: "0x4D73AdB72bC3DD368966edD0f0b2148401A178E2", start: "2022-05-19" },
  [CHAIN.FANTOM]: { ultraLightNodeV2: "0x4D73AdB72bC3DD368966edD0f0b2148401A178E2", start: "2022-05-19" },
  [CHAIN.HARMONY]: { ultraLightNodeV2: "0x4D73AdB72bC3DD368966edD0f0b2148401A178E2", start: "2022-05-19" },
  [CHAIN.BASE]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2023-08-09" },
  [CHAIN.LINEA]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2023-07-19" },
  [CHAIN.SCROLL]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2023-10-10" },
  [CHAIN.MANTLE]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2023-07-17" },
  [CHAIN.BLAST]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-02-29" },
  [CHAIN.MODE]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-04-01" },
  [CHAIN.AURORA]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2022-05-19" },
  [CHAIN.CELO]: { ultraLightNodeV2: "0x377530cdA84DFb2673bF4d145DCF0C4D7fdcB5b6", start: "2022-09-15" },
  // [CHAIN.ZKSYNC]: { ultraLightNodeV2: "0x042b8289c97896529Ec2FE49ba1A8B9C956A86cC", start: "2023-04-15" },
  [CHAIN.POLYGON_ZKEVM]: { ultraLightNodeV2: "0xFe7C30860D01e28371D40434806F4A8fcDD3A098", start: "2023-05-01" },
  // [CHAIN.CORE]: { ultraLightNodeV2: "0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675", start: "2023-04-19" },
  // [CHAIN.KLAYTN]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2022-09-15" },
  [CHAIN.TRON]: { ultraLightNodeV2: "0xc2868Ab0Af30fb32e9ecB4F82E7d27cDFC6FE46c", start: "2024-08-01" },
  // [CHAIN.MERLIN]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-04-01" },
  // [CHAIN.BOB]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-05-01" },
  // [CHAIN.TAIKO]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-05-27" },
  // [CHAIN.SEI]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-05-15" },
  // [CHAIN.ZIRCUIT]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-08-15" },
  [CHAIN.INK]: { ultraLightNodeV2: "0x81a57678343cA220a9029523477715E00e4024bE", start: "2024-12-13" },
  [CHAIN.SONIC]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-01-01" },
  // [CHAIN.SONEIUM]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-01-15" },
  [CHAIN.BERACHAIN]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-02-06" },
  [CHAIN.UNICHAIN]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-02-11" },
  [CHAIN.ABSTRACT]: { ultraLightNodeV2: "0xFe5DFA6B4d6bE848B57dd378b0798aF60F1E6D35", start: "2025-01-27" },
  [CHAIN.STORY]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-02-13" },
  [CHAIN.MONAD]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-02-19" },
  // [CHAIN.HEMI]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-03-01" },
  [CHAIN.PLASMA]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-09-25" },
  [CHAIN.MEGAETH]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-09-01" },
  // [CHAIN.BITLAYER]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-04-01" },
  [CHAIN.PLUME]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-02-01" },
  [CHAIN.KATANA]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2025-05-01" },
  [CHAIN.SOPHON]: { ultraLightNodeV2: "0xFe5DFA6B4d6bE848B57dd378b0798aF60F1E6D35", start: "2025-01-01" },
  // [CHAIN.NIBIRU]: { ultraLightNodeV2: "0xD958989F016b6f64aDEEa935E2C51cbdeC1c83Ed", start: "2025-01-01" },
  // [CHAIN.LISK]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-12-01" },
  // [CHAIN.REYA]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-08-01" },
  [CHAIN.FLARE]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-09-01" },
  // [CHAIN.CRONOS_ZKEVM]: { ultraLightNodeV2: "0xFe5DFA6B4d6bE848B57dd378b0798aF60F1E6D35", start: "2024-10-01" },
  // [CHAIN.ZKLINK]: { ultraLightNodeV2: "0xFe5DFA6B4d6bE848B57dd378b0798aF60F1E6D35", start: "2024-07-01" },
  // [CHAIN.LENS]: { ultraLightNodeV2: "0xFe5DFA6B4d6bE848B57dd378b0798aF60F1E6D35", start: "2025-04-01" },
  // [CHAIN.XDC]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-10-01" },
  // [CHAIN.HEDERA]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-09-01" },
  // [CHAIN.APECHAIN]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-11-01" },
  // [CHAIN.ROOTSTOCK]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-12-01" },
  // [CHAIN.SANKO]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-09-01" },
  // [CHAIN.WC]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-11-01" },
  // [CHAIN.SWELLCHAIN]: { ultraLightNodeV2: "0x980205D352F198748B626f6f7C38A8a5663Ec981", start: "2024-12-01" },
  // [CHAIN.FRAXTAL]: { ultraLightNodeV2: "0x38dE71124f7a447a01D67945a51eDcE9FF491251", start: "2024-02-29" },
};

const fetch = async (options: FetchOptions) => {
  const { chain } = options;
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  const target = config[chain]?.ultraLightNodeV2;
  if (!target) {
    return { dailyFees, dailyRevenue, dailySupplySideRevenue };
  }

  const nativeWithdrawals = await options.getLogs({
    target,
    eventAbi: eventWithdrawNative,
  });
  for (const log of nativeWithdrawals) {
    const amount = log.amount?.toString() ?? "0";
    dailyFees.addGasToken(amount, METRIC.SERVICE_FEES);
    dailySupplySideRevenue.addGasToken(amount, METRIC.SERVICE_FEES);
  }

  const zroToken = ZRO_TOKEN_BY_CHAIN[chain];
  if (zroToken) {
    const zroWithdrawals = await options.getLogs({
      target,
      eventAbi: eventWithdrawZRO,
    });
    for (const log of zroWithdrawals) {
      const amount = log.amount?.toString() ?? "0";
      dailyFees.add(zroToken, amount, METRIC.PROTOCOL_FEES);
      dailyRevenue.add(zroToken, amount, METRIC.PROTOCOL_FEES);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapterChains: Record<string, { start: string }> = {};
for (const [chain, c] of Object.entries(config)) adapterChains[chain] = { start: c.start };

const adapter: Adapter = {
  version: 2,
  // pullHourly: true,
  fetch,
  adapter: adapterChains,
  methodology: {
    Fees: "Native and ZRO fees paid by users for cross-chain messages routed through the LayerZero V1 endpoint, summed from WithdrawNative and WithdrawZRO events on UltraLightNodeV2 contracts across supported chains. Withdrawals lag the actual send() events by the worker/treasury withdrawal cadence; totals converge over time.",
    Revenue: "ZRO protocol fees moved from UltraLightNodeV2 to the LayerZero V1 Treasury contract via WithdrawZRO. Historically the V1 protocol take rate has been ~0, so this value is typically negligible. Tokens flow to the Foundation treasury and are not burnt by the contract.",
    ProtocolRevenue: "ZRO protocol fees collected by the LayerZero V1 Treasury contract.",
    SupplySideRevenue: "Native fees paid out to V1 relayers and oracles via WithdrawNative. Includes a small protocol-native portion when treasury chooses native payment, but in practice the protocol take is ~0 so this is effectively all worker revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SERVICE_FEES]: "Native fees paid out to relayers, oracles, and treasury via WithdrawNative.",
      [METRIC.PROTOCOL_FEES]: "ZRO protocol fees withdrawn from UltraLightNodeV2 by the V1 Treasury contract via WithdrawZRO.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "ZRO protocol fees moved to the V1 Treasury contract.",
    },
    SupplySideRevenue: {
      [METRIC.SERVICE_FEES]: "Native fees paid out to relayers and oracles.",
    },
  },
};

export default adapter;
