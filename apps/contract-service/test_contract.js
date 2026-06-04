const { ethers } = require('ethers');

async function main() {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const ABI = [
    `function contracts(string) view returns (
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
    )`
  ];
  const contractAddress = '0x0B306BF915C4d645ff596e518fAf3F9669b97016';
  const contract = new ethers.Contract(contractAddress, ABI, provider);

  const contractId = '4180a068-8d6e-488c-b6f2-95ebe43a0791';
  const record = await contract.contracts(contractId);
  console.log("Record array:");
  console.log(record);
  console.log("Version:", record.version);
  console.log("Status:", record.status);
}

main().catch(console.error);
