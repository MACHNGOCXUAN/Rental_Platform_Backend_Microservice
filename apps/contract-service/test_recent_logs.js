const { PrismaClient } = require('generated/prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Fetching recent contract signature logs...");
  const logs = await prisma.contractSignatureLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  
  console.log("Recent logs found:", logs.length);
  for (const log of logs) {
    console.log(`[${log.createdAt.toISOString()}] Contract: ${log.rentalId} | Action: ${log.action} | Actor: ${log.actorRole} | Details: ${log.details}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
