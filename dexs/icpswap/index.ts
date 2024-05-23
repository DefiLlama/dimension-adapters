import { Adapter, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";

const pairsURL = "https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/pairs";
const volumeURL = (pool_id: string) => `https://uvevg-iyaaa-aaaak-ac27q-cai.raw.ic0.app/totalVolumeUSD?poolId=${pool_id}&limit=1000`;

interface IPairs {
  pool_id: string;
  ticker_id: string;
  base: string;
  target: string;
}

interface IVolume {
  day: string;
  totalVolumeUSD: string;
  volumeUSDChange: string;
  volumeUSD: string;
}
const pairs: IPairs[] = [{"ticker_id": "CHAT_GHOST","base": "CHAT","target": "GHOST","pool_id": "m6cnd-wiaaa-aaaag-qchkq-cai"},{"ticker_id": "TENDY_KINIC","base": "TENDY","target": "KINIC","pool_id": "344ln-paaaa-aaaag-qcdkq-cai"},{"ticker_id": "CHAT_TENDY","base": "CHAT","target": "TENDY","pool_id": "ebw3a-fiaaa-aaaag-qcbda-cai"},{"ticker_id": "DOGMI_ICP","base": "DOGMI","target": "ICP","pool_id": "pkhyt-7iaaa-aaaag-qca7a-cai"},{"ticker_id": "TENDY_BABY AROF token","base": "TENDY","target": "BABY AROF token","pool_id": "3o24u-dqaaa-aaaag-qcdjq-cai"},{"ticker_id": "TENDY_CLOUD","base": "TENDY","target": "CLOUD","pool_id": "2yre7-waaaa-aaaag-qcdmq-cai"},{"ticker_id": "ckBTC_ICP","base": "ckBTC","target": "ICP","pool_id": "xmiu5-jqaaa-aaaag-qbz7q-cai"},{"ticker_id": "CHAT_ICL","base": "CHAT","target": "ICL","pool_id": "yt4cy-4yaaa-aaaag-qce5q-cai"},{"ticker_id": "ICP_NDP","base": "ICP","target": "NDP","pool_id": "yp7ey-cyaaa-aaaag-qblqq-cai"},{"ticker_id": "DMD_ICP","base": "DMD","target": "ICP","pool_id": "3ynik-taaaa-aaaag-qblya-cai"},{"ticker_id": "GHOST_ICP","base": "GHOST","target": "ICP","pool_id": "dwahc-eyaaa-aaaag-qcgnq-cai"},{"ticker_id": "BOX_ICP","base": "BOX","target": "ICP","pool_id": "yg4pe-uqaaa-aaaag-qblra-cai"},{"ticker_id": "KINIC_ICP","base": "KINIC","target": "ICP","pool_id": "335nz-cyaaa-aaaag-qcdka-cai"},{"ticker_id": "GHOST_BABY AROF token","base": "GHOST","target": "BABY AROF token","pool_id": "6vaaf-faaaa-aaaag-qcdwq-cai"},{"ticker_id": "OGY_ICP","base": "OGY","target": "ICP","pool_id": "yu2y5-yaaaa-aaaag-qblsa-cai"},{"ticker_id": "TENDY_ALIEN","base": "TENDY","target": "ALIEN","pool_id": "rghwb-niaaa-aaaag-qccta-cai"},{"ticker_id": "_ICP","base": "","target": "ICP","pool_id": "5ufyj-eiaaa-aaaag-qblpq-cai"},{"ticker_id": "$LAND_ICP","base": "$LAND","target": "ICP","pool_id": "zlslk-3yaaa-aaaag-qblwq-cai"},{"ticker_id": "TENDY_SNS1","base": "TENDY","target": "SNS1","pool_id": "etqmz-jyaaa-aaaag-qcbaa-cai"},{"ticker_id": "🥕_ICP","base": "🥕","target": "ICP","pool_id": "zmtn6-waaaa-aaaag-qblwa-cai"},{"ticker_id": "ICP_","base": "ICP","target": "","pool_id": "f6zug-pqaaa-aaaag-qboiq-cai"},{"ticker_id": "GHOST_SNS1","base": "GHOST","target": "SNS1","pool_id": "p4xq4-gyaaa-aaaag-qchbq-cai"},{"ticker_id": "TENDY_SPICE","base": "TENDY","target": "SPICE","pool_id": "to5je-7iaaa-aaaag-qcc7a-cai"},{"ticker_id": "ICYPEES_SPICE","base": "ICYPEES","target": "SPICE","pool_id": "tj4pq-sqaaa-aaaag-qcc7q-cai"},{"ticker_id": "STAR_ICP","base": "STAR","target": "ICP","pool_id": "y2yvv-dqaaa-aaaag-qblta-cai"},{"ticker_id": "ICP_ALIEN","base": "ICP","target": "ALIEN","pool_id": "r5cke-xqaaa-aaaag-qccrq-cai"},{"ticker_id": "GHOST_WOJAKIC","base": "GHOST","target": "WOJAKIC","pool_id": "62vrv-pyaaa-aaaag-qcigq-cai"},{"ticker_id": "WOJAKIC_ICP","base": "WOJAKIC","target": "ICP","pool_id": "qckzt-uiaaa-aaaag-qccva-cai"},{"ticker_id": "ICYPEES_ICP","base": "ICYPEES","target": "ICP","pool_id": "y5ztb-oiaaa-aaaag-qbltq-cai"},{"ticker_id": "TENDY_OGY","base": "TENDY","target": "OGY","pool_id": "vlws3-6iaaa-aaaag-qccja-cai"},{"ticker_id": "ICL_ICP","base": "ICL","target": "ICP","pool_id": "zqxxp-baaaa-aaaag-qblua-cai"},{"ticker_id": "PLAT_ICP","base": "PLAT","target": "ICP","pool_id": "3rodw-fiaaa-aaaag-qblzq-cai"},{"ticker_id": "SONICX_ICP","base": "SONICX","target": "ICP","pool_id": "6ktdw-kyaaa-aaaag-qcejq-cai"},{"ticker_id": "TENDY_GHOST","base": "TENDY","target": "GHOST","pool_id": "3kmdc-wqaaa-aaaag-qceua-cai"},{"ticker_id": "CHAT_ckBTC","base": "CHAT","target": "ckBTC","pool_id": "nm7k6-wyaaa-aaaag-qcasa-cai"},{"ticker_id": "XCANIC_SNS1","base": "XCANIC","target": "SNS1","pool_id": "ntmjn-zaaaa-aaaag-qchna-cai"},{"ticker_id": "SPICE_SNS1","base": "SPICE","target": "SNS1","pool_id": "howsv-wqaaa-aaaag-qcgua-cai"},{"ticker_id": "HOT_ICP","base": "HOT","target": "ICP","pool_id": "rxwy2-zaaaa-aaaag-qcfna-cai"},{"ticker_id": "BABY AROF token_ICP","base": "BABY AROF token","target": "ICP","pool_id": "s7qlk-oaaaa-aaaag-qbnvq-cai"},{"ticker_id": "EMC_ICP","base": "EMC","target": "ICP","pool_id": "fx5dl-qyaaa-aaaag-qcbga-cai"},{"ticker_id": "WHALE_ICP","base": "WHALE","target": "ICP","pool_id": "zzu4t-xiaaa-aaaag-qblvq-cai"},{"ticker_id": "GHOST_GHOST","base": "GHOST","target": "GHOST","pool_id": "ddhwp-fqaaa-aaaag-qcgoa-cai"},{"ticker_id": "ICP_SPICE","base": "ICP","target": "SPICE","pool_id": "x7ixp-3iaaa-aaaag-qccha-cai"},{"ticker_id": "DOGMI_DOGMI","base": "DOGMI","target": "DOGMI","pool_id": "pdetp-jaaaa-aaaag-qca6q-cai"},{"ticker_id": "CHAT_ICP","base": "CHAT","target": "ICP","pool_id": "ne2vj-6yaaa-aaaag-qb3ia-cai"},{"ticker_id": "TENDY_ICYPEES","base": "TENDY","target": "ICYPEES","pool_id": "png6h-sqaaa-aaaag-qca7q-cai"},{"ticker_id": "GHOST_ICP","base": "GHOST","target": "ICP","pool_id": "yi6cm-paaaa-aaaag-qblqa-cai"},{"ticker_id": "AVOCADO_ICP","base": "AVOCADO","target": "ICP","pool_id": "zfqgc-aiaaa-aaaag-qblxq-cai"},{"ticker_id": "GHOST_TENDY","base": "GHOST","target": "TENDY","pool_id": "on5od-6qaaa-aaaag-qchea-cai"},{"ticker_id": "TENDY_ckBTC","base": "TENDY","target": "ckBTC","pool_id": "dswyu-ryaaa-aaaag-qcbqa-cai"},{"ticker_id": "GHOST_EMC","base": "GHOST","target": "EMC","pool_id": "psv5u-5iaaa-aaaag-qchaq-cai"},{"ticker_id": "DOGMI_ICP","base": "DOGMI","target": "ICP","pool_id": "yt36j-vyaaa-aaaag-qblsq-cai"},{"ticker_id": "01_ICP","base": "01","target": "ICP","pool_id": "37mo6-6yaaa-aaaag-qblyq-cai"},{"ticker_id": "CHAT_GHOST","base": "CHAT","target": "GHOST","pool_id": "nl6mk-3aaaa-aaaag-qcasq-cai"},{"ticker_id": "TENDY_","base": "TENDY","target": "","pool_id": "w7thl-xiaaa-aaaag-qcf4q-cai"},{"ticker_id": "ICD_ICP","base": "ICD","target": "ICP","pool_id": "zxwr3-myaaa-aaaag-qbluq-cai"},{"ticker_id": "XCANIC_ICP","base": "XCANIC","target": "ICP","pool_id": "z6v2h-2qaaa-aaaag-qblva-cai"},{"ticker_id": "TENDY_EMC","base": "TENDY","target": "EMC","pool_id": "q2y4u-wiaaa-aaaag-qcfkq-cai"},{"ticker_id": "ICP_SNS1","base": "ICP","target": "SNS1","pool_id": "3ejs3-eaaaa-aaaag-qbl2a-cai"},{"ticker_id": "WOJAKIC_GHOST","base": "WOJAKIC","target": "GHOST","pool_id": "5rdhw-jaaaa-aaaag-qcima-cai"},{"ticker_id": "CLOUD_ICP","base": "CLOUD","target": "ICP","pool_id": "3s6gf-uqaaa-aaaag-qcdlq-cai"},{"ticker_id": "ckBTC_SNS1","base": "ckBTC","target": "SNS1","pool_id": "nx2w3-maaaa-aaaag-qcaqq-cai"},{"ticker_id": "ICL_TENDY","base": "ICL","target": "TENDY","pool_id": "eivq4-taaaa-aaaag-qcbcq-cai"},{"ticker_id": "CHAT_","base": "CHAT","target": "","pool_id": "nzy3t-xqaaa-aaaag-qcarq-cai"},{"ticker_id": "TENDY_ICP","base": "TENDY","target": "ICP","pool_id": "ojlrv-lqaaa-aaaag-qcazq-cai"}];

const fetch  = async (timestamp: number): Promise<FetchResultVolume> => {
  const pools = pairs.map((e: IPairs) => e.pool_id);
  const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(todayTimestamp) / 86400)
  const historicalVolume: IVolume[]  = (await Promise.all(pools.map((e: string) => fetchURL(volumeURL(e))))).map((e: any) => e).flat();
  const dailyVolume = historicalVolume.filter((e: IVolume) => Number(e.day) === dateId)
    .reduce((a: number, b: IVolume) => a + Number(b.volumeUSD), 0)
  const totalVolume = historicalVolume.filter((e: IVolume) => Number(e.day) <= dateId)
    .reduce((a: number, b: IVolume) => a + Number(b.totalVolumeUSD), 0)
  return {
    dailyVolume: `${dailyVolume}`,
    totalVolume: `${totalVolume}`,
    timestamp
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ICP]: {
      fetch: fetch,
      start: 1689465600,
    },
  }
}

export default adapter;
