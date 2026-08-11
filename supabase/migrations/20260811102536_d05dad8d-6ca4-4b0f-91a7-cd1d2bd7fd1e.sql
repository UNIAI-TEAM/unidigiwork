ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS price_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS price_currency text NOT NULL DEFAULT 'VND',
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS price_label text,
  ADD COLUMN IF NOT EXISTS price_unit_label text,
  ADD COLUMN IF NOT EXISTS tagline text,
  ADD COLUMN IF NOT EXISTS cta_label text,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

UPDATE public.plans SET
  price_amount = 0,
  price_label = 'Miễn phí',
  price_unit_label = NULL,
  tagline = 'Cho đội nhóm nhỏ bắt đầu thử nghiệm.',
  cta_label = 'Bắt đầu miễn phí',
  is_featured = false
WHERE code = 'free';

UPDATE public.plans SET
  price_amount = 120000,
  price_label = NULL,
  price_unit_label = '/ người / tháng',
  tagline = 'Cho doanh nghiệp vận hành toàn diện trên UNIWORK.',
  cta_label = 'Dùng thử 14 ngày',
  is_featured = true
WHERE code = 'pro';

UPDATE public.plans SET
  price_amount = NULL,
  price_label = 'Liên hệ',
  price_unit_label = NULL,
  tagline = 'Triển khai riêng, tuỳ chỉnh sâu cho tổ chức lớn.',
  cta_label = 'Đặt lịch demo',
  is_featured = false
WHERE code = 'business';