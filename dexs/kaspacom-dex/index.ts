import { gql, request } from "graphql-request";
import { SimpleAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const GRAPH_URL = "https://graph-kasplex.kaspa.com/subgraphs/name/kasplex-kas-v2-core";
const PAGE_SIZE = 1000;

const methodology = {
  Fees: "Trades incur a 1% swap fee that is entirely paid by users.",
  UserFees: "Users pay the 1% swap fee on each swap.",
  Revenue: "The protocol collects 1/6 of accumulated LP fees when liquidity is moved.",
  ProtocolRevenue: "Factory captures ~0.1667% of swap volume (1/6 of fees) via LP token claims.",
  SupplySideRevenue: "Liquidity providers keep the remaining 5/6 of the 1% swap fee (~0.8333%).",
  HoldersRevenue: "No direct revenue share to token holders.",
};

const pairDayDataQuery = gql`
  query ($date: Int!, $first: Int!, $skip: Int!) {
    pairDayDatas(first: $first, skip: $skip, where: { date: $date }) {
      dailyVolumeKAS
    }
  }
`;

const startQuery = gql`
  query {
    pairDayDatas(first: 1, orderBy: date, orderDirection: asc) {
      date
    }
  }
`;

const fetch: Fetch = async (_timestamp, _chainBlocks, { startOfDay, createBalances }) => {
  let skip = 0;
  let totalVolumeKas = 0;

  while (true) {    
    const response = await request<{
      pairDayDatas: { dailyVolumeKAS: string }[];
    }>(GRAPH_URL, pairDayDataQuery, { date: startOfDay, first: PAGE_SIZE, skip });

    const { pairDayDatas } = response;
    if (!pairDayDatas.length) break;

    totalVolumeKas += pairDayDatas.reduce((acc, { dailyVolumeKAS }) => acc + Number(dailyVolumeKAS ?? 0), 0);

    if (pairDayDatas.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  const dailyVolume = createBalances();
  dailyVolume.addCGToken("kaspa", totalVolumeKas);

  const dailyFees = createBalances();
  const protocolRevenue = createBalances();
  const supplyRevenue = createBalances();

  const totalFeesKas = totalVolumeKas * 0.01;
  const protocolShareKas = totalFeesKas / 6;
  const supplyShareKas = totalFeesKas - protocolShareKas;

  dailyFees.addCGToken("kaspa", totalFeesKas);
  protocolRevenue.addCGToken("kaspa", protocolShareKas);
  supplyRevenue.addCGToken("kaspa", supplyShareKas);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: protocolRevenue,
    dailyProtocolRevenue: protocolRevenue,
    dailySupplySideRevenue: supplyRevenue,
  };
};

const getStart = async () => {
  const response = await request<{ pairDayDatas: { date: number }[] }>(GRAPH_URL, startQuery);
  const earliest = response.pairDayDatas?.[0]?.date;
  return earliest ?? 0;
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.KASPLEX]: {
      fetch,
      start: getStart,
    },
  },
};

export default adapter;

