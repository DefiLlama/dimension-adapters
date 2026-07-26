import BigNumber from "bignumber.js";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

// https://docs.hydroprotocol.finance/lending
const LOAN_CONTRACT = "inj1nuw6ala2ra7t457tg4g04k67r94v55mdyq9klr";
const INJECTIVE_LCD = "https://lcd.injective.network";

function encodeQuery(msg: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(msg)).toString("base64");
}

async function queryContract(msg: Record<string, unknown>): Promise<any> {
  const query = encodeURIComponent(encodeQuery(msg));
  const res = await httpGet(`${INJECTIVE_LCD}/cosmwasm/wasm/v1/contract/${LOAN_CONTRACT}/smart/${query}`);
  return res.data;
}

type Denom = { native: string } | { cw20: string };

function denomToAddress(denom: Denom): string {
  if ("native" in denom) return denom.native.replace(/^erc20:/, "");
  return denom.cw20;
}

type AssetState = {
  denom: Denom;
  borrower_interest_rate: string;
  depositor_interest_rate: string;
  collateral: { share: string; amount: string };
  debt: { share: string; amount: string };
  fee_amount: string;
};

type AssetConfig = {
  decimals: number;
  interest_fee_ratio: string;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const PAGE_LIMIT = 100;
  const asset_states: AssetState[] = [];
  let startAfter: Denom | undefined;

  do {
    const page: { asset_states: AssetState[] } = await queryContract({
      asset_states: { limit: PAGE_LIMIT, ...(startAfter && { start_after: startAfter }) },
    });
    asset_states.push(...page.asset_states);
    if (page.asset_states.length < PAGE_LIMIT) break;
    startAfter = page.asset_states[page.asset_states.length - 1].denom;
  } while (true);

  await Promise.all(
    asset_states.map(async (assetState) => {
      const debtAmount = new BigNumber(assetState.debt.amount);
      if (debtAmount.isZero()) return;

      const borrowRate = new BigNumber(assetState.borrower_interest_rate);
      if (borrowRate.isZero()) return;

      const config: AssetConfig = await queryContract({ asset_config: { denom: assetState.denom } });
      const feeRatio = new BigNumber(config.interest_fee_ratio);

      const dailyInterest = debtAmount.times(borrowRate).div(365).integerValue(BigNumber.ROUND_DOWN);
      const protocolFee = dailyInterest.times(feeRatio).integerValue(BigNumber.ROUND_DOWN);
      const supplySide = dailyInterest.minus(protocolFee);

      const address = denomToAddress(assetState.denom);
      dailyFees.add(address, dailyInterest.toString(), METRIC.BORROW_INTEREST);
      dailyRevenue.add(address, protocolFee.toString(), METRIC.PROTOCOL_FEES);
      dailySupplySideRevenue.add(address, supplySide.toString(), METRIC.BORROW_INTEREST);
    })
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Daily interest paid by borrowers across all Hydro lending markets. Liquidation fees are not tracked as liquidations are currently disabled.",
  Revenue: "Protocol's share of borrow interest, set per market by the interest fee ratio parameter.",
  ProtocolRevenue: "Protocol's share of borrow interest, set per market by the interest fee ratio parameter.",
  SupplySideRevenue: "Borrow interest distributed to lenders after the protocol fee is deducted.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest paid by borrowers on their outstanding debt.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Reserve factor portion of borrow interest retained by the protocol treasury.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Reserve factor portion of borrow interest retained by the protocol treasury.",
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: "Interest earned by depositors after the protocol fee is deducted.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.INJECTIVE],
  fetch,
  start: "2024-09-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
