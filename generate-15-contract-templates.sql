-- ============================================
-- AUTO SEED: 15 CONTRACT TEMPLATES
-- 5 PropertyType x 3 ContractTemplateType
-- KHONG DUNG VAO BO DATA GOC
-- ============================================

BEGIN;

-- Xoa bo template auto-generate truoc do (khong anh huong data goc)
DELETE FROM contract_templates
WHERE description LIKE '%';

WITH property_configs AS (
  SELECT *
  FROM (
    VALUES
      ('apartment', 'Chung Cư', 'THÔNG TIN CĂN HỘ', 'Tên căn hộ', '#1a3a5c', '#2d6a9f', '#f0f4f8', '#e8edf3'),
      ('house', 'Nhà Riêng', 'THÔNG TIN NHÀ CHO THUÊ', 'Tên nhà', '#7c4d1e', '#b5742e', '#f5f0eb', '#ede8e3'),
      ('land', 'Đất Nền', 'THÔNG TIN LÔ ĐẤT', 'Tên lô đất', '#0f766e', '#14b8a6', '#ecfeff', '#cffafe'),
      ('office', 'Văn Phòng', 'THÔNG TIN VĂN PHÒNG', 'Tên văn phòng', '#1f2937', '#4b5563', '#f3f4f6', '#e5e7eb'),
      ('room', 'Phòng Trọ', 'THÔNG TIN PHÒNG TRỌ', 'Tên phòng', '#1e4d2b', '#2d7a42', '#f0f7f3', '#dff2e5')
  ) AS p(
    property_type,
    property_label,
    section_title,
    property_name_label,
    primary_color,
    secondary_color,
    bg_from,
    bg_to
  )
),
template_type_configs AS (
  SELECT *
  FROM (
    VALUES
      ('standard', 'Chuẩn', 'Mẫu chuẩn', 'mẫu tiêu chuẩn', 5, 100000, false, 30, 2000000),
      ('custom', 'Tùy chỉnh', 'Mẫu tùy chỉnh', 'mẫu tùy chỉnh theo thỏa thuận', 3, 120000, true, 20, 2500000),
      ('government', 'Nhà nước', 'Mẫu tham chiếu nhà nước', 'mẫu tham chiếu theo biểu mẫu nhà nước', 7, 80000, false, 45, 1500000)
  ) AS t(
    template_type,
    type_label,
    template_badge,
    type_description,
    grace_days,
    late_fee_per_day,
    auto_renewal,
    renewal_notice_days,
    early_termination_fee
  )
),
base_template AS (
  SELECT $$<div style="overflow-y:auto;background:linear-gradient(135deg,__BG_FROM__ 0%,__BG_TO__ 100%);min-height:100vh;padding:20px 0;word-break:break-word;overflow-wrap:anywhere;">
<div style="margin:0 auto;background:#fff;box-shadow:0 16px 48px rgba(0,0,0,0.12);max-width:794px;width:calc(100% - 24px);font-family:'Times New Roman',Times,serif;border-top:6px solid __PRIMARY__;overflow:hidden;">
<div style="background:linear-gradient(135deg,__PRIMARY__ 0%,__SECONDARY__ 100%);padding:30px 56px;text-align:center;color:#fff;">
  <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:0.82;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
  <div style="font-size:13px;font-style:italic;opacity:0.9;margin:4px 0 14px;">Độc lập - Tự do - Hạnh phúc</div>
  <div style="width:64px;height:2px;background:rgba(255,255,255,0.45);margin:0 auto 14px;"></div>
  <h1 style="font-size:24px;font-weight:bold;letter-spacing:1.6px;margin:0 0 8px 0;text-transform:uppercase;">__TITLE__</h1>
  <div style="font-size:13px;opacity:0.9;">Số: <strong>{{contract.contractNumber}}</strong></div>
  <div style="font-size:12px;opacity:0.8;margin-top:4px;">Ngày {{contract.contractDate}} - {{contract.location}}</div>
  <div style="font-size:11px;opacity:0.9;margin-top:8px;">__TEMPLATE_BADGE__</div>
</div>

<div style="padding:34px 56px;">
  <div style="background:#f8fafc;border-left:4px solid __SECONDARY__;padding:12px 16px;margin-bottom:22px;border-radius:0 6px 6px 0;font-size:12px;color:#374151;line-height:1.7;">
    Căn cứ Bộ luật Dân sự năm 2015, Luật Nhà ở năm 2014 và các quy định pháp luật liên quan; hai bên cùng thỏa thuận ký kết hợp đồng thuê với các điều khoản sau.
  </div>

  <section style="margin-bottom:20px;">
    <div style="display:flex;align-items:center;margin-bottom:10px;">
      <div style="background:__PRIMARY__;color:#fff;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:3px;margin-right:10px;">I</div>
      <h3 style="font-size:13px;font-weight:bold;color:__PRIMARY__;margin:0;text-transform:uppercase;letter-spacing:1px;">THÔNG TIN CÁC BÊN</h3>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <table style="width:100%;font-size:12px;line-height:1.8;border-collapse:collapse;table-layout:fixed;">
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:7px 12px;font-weight:600;color:#374151;width:34%;background:#fafafa;vertical-align:top;">Bên cho thuê (Bên A):</td><td style="padding:7px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{owner.name}} - {{owner.phone}} - {{owner.idNumber}}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:7px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Địa chỉ bên A:</td><td style="padding:7px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{owner.address}}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:7px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Bên thuê (Bên B):</td><td style="padding:7px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{tenant.name}} - {{tenant.phone}} - {{tenant.idNumber}}</td></tr>
        <tr><td style="padding:7px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Địa chỉ bên B:</td><td style="padding:7px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{tenant.address}}</td></tr>
      </table>
    </div>
  </section>

  <section style="margin-bottom:20px;">
    <div style="display:flex;align-items:center;margin-bottom:10px;">
      <div style="background:__PRIMARY__;color:#fff;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:3px;margin-right:10px;">II</div>
      <h3 style="font-size:13px;font-weight:bold;color:__PRIMARY__;margin:0;text-transform:uppercase;letter-spacing:1px;">__SECTION_TITLE__</h3>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <table style="width:100%;font-size:12px;line-height:1.8;border-collapse:collapse;table-layout:fixed;">
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:7px 12px;font-weight:600;color:#374151;width:34%;background:#fafafa;vertical-align:top;">__PROPERTY_NAME_LABEL__:</td><td style="padding:7px 12px;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{property.name}}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:7px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Địa chỉ:</td><td style="padding:7px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{property.address}}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:7px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Loại hình:</td><td style="padding:7px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{property.type}}</td></tr>
        <tr><td style="padding:7px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Diện tích sử dụng:</td><td style="padding:7px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{property.area}} m²</td></tr>
      </table>
    </div>
  </section>

  <section style="margin-bottom:20px;">
    <div style="display:flex;align-items:center;margin-bottom:10px;">
      <div style="background:__PRIMARY__;color:#fff;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:3px;margin-right:10px;">III</div>
      <h3 style="font-size:13px;font-weight:bold;color:__PRIMARY__;margin:0;text-transform:uppercase;letter-spacing:1px;">THỜI HẠN VÀ GIÁ THUÊ</h3>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <table style="width:100%;font-size:12px;line-height:1.8;border-collapse:collapse;table-layout:fixed;">
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px;font-weight:600;color:#374151;width:34%;background:#fafafa;vertical-align:top;">Ngày bắt đầu:</td><td style="padding:8px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{contract.startDate}}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Ngày kết thúc:</td><td style="padding:8px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{contract.endDate}}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Thời hạn:</td><td style="padding:8px 12px;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{contract.durationMonths}} tháng</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Tiền thuê/tháng:</td><td style="padding:8px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;"><span style="color:#dc2626;font-weight:bold;">{{property.monthlyRent}} VNĐ</span></td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:8px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Tiền đặt cọc:</td><td style="padding:8px 12px;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{property.depositAmount}} VNĐ</td></tr>
        <tr><td style="padding:8px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Ngày thanh toán:</td><td style="padding:8px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">Ngày {{contract.paymentDueDay}}/tháng</td></tr>
      </table>
    </div>
  </section>

  <section style="margin-bottom:20px;">
    <div style="display:flex;align-items:center;margin-bottom:10px;">
      <div style="background:__PRIMARY__;color:#fff;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:3px;margin-right:10px;">IV</div>
      <h3 style="font-size:13px;font-weight:bold;color:__PRIMARY__;margin:0;text-transform:uppercase;letter-spacing:1px;">CHI PHÍ DỊCH VỤ HÀNG THÁNG</h3>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <table style="width:100%;font-size:12px;line-height:1.85;border-collapse:collapse;table-layout:fixed;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;font-size:11px;width:28%;">Loại phí</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;font-size:11px;width:32%;">Đơn giá</th>
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;font-size:11px;">Ghi chú</th>
          </tr>
        </thead>
        <tr style="border-top:1px solid #f0f0f0;"><td style="padding:6px 12px;vertical-align:top;">Tiền điện</td><td style="padding:6px 12px;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{property.electricityCostPerKwh}} VNĐ/kWh</td><td style="padding:6px 12px;color:#6b7280;font-size:11px;vertical-align:top;">Theo công tơ điện</td></tr>
        <tr style="border-top:1px solid #f0f0f0;background:#fafafa;"><td style="padding:6px 12px;vertical-align:top;">Tiền nước</td><td style="padding:6px 12px;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{property.waterCostPerM3}} VNĐ/m³</td><td style="padding:6px 12px;color:#6b7280;font-size:11px;vertical-align:top;">Theo đồng hồ nước</td></tr>
        <tr style="border-top:1px solid #f0f0f0;"><td style="padding:6px 12px;vertical-align:top;">Phí internet</td><td style="padding:6px 12px;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{property.internetFee}} VNĐ/tháng</td><td style="padding:6px 12px;color:#6b7280;font-size:11px;vertical-align:top;">Cố định hàng tháng</td></tr>
        <tr style="border-top:1px solid #f0f0f0;background:#fafafa;"><td style="padding:6px 12px;vertical-align:top;">Phí gửi xe</td><td style="padding:6px 12px;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{property.parkingFee}} VNĐ/tháng</td><td style="padding:6px 12px;color:#6b7280;font-size:11px;vertical-align:top;">Theo thỏa thuận</td></tr>
        <tr style="border-top:1px solid #f0f0f0;"><td style="padding:6px 12px;vertical-align:top;">Phí quản lý</td><td style="padding:6px 12px;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{property.managementFee}} VNĐ/tháng</td><td style="padding:6px 12px;color:#6b7280;font-size:11px;vertical-align:top;">Theo quy định khu vực</td></tr>
      </table>
    </div>
  </section>

  <section style="margin-bottom:22px;">
    <div style="display:flex;align-items:center;margin-bottom:10px;">
      <div style="background:__PRIMARY__;color:#fff;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:3px;margin-right:10px;">V</div>
      <h3 style="font-size:13px;font-weight:bold;color:__PRIMARY__;margin:0;text-transform:uppercase;letter-spacing:1px;">ĐIỀU KHOẢN PHẠT VÀ BỔ SUNG</h3>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <table style="width:100%;font-size:12px;line-height:1.85;border-collapse:collapse;table-layout:fixed;">
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:7px 12px;font-weight:600;color:#374151;width:34%;background:#fafafa;vertical-align:top;">Ân hạn thanh toán:</td><td style="padding:7px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{contract.gracePeriodDays}} ngày</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:7px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Phí phạt thanh toán trễ:</td><td style="padding:7px 12px;color:#dc2626;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{contract.lateFeePerDay}} VNĐ/ngày</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:7px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Tự động gia hạn:</td><td style="padding:7px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{contract.autoRenewal}}</td></tr>
        <tr style="border-bottom:1px solid #f0f0f0;"><td style="padding:7px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Thông báo trước gia hạn:</td><td style="padding:7px 12px;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{contract.renewalNoticeDays}} ngày</td></tr>
        <tr><td style="padding:7px 12px;font-weight:600;color:#374151;background:#fafafa;vertical-align:top;">Phí chấm dứt sớm:</td><td style="padding:7px 12px;color:#dc2626;font-weight:600;vertical-align:top;word-break:break-word;overflow-wrap:anywhere;">{{contract.earlyTerminationFee}} VNĐ</td></tr>
      </table>
    </div>
  </section>

  <section style="margin-bottom:24px;">
    <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:12px 14px;font-size:12px;line-height:1.7;margin-bottom:8px;">
      <div style="font-size:11px;font-weight:bold;color:__PRIMARY__;text-transform:uppercase;margin-bottom:8px;">Điều khoản chung</div>
      <p style="margin:0;white-space:pre-wrap;color:#374151;word-break:break-word;overflow-wrap:anywhere;">{{custom.generalTerms}}</p>
    </div>
    <div style="background:#fffbea;border:1px solid #f59e0b;border-radius:6px;padding:12px 14px;font-size:12px;line-height:1.7;">
      <div style="font-size:11px;font-weight:bold;color:#92400e;text-transform:uppercase;margin-bottom:8px;">Điều khoản riêng / Thỏa thuận đặc biệt</div>
      <p style="margin:0;white-space:pre-wrap;color:#374151;word-break:break-word;overflow-wrap:anywhere;">{{custom.specialTerms}}</p>
    </div>
  </section>

  <div style="border-top:2px solid __PRIMARY__;padding-top:22px;">
    <div style="text-align:center;font-size:12px;color:#6b7280;margin-bottom:20px;font-style:italic;">Hai bên đã đọc kỹ, hiểu rõ và đồng ý với toàn bộ điều khoản hợp đồng.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;text-align:center;font-size:12px;">
      <div>
        <p style="font-weight:bold;color:__PRIMARY__;text-transform:uppercase;margin-bottom:4px;">BÊN A - BÊN CHO THUÊ</p>
        <p style="color:#9ca3af;font-size:11px;margin-bottom:52px;">(Ký, ghi rõ họ tên)</p>
        <p style="border-top:1px solid #333;padding-top:6px;font-weight:600;word-break:break-word;overflow-wrap:anywhere;">{{owner.name}}</p>
      </div>
      <div>
        <p style="font-weight:bold;color:__PRIMARY__;text-transform:uppercase;margin-bottom:4px;">BÊN B - BÊN THUÊ</p>
        <p style="color:#9ca3af;font-size:11px;margin-bottom:52px;">(Ký, ghi rõ họ tên)</p>
        <p style="border-top:1px solid #333;padding-top:6px;font-weight:600;word-break:break-word;overflow-wrap:anywhere;">{{tenant.name}}</p>
      </div>
    </div>
  </div>
