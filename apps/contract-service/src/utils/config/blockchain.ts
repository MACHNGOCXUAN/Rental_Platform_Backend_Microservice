import { ethers } from "ethers";

// ================= ENV =================
const RPC_URL = process.env.BLOCKCHAIN_RPC_URL!;
const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY!;
const CONTRACT_ADDRESS = process.env.BLOCKCHAIN_CONTRACT_ADDRESS!;

// ================= PROVIDER =================
const provider = new ethers.JsonRpcProvider(RPC_URL);

// ================= WALLET (BACKEND SIGNER) =================
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// ================= ABI =================
const ABI = [

  // ===== CONTRACT =====
  `function registerContract(
      string contractId,
      string propertyId,
      bytes32 contractHash,
      string landlordId,
      string tenantId
  )`,

  `function updateContractHash(
      string contractId,
      bytes32 newHash
  )`,

  `function terminateContract(
      string contractId
  )`,

  `function verifyContract(
      string contractId,
      bytes32 hashToCheck
  ) view returns (bool)`,

  // ===== PAYMENT (BACKEND ONLY) =====
  `function recordPayment(
      string paymentId,
      string contractId,
      string userId,
      uint256 amount,
      bytes32 paymentHash,
      uint8 paymentType,
      uint8 provider,
      string externalTxId
  )`,

  `function verifyPayment(
      string paymentId,
      bytes32 hashToCheck
  ) view returns (bool)`,

  // ===== GET CONTRACT =====
  `function contracts(string)
    view returns (
      string contractId,
      string propertyId,
      bytes32 contractHash,
      string landlordId,
      string tenantId,
      uint256 version,
      uint256 signedAt,
      uint256 updatedAt,
      uint8 status,
      bool exists
    )`,

  // ===== GET PAYMENT =====
  `function payments(string)
    view returns (
      string paymentId,
      string contractId,
      string userId,
      uint256 amount,
      bytes32 paymentHash,
      uint8 paymentType,
      uint8 provider,
      string externalTxId,
      uint256 paidAt,
      bool verified,
      bool exists
    )`,

  // ===== EVENTS =====
  `event ContractRegistered(
      string contractId,
      string propertyId,
      bytes32 contractHash,
      string landlordId,
      string tenantId,
      uint256 version,
      uint256 signedAt
  )`,

  `event ContractUpdated(
      string contractId,
      bytes32 newHash,
      uint256 version,
      uint256 updatedAt
  )`,

  `event ContractTerminated(
      string contractId,
      uint256 terminatedAt
  )`,

  `event PaymentRecorded(
      string paymentId,
      string contractId,
      string userId,
      uint256 amount,
      uint8 paymentType,
      uint8 provider,
      string externalTxId,
      uint256 paidAt
  )`
];

// ================= CONTRACT INSTANCE =================
const contract = new ethers.Contract(
  CONTRACT_ADDRESS,
  ABI,
  wallet
);

export default contract;