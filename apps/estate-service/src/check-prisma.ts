import { DatabaseService } from './common/services/database.service';

async function main() {
  const prisma = new DatabaseService();
  try {
    console.log("=== UPDATING DATABASE PROPERTIES ===");
    
    // Đếm số lượng ban đầu
    const totalBefore = await prisma.property.count();
    console.log("Tổng số tin đăng trong DB trước khi update:", totalBefore);

    // Cập nhật tất cả properties
    const updateResult = await prisma.property.updateMany({
      data: {
        isListingExpired: false,
        listingExpiresAt: new Date("2030-01-01T00:00:00Z"),
        status: "active",
        approvalStatus: "approved",
        deletedAt: null
      }
    });

    console.log(`Đã cập nhật thành công ${updateResult.count} tin đăng thành trạng thái hoạt động (Active & Approved & Hạn năm 2030).`);

    // Đếm lại số lượng tin hoạt động
    const activeAndApprovedCount = await prisma.property.count({
      where: {
        status: 'active',
        approvalStatus: 'approved',
        deletedAt: null,
        isListingExpired: false
      }
    });
    console.log("Tổng số tin đăng hiển thị công khai (đáp ứng API home page):", activeAndApprovedCount);

  } catch (err) {
    console.error("Lỗi khi cập nhật dữ liệu database:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();

