import { httpPost } from "../../utils/fetchURL";
import { ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";

type ChainConfig = {
  chain: string;
  subscanName: string;
};

const subscanStatsChains: Record<string, ChainConfig> = {
  polkadot: { chain: CHAIN.POLKADOT, subscanName: "polkadot" },
  pendulum: { chain: CHAIN.PENDULUM, subscanName: "pendulum" },
  peaq: { chain: CHAIN.PEAQ, subscanName: "peaq" },
  neuroweb: { chain: CHAIN.NEUROWEB, subscanName: "neuroweb" },
  mythos: { chain: CHAIN.MYTHOS, subscanName: "mythos" },
  moonbeam: { chain: CHAIN.MOONBEAM, subscanName: "moonbeam" },
  karura: { chain: CHAIN.KARURA, subscanName: "karura" },
  kusama: { chain: CHAIN.KUSAMA, subscanName: "kusama" },
  hydration: { chain: CHAIN.HYDRADX, subscanName: "hydration" },
  robonomics: { chain: CHAIN.ROBONOMICS, subscanName: "robonomics" },
  darwinia: { chain: CHAIN.DARWINIA, subscanName: "darwinia" },
};

function fetchSubscanDaily(subscanName: string, category: string, date: string) {
  const apikey = getEnv("SUBSCAN_API_KEY");
  if (!apikey) throw new Error("SUBSCAN_API_KEY is not set");
  return httpPost(
    `https://${subscanName}.api.subscan.io/api/v2/scan/daily`,
    { category, start: date, end: date, format: "day" },
    { headers: { "Content-Type": "application/json", "X-API-Key": apikey } },
  );
}

function getSubscanUsers(config: ChainConfig) {
  return async (start: number, _end: number) => {
    const date = new Date((start + 1) * 1e3).toISOString().slice(0, 10);
    const [activeRes, extrinsicRes] = await Promise.all([
      fetchSubscanDaily(config.subscanName, "ActiveAccount", date),
      fetchSubscanDaily(config.subscanName, "extrinsic", date),
    ]);
    if (activeRes.code !== 0) throw new Error(`Subscan ActiveAccount API failed for ${config.subscanName}: ${activeRes.message}`);
    if (extrinsicRes.code !== 0) throw new Error(`Subscan extrinsic API failed for ${config.subscanName}: ${extrinsicRes.message}`);
    const activeData = activeRes.data?.list?.[0];
    const extrinsicData = extrinsicRes.data?.list?.[0];
    return [{
      usercount: Number(activeData.total),
      txcount: Number(extrinsicData.total),
    }];
  };
}

function getSubscanNewUsers(config: ChainConfig) {
  return async (start: number, _end: number) => {
    const date = new Date((start + 1) * 1e3).toISOString().slice(0, 10);
    const res = await fetchSubscanDaily(config.subscanName, "NewAccount", date);
    if (res.code !== 0) throw new Error(`Subscan NewAccount API failed for ${config.subscanName}: ${res.message}`);
    const data = res.data?.list?.[0];
    return [{
      usercount: Number(data.total),
    }];
  };
}

export const subscanStatsExports = Object.entries(subscanStatsChains).map(([id, config]) => ({
  name: id,
  id,
  chain: config.chain,
  protocolType: ProtocolType.CHAIN,
  getUsers: getSubscanUsers(config),
  getNewUsers: getSubscanNewUsers(config),
}));