</div></div></div>$$ AS template_html
)

INSERT INTO contract_templates (
  template_id,
  template_name,
  template_type,
  template_category,
  description,
  template_content,
  template_variables,
  default_terms,
  version,
  is_active,
  is_default,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  CONCAT('Hợp Đồng Thuê ', p.property_label, ' - ', t.type_label) AS template_name,
  t.template_type::"ContractTemplateType" AS template_type,
  p.property_type AS template_category,
  CONCAT('Mẫu hợp đồng thuê ', p.property_label, ' - ', t.type_description) AS description,
  replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(bt.template_html, '__BG_FROM__', p.bg_from),
                '__BG_TO__', p.bg_to
              ),
              '__PRIMARY__', p.primary_color
            ),
            '__SECONDARY__', p.secondary_color
          ),
          '__TITLE__', CONCAT('HỢP ĐỒNG THUÊ ', upper(p.property_label))
        ),
        '__TEMPLATE_BADGE__', t.template_badge
      ),
      '__SECTION_TITLE__', p.section_title
    ),
    '__PROPERTY_NAME_LABEL__', p.property_name_label
  ) AS template_content,
  '{"owner.name":"string","owner.phone":"string","owner.email":"string","owner.address":"string","owner.idNumber":"string","tenant.name":"string","tenant.phone":"string","tenant.email":"string","tenant.address":"string","tenant.idNumber":"string","property.name":"string","property.address":"string","property.type":"string","property.area":"number","contract.contractNumber":"string","contract.contractDate":"date","contract.location":"string","contract.startDate":"date","contract.endDate":"date","contract.durationMonths":"number","property.monthlyRent":"number","property.depositAmount":"number","property.electricityCostPerKwh":"number","property.waterCostPerM3":"number","property.internetFee":"number","property.managementFee":"number","property.parkingFee":"number","contract.paymentDueDay":"number","contract.lateFeePerDay":"number","contract.gracePeriodDays":"number","contract.autoRenewal":"boolean","contract.renewalNoticeDays":"number","contract.earlyTerminationFee":"number","custom.generalTerms":"string","custom.specialTerms":"string"}'::json AS template_variables,
  jsonb_build_object(
    -- Keep both prefixed and short keys for compatibility with current frontend mapping.
    'contract.paymentDueDay', CASE p.property_type
      WHEN 'room' THEN 3
      WHEN 'office' THEN 1
      ELSE 5
    END,
    'contract.gracePeriodDays', CASE p.property_type
      WHEN 'room' THEN GREATEST(2, t.grace_days - 1)
      WHEN 'office' THEN t.grace_days + 2
      ELSE t.grace_days
    END,
    'contract.lateFeePerDay', CASE p.property_type
      WHEN 'office' THEN t.late_fee_per_day + 70000
      WHEN 'land' THEN t.late_fee_per_day - 20000
      ELSE t.late_fee_per_day
    END,
    'contract.autoRenewal', t.auto_renewal,
    'contract.renewalNoticeDays', CASE p.property_type
      WHEN 'land' THEN t.renewal_notice_days + 15
      WHEN 'office' THEN t.renewal_notice_days + 10
      ELSE t.renewal_notice_days
    END,
    'contract.earlyTerminationFee', CASE p.property_type
      WHEN 'office' THEN t.early_termination_fee + 1000000
      WHEN 'room' THEN GREATEST(300000, t.early_termination_fee - 700000)
      ELSE t.early_termination_fee
    END,
    'custom.generalTerms', CASE p.property_type
      WHEN 'apartment' THEN 'Điều khoản 1: Bên thuê tuân thủ nội quy tòa nhà, quy định phòng cháy chữa cháy và quy trình sử dụng tiện ích chung.\nĐiều khoản 2: Bên thuê đăng ký cư trú cho người ở cùng theo quy định và chịu trách nhiệm với hành vi của người ở cùng.\nĐiều khoản 3: Không tự ý thay đổi hiện trạng căn hộ, lắp đặt thiết bị công suất lớn khi chưa có sự đồng ý bằng văn bản.\nĐiều khoản 4: Bên cho thuê phối hợp ban quản lý để đảm bảo quyền sử dụng hợp pháp, ổn định trong suốt thời hạn thuê.'
      WHEN 'house' THEN 'Điều khoản 1: Bên thuê sử dụng nhà đúng mục đích thuê, không cải tạo kết cấu chịu lực khi chưa có chấp thuận bằng văn bản.\nĐiều khoản 2: Bên thuê bảo quản hệ thống điện, nước, thiết bị bàn giao; thông báo hư hỏng trong vòng 24 giờ kể từ khi phát hiện.\nĐiều khoản 3: Bên cho thuê chịu trách nhiệm sửa chữa hư hỏng kết cấu chính không do lỗi bên thuê trong thời hạn hợp lý.\nĐiều khoản 4: Hai bên lập biên bản bàn giao và biên bản thanh lý để đối chiếu hiện trạng, công nợ và tài sản kèm theo.'
      WHEN 'land' THEN 'Điều khoản 1: Bên thuê sử dụng đất đúng mục đích đã thỏa thuận và phù hợp quy hoạch, pháp luật đất đai hiện hành.\nĐiều khoản 2: Không tự ý chuyển mục đích sử dụng, san lấp, xây dựng trái phép hoặc cho bên thứ ba sử dụng lại khi chưa được đồng ý.\nĐiều khoản 3: Bên thuê tự chịu trách nhiệm các thủ tục pháp lý phát sinh trong quá trình khai thác theo phạm vi cho phép.\nĐiều khoản 4: Khi kết thúc hợp đồng, bên thuê hoàn trả hiện trạng theo biên bản nghiệm thu hoặc thỏa thuận bổ sung đã ký.'
      WHEN 'office' THEN 'Điều khoản 1: Bên thuê chỉ dùng mặt bằng cho hoạt động văn phòng hợp pháp, không gây tiếng ồn, mùi hoặc rung chấn vượt chuẩn cho phép.\nĐiều khoản 2: Bên thuê tuân thủ quy định an toàn lao động, phòng cháy chữa cháy, an ninh trật tự và đăng ký ngành nghề kinh doanh.\nĐiều khoản 3: Bên cho thuê đảm bảo quyền khai thác sử dụng ổn định, liên tục trừ trường hợp bất khả kháng theo pháp luật.\nĐiều khoản 4: Hai bên phối hợp kiểm tra kỹ thuật định kỳ, xác nhận bằng biên bản để làm căn cứ bảo trì và quyết toán.'
      WHEN 'room' THEN 'Điều khoản 1: Bên thuê giữ vệ sinh phòng ở và khu vực chung, không gây ồn sau 22h và không tụ tập gây mất trật tự.\nĐiều khoản 2: Bên thuê thanh toán tiền thuê, điện, nước, dịch vụ đúng hạn; chậm thanh toán chịu phí theo hợp đồng.\nĐiều khoản 3: Không tự ý cho người khác ở ghép, nuôi vật nuôi hoặc thay đổi mục đích sử dụng phòng khi chưa được chấp thuận.\nĐiều khoản 4: Bên cho thuê đảm bảo điều kiện sinh hoạt cơ bản, xử lý sự cố điện nước hợp lý và hoàn trả cọc theo điều kiện thanh lý.'
      ELSE 'Hai bên tuân thủ đầy đủ các điều khoản đã thỏa thuận trong hợp đồng.'
    END,
    'custom.specialTerms', CASE t.template_type
      WHEN 'custom' THEN 'Điều khoản 1: Hai bên được bổ sung phụ lục về lịch thanh toán theo tuần/kỳ, phương thức nhắc hạn và mức ưu đãi thanh toán sớm.\nĐiều khoản 2: Danh mục tài sản bàn giao, chất lượng ban đầu, mức hao mòn chấp nhận được được mô tả chi tiết trong phụ lục đính kèm.\nĐiều khoản 3: Các thỏa thuận riêng về vật nuôi, người ở cùng, thời gian nhận - trả mặt bằng và điều kiện gia hạn được ưu tiên áp dụng nếu không trái pháp luật.\nĐiều khoản 4: Mọi điều chỉnh đơn giá hoặc phạm vi sử dụng phải được lập thành văn bản, có chữ ký xác nhận của cả hai bên.'
      WHEN 'government' THEN 'Điều khoản 1: Trường hợp pháp luật mới ban hành làm thay đổi quyền, nghĩa vụ của các bên thì áp dụng theo quy định mới và lập phụ lục điều chỉnh tương ứng.\nĐiều khoản 2: Tranh chấp phát sinh được ưu tiên thương lượng, hòa giải trong thời hạn thỏa thuận trước khi khởi kiện.\nĐiều khoản 3: Nếu hòa giải không thành, vụ việc được giải quyết tại cơ quan có thẩm quyền theo pháp luật tố tụng hiện hành.\nĐiều khoản 4: Nghĩa vụ thuế, phí, lệ phí và các khoản tài chính khác được thực hiện theo quy định của cơ quan nhà nước tại thời điểm phát sinh.'
      ELSE 'Điều khoản 1: Các nội dung chưa quy định trong hợp đồng này được áp dụng theo Bộ luật Dân sự và pháp luật chuyên ngành liên quan.\nĐiều khoản 2: Hai bên có nghĩa vụ hợp tác thiện chí, thông báo kịp thời bằng văn bản khi có sự kiện ảnh hưởng việc thực hiện hợp đồng.\nĐiều khoản 3: Việc sửa đổi, bổ sung chỉ có hiệu lực khi được lập thành văn bản và có chữ ký xác nhận của cả hai bên.\nĐiều khoản 4: Khi chấm dứt hợp đồng, hai bên lập biên bản thanh lý để xác nhận công nợ, hiện trạng tài sản và nghĩa vụ còn lại.'
    END,
    'paymentDueDay', CASE p.property_type
      WHEN 'room' THEN 3
      WHEN 'office' THEN 1
      ELSE 5
    END,
    'gracePeriodDays', CASE p.property_type
      WHEN 'room' THEN GREATEST(2, t.grace_days - 1)
      WHEN 'office' THEN t.grace_days + 2
      ELSE t.grace_days
    END,
    'lateFeePerDay', CASE p.property_type
      WHEN 'office' THEN t.late_fee_per_day + 70000
      WHEN 'land' THEN t.late_fee_per_day - 20000
      ELSE t.late_fee_per_day
    END,
    'autoRenewal', t.auto_renewal,
    'renewalNoticeDays', CASE p.property_type
      WHEN 'land' THEN t.renewal_notice_days + 15
      WHEN 'office' THEN t.renewal_notice_days + 10
      ELSE t.renewal_notice_days
    END,
    'earlyTerminationFee', CASE p.property_type
      WHEN 'office' THEN t.early_termination_fee + 1000000
      WHEN 'room' THEN GREATEST(300000, t.early_termination_fee - 700000)
      ELSE t.early_termination_fee
    END
  )::json AS default_terms,
  1 AS version,
  true AS is_active,
  false AS is_default,
  NOW() AS created_at,
  NOW() AS updated_at
FROM property_configs p
CROSS JOIN template_type_configs t
CROSS JOIN base_template bt
ORDER BY
  p.property_type,
  CASE t.template_type
    WHEN 'standard' THEN 1
    WHEN 'custom' THEN 2
    WHEN 'government' THEN 3
    ELSE 99
  END;

COMMIT;

-- Query kiem tra nhanh sau khi seed:
-- SELECT template_category, template_type, COUNT(*)
-- FROM contract_templates
-- WHERE description LIKE '[AUTO-GEN-15] %'
-- GROUP BY template_category, template_type
-- ORDER BY template_category, template_type;
