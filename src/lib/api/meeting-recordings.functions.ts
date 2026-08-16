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
    const rec = ensureOk(res, "MEETING_NOT_FOUND") as unknown as MeetingRecordingDTO & {
      egress_id?: string | null;
      meeting_id?: string;
    };
    if (rec.egress_id) return rec; // đã có phiên ghi hình đang chạy

    const { readLiveKitConfig, startRoomCompositeEgress, egressIdOf } = await import("./livekit.server");
    const { readRecordingStorageConfig, recordingObjectKey } = await import("./recording-storage.server");
    const lk = readLiveKitConfig();
    const storage = readRecordingStorageConfig();
    if (!lk || !storage) return rec; // chưa cấu hình Egress ⇒ giữ hành vi ghi nhận metadata

    const key = recordingObjectKey(data.meetingId, rec.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const info = await startRoomCompositeEgress({
        config: lk,
        room: `mtg_${data.meetingId}`,
        filepath: key,
        s3: {
          endpoint: storage.endpoint,
          region: storage.region,
          bucket: storage.bucket,
          accessKeyId: storage.accessKeyId,
          secretAccessKey: storage.secretAccessKey,
          forcePathStyle: storage.forcePathStyle,
        },
      });
      const egressId = egressIdOf(info);
      if (!egressId) throw new Error("Egress không trả về mã phiên");
      const { data: updated } = await supabaseAdmin.rpc("attach_meeting_recording_egress", {
        _recording_id: rec.id,
        _egress_id: egressId,
      });
      return (updated ?? rec) as unknown as MeetingRecordingDTO;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.rpc("fail_meeting_recording", { _recording_id: rec.id, _error: message });
      throw new Error("MEETING_RECORDING_PROVIDER_ERROR");
    }
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
    const { data: active } = await context.supabase
      .from("meeting_recordings")
      .select("id, egress_id, status")
      .eq("meeting_id", data.meetingId)
      .in("status", ["starting", "recording"])
      .maybeSingle();

    if (active?.egress_id) {
      const { readLiveKitConfig, stopEgress } = await import("./livekit.server");
      const lk = readLiveKitConfig();
      if (lk) {
        try {
          await stopEgress(lk, `mtg_${data.meetingId}`, active.egress_id);
        } catch {
          // Egress có thể đã tự kết thúc; webhook sẽ chốt trạng thái file.
        }
      }
    }

    const res = await context.supabase.rpc("stop_meeting_recording", {
      _meeting_id: data.meetingId,
      _file_url: data.fileUrl ?? undefined,
      _file_size_bytes: data.fileSizeBytes ?? undefined,
      _idempotency_key: data.idempotencyKey ?? undefined,
      _correlation_id: data.correlationId ?? undefined,
    });
    return ensureOk(res, "MEETING_NOT_FOUND") as unknown as MeetingRecordingDTO;
  });

/** Link tải bản ghi có chữ ký, hết hạn sau 10 phút. */
export const getMeetingRecordingDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ recordingId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { data: row, error } = await context.supabase
      .from("meeting_recordings")
      .select("id, file_url")
      .eq("id", data.recordingId)
      .maybeSingle();
    if (error) mapPgError(error, "MEETING_RECORDING_NOT_FOUND");
    if (!row?.file_url) throw new Error("MEETING_RECORDING_FILE_NOT_READY");

    const { parseS3Url, presignGetUrl, readRecordingStorageConfig } = await import(
      "./recording-storage.server"
    );
    const parsed = parseS3Url(row.file_url);
    if (!parsed) return { url: row.file_url };
    const storage = readRecordingStorageConfig();
    if (!storage) throw new Error("MEETING_RECORDING_STORAGE_NOT_CONFIGURED");
    return { url: await presignGetUrl({ ...storage, bucket: parsed.bucket }, parsed.key) };
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

export type MeetingPresenceDTO = {
  userId: string;
  joinedAt: string;
  leftAt: string | null;
};

export const listMeetingAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => meetingIdSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("meeting_attendance")
      .select("user_id, joined_at, left_at")
      .eq("meeting_id", data.meetingId)
      .order("joined_at", { ascending: true });
    if (error) mapPgError(error, "MEETING_NOT_FOUND");
    return ((rows ?? []) as Array<{
      user_id: string;
      joined_at: string;
      left_at: string | null;
    }>).map((r) => ({
      userId: r.user_id,
      joinedAt: r.joined_at,
      leftAt: r.left_at,
    })) satisfies MeetingPresenceDTO[];
  });
