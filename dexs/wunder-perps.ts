import { exportBuilderAdapter } from '../helpers/hyperliquid'

// https://wundertrading.com/en

const START = '2025-10-19';
const HL_BUILDER_ADDRESS = '0x75982eb8b734b24b653b39e308489a428041f162';

export default exportBuilderAdapter([HL_BUILDER_ADDRESS], { start: START })
