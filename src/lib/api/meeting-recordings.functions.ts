// Batch LK-REC — ghi hình & thống kê phút họp. Thin wrapper: chỉ khai báo server fn.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureOk, mapPgError } from "./business.server";

export type MeetingRecordingDTO = {
  id: string;
  status: "starting" | "recording" | "completed" | "failed";
  provider: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  file_url: string | null;
  file_size_bytes: number | null;
  error_message: string | null;
};

export type MeetingAttendanceDTO = {
  id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  minutes: number;
};

export type MeetingStatsDTO = {
  meeting_id: string;
  status: string;
  total_participant_minutes: number;
  unique_participants: number;
  active_participants: number;
  recording_count: number;
  recording_seconds: number;
  is_recording: boolean;
  attendance: MeetingAttendanceDTO[];
  recordings: MeetingRecordingDTO[];
};

const meetingIdSchema = z.object({ meetingId: z.string().uuid() });

export const getMeetingStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => meetingIdSchema.parse(i))
  .handler(async ({ data, context }): Promise<MeetingStatsDTO> => {
    const { data: row, error } = await context.supabase.rpc("get_meeting_stats", {
      _meeting_id: data.meetingId,
    });
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return row as unknown as MeetingStatsDTO;
  });

export const startMeetingRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    meetingIdSchema
      .extend({
        idempotencyKey: z.string().min(8).max(200).optional(),
        correlationId: z.string().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("start_meeting_recording", {
      _meeting_id: data.meetingId,
      _idempotency_key: data.idempotencyKey ?? undefined,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND") as unknown as MeetingRecordingDTO;
  });

export const stopMeetingRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    meetingIdSchema
      .extend({
        fileUrl: z.string().url().max(2000).optional(),
        fileSizeBytes: z.number().int().min(0).optional(),
        idempotencyKey: z.string().min(8).max(200).optional(),
        correlationId: z.string().max(200).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const res = await context.supabase.rpc("stop_meeting_recording", {
      _meeting_id: data.meetingId,
      _file_url: data.fileUrl ?? undefined,
      _file_size_bytes: data.fileSizeBytes ?? undefined,
      _idempotency_key: data.idempotencyKey ?? undefined,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND") as unknown as MeetingRecordingDTO;
  });

export const openMeetingAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => meetingIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("open_meeting_attendance", {
      _meeting_id: data.meetingId,
    });
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return row as unknown as MeetingAttendanceDTO;
  });

export const closeMeetingAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => meetingIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("close_meeting_attendance", {
      _meeting_id: data.meetingId,
    });
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return (row ?? null) as unknown as MeetingAttendanceDTO | null;
  });
