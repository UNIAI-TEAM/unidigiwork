-- Cho phép kết quả công việc dạng bảng tính (SPREADSHEET) do AI dựng.
ALTER TABLE public.work_products DROP CONSTRAINT IF EXISTS work_products_business_type_check;
ALTER TABLE public.work_products
  ADD CONSTRAINT work_products_business_type_check
  CHECK (business_type IN ('PROPOSAL','REPORT','ANALYSIS','CONTRACT','PLAN','PRESENTATION','SPREADSHEET','MEMO','DOCUMENT','OTHER'));