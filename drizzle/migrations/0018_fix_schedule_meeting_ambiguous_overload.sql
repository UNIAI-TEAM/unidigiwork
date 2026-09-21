-- Migration 20260920160000 tạo hai overload schedule_meeting có cùng tên tham số
-- và cùng số lượng tham số → PostgREST/Postgres không chọn được ứng viên
-- ("could not choose the best candidate function"), làm hỏng mọi lệnh tạo họp.
-- Giữ bản named-defaults (đúng thứ tự mà app và integration tests đang gọi),
-- bỏ bản positional thừa.
DROP FUNCTION IF EXISTS public.schedule_meeting(
  uuid, text, text, timestamptz, timestamptz, text, text, text, uuid[], text, text
);