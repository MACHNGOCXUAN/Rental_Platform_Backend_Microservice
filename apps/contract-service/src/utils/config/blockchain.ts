import { ethers } from "ethers";

const RPC_URL = process.env.BLOCKCHAIN_RPC_URL;
const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.BLOCKCHAIN_CONTRACT_ADDRESS;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY!, provider);

const ABI = [
  "function registerContract(string memory contractId, bytes32 contractHash)",
  "function contracts(string memory) view returns (bytes32 contractHash, bool exists)"
];

const contract = new ethers.Contract(CONTRACT_ADDRESS!, ABI, wallet);

export default contract;