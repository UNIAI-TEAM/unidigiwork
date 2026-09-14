-- Cho phép mỗi tổ chức chọn giờ chạy giao ban tự động (giờ Việt Nam, 0-23).
ALTER TABLE public.ceo_kpi_settings
  ADD COLUMN IF NOT EXISTS standup_hour_vn smallint NOT NULL DEFAULT 6;
ALTER TABLE public.ceo_kpi_settings
  DROP CONSTRAINT IF EXISTS ceo_kpi_settings_standup_hour_vn_check;
ALTER TABLE public.ceo_kpi_settings
  ADD CONSTRAINT ceo_kpi_settings_standup_hour_vn_check
  CHECK (standup_hour_vn BETWEEN 0 AND 23);