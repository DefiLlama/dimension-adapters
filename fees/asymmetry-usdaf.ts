import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { defaultV2BreakdownMethodology, defaultV2methodology, getLiquityV2LogAdapter } from "../helpers/liquity";

async function fetch(options: FetchOptions) {
  const v0DeploymentRes = await getLiquityV2LogAdapter({
    collateralRegistry: "0xCFf0DcAb01563e5324ef9D0AdB0677d9C167d791",
    stabilityPoolRatio: 1,
    revenueRatio: 0,
  })(options);
  const dailyFees = v0DeploymentRes.dailyFees.clone();
  const dailyRevenue = v0DeploymentRes.dailyRevenue.clone();
  const dailySupplySideRevenue = v0DeploymentRes.dailySupplySideRevenue.clone();

  let v1DeploymentRes = null;
  if (options.startTimestamp >= 1753161467) {
    v1DeploymentRes = await getLiquityV2LogAdapter({
      collateralRegistry: "0x33d68055cd54061991b2e98b9ab326ffce4d60fe",
      stabilityPoolRatio: 1,
      revenueRatio: 0,
    })(options);
    dailyFees.addBalances(v1DeploymentRes.dailyFees);
    dailyRevenue.addBalances(v1DeploymentRes.dailyRevenue);
    dailySupplySideRevenue.addBalances(v1DeploymentRes.dailySupplySideRevenue);
  }
  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
}

export default {
  version: 2,
  methodology: defaultV2methodology,
  breakdownMethodology: defaultV2BreakdownMethodology,
  fetch,
  start: '2025-03-26',
  chains: [CHAIN.ETHEREUM],
};
