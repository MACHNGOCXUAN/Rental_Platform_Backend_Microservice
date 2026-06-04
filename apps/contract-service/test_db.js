const { PrismaClient } = require('generated/prisma/client');
const prisma = new PrismaClient();

async function main() {
  const contractId = '4180a068-8d6e-488c-b6f2-95ebe43a0791';
  const contract = await prisma.rentalContract.findUnique({
    where: { rentalId: contractId },
    include: { parentContract: true, childContracts: true }
  });
  
  if (contract) {
     console.log("DB Contract Status:", contract.status);
     console.log("DB Contract isActive:", contract.isActive);
  } else {
     console.log("Contract not found in DB.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
