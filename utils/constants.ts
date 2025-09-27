// LayerZero EndpointV2 addresses by chain ID. TODO: Get this from the .json file?
export const ENDPOINT_V2_ADDRESSES: Record<string, string> = {
  // Mainnets
  "1": "0x1a44076050125825900e736c501f859c50fE728c", // Ethereum
  "137": "0x1a44076050125825900e736c501f859c50fE728c", // Polygon
  "42161": "0x1a44076050125825900e736c501f859c50fE728c", // Arbitrum
  "56": "0x1a44076050125825900e736c501f859c50fE728c", // BSC
  "43114": "0x1a44076050125825900e736c501f859c50fE728c", // Avalanche
  "146": "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B", // Sonic

  // Testnets
  "11155111": "0x6EDCE65403992e310A62460808c4b910D972f10f", // Sepolia
  "421614": "0x6EDCE65403992e310A62460808c4b910D972f10f", // Arbitrum Sepolia
  "80002": "0x6EDCE65403992e310A62460808c4b910D972f10f" // Polygon Amoy
};

export const FT_TOKEN_ADDRESSES: Record<string, string> = {
  // Mainnets
  "146": require(`../deployments/sonic-mainnet/FT.json`).address,
  "43114": require(`../deployments/avalanche-mainnet/FT.json`).address
  // Testnets
};

export const RECEIVE_CONFIRMATIONS: Record<string, number> = {
  // Mainnets
  "1": 12, // Ethereum
  "137": 20, // Polygon
  "42161": 20, // Arbitrum
  "56": 10, // BSC
  "43114": 1, // Avalanche
  "146": 1, // Sonic

  // Testnets
  "11155111": 1, // Sepolia
  "421614": 1, // Arbitrum Sepolia
  "80002": 1 // Polygon Amoy
}

export const FT_DELEGATE_ADDRESSES: Record<string, string> = {
  // Mainnets
  "146": "0x3419E83fe5583028e056b1aa5E62601D80799572",
  "43114": "0x3419E83fe5583028e056b1aa5E62601D80799572"
};

export const FT_CONFIGURATOR_ADDRESSES: Record<string, string> = {
  // Mainnets
  "146": "0x3419E83fe5583028e056b1aa5E62601D80799572",
  "43114": "0x3419E83fe5583028e056b1aa5E62601D80799572"
};

export const TOKEN_CONTRACT_NAME = 'FT'
