/**
 * HARDEN-SELLWORK-1 — NEGATIVE TESTS: tamper hợp đồng Work Product.
 *
 * Chạy THẬT các hàm runtime (`validateWorkProductExecution`,
 * `bindWorkProductExecution`, `loadWorkProduct*`) với Supabase giả lập ở mức
 * kết quả truy vấn, để chứng minh hành vi FAIL-CLOSED chứ không chỉ kiểm tra
 * mã nguồn tĩnh.
 *
 * Mọi kịch bản dưới đây mô phỏng một tác nhân cố tình can thiệp:
 *  - đổi phiên bản / mã hợp đồng giữa preflight và bind
 *  - dùng hợp đồng DRAFT / RETIRED
 *  - hạ ngưỡng chất lượng, xoá outcome, nới ngữ cảnh
 *  - tiêm input ngoài hợp đồng hoặc thuộc tổ chức khác
 *  - đổi nhân sự AI so với nhân sự bị ghim
 *  - RPC bind trả về dữ liệu dị dạng
 */
import { describe, it, expect } from "vitest";
import {
  bindWorkProductExecution,
  loadWorkProduct,
  loadWorkProductByTemplate,
  validateWorkProductExecution,
  type ExecutorCandidate,
} from "@/lib/api/work-products.server";
import type { WorkProductContract } from "@/domain/work-products/contracts";

/* ------------------------------ Fixtures ------------------------------ */

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const WS_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WS_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function contract(over: Partial<WorkProductContract> = {}): WorkProductContract {
  return {
    code: "MEETING_SUMMARY",
    version: 3,
    label: "Biên bản họp",
    description: null,
    objective: "Tóm tắt cuộc họp",
    category: "MEETING",
    status: "ACTIVE",
    templateCode: "SUMMARY_REPORT",
    deliverableType: "DOCUMENT",
    outcomeType: "DOCUMENT_ACCEPTED",
    slaMachineMs: 60_000,
    contractHash: "hash-v3",
    input: { required: ["meeting_id"], properties: { meeting_id: { type: "uuid", entityType: "MEETING" } } },
    context: { allowedEntityTypes: ["MEETING", "MEETING_ARTIFACT"], optionalEntityTypes: [], maxSources: 10 },
    executor: { requiredRole: "ANALYST", requiredSkills: ["SUMMARIZE"], pinnedWorkerId: null },
    action: { allowedActions: ["CREATE_DOCUMENT"], maxAutonomy: "PROPOSE_ONLY" },
    deliverable: { type: "DOCUMENT", requiredSections: ["Tóm tắt"] },
    acceptance: { mandatoryCriteria: ["Có mục hành động"] },
    quality: { minimumQualityScore: 70, requiredDimensions: ["GROUNDING"] },
    review: { policy: "HUMAN_REVIEW_REQUIRED" },
    sla: { machineDurationMs: 60_000, wallDurationMs: null },
    ...over,
  };
}

const worker = (over: Partial<ExecutorCandidate> = {}): ExecutorCandidate => ({
  id: UUID_B,
  code: "ANALYST",
  role: "ANALYST",
  skills: ["SUMMARIZE"],
  allowed_tools: ["CREATE_DOCUMENT"],
  status: "ACTIVE",
  tenant_id: TENANT_A,
  ...over,
});

/** Supabase giả lập: `rows` quyết định hàng mà RLS của actor "nhìn thấy". */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupa(opts: {
  entityRow?: Record<string, unknown> | null;
  contractRow?: Record<string, unknown> | null;
  rpc?: () => Promise<{ data: unknown; error: unknown }>;
  onRpc?: (name: string, args: unknown) => void;
}): any {
  const result = { data: opts.entityRow ?? null };
  const contractResult = { data: opts.contractRow ?? null };
  const leaf = (data: { data: Record<string, unknown> | null }) => ({
    maybeSingle: async () => data,
    eq: () => leaf(data),
    order: () => ({ limit: () => leaf(data) }),
    limit: () => leaf(data),
  });
  return {
    from: (table: string) => ({
      select: () => leaf(table === "work_units" ? contractResult : result),
    }),
    rpc: async (name: string, args: unknown) => {
      opts.onRpc?.(name, args);
      return opts.rpc ? await opts.rpc() : { data: null, error: null };
    },
  };
}

const codes = (p: { issues: { code: string }[] }) => p.issues.map((i) => i.code);

/* ------------------------- A. Tamper trạng thái/phiên bản ------------------------- */

describe("NEGATIVE — tamper trạng thái & phiên bản hợp đồng", () => {
  const base = {
    rawInputs: { meeting_id: UUID_A },
    worker: worker(),
    tenantId: TENANT_A,
    workspaceId: WS_A,
  };
  const supa = () => fakeSupa({ entityRow: { id: UUID_A, tenant_id: TENANT_A, workspace_id: WS_A } });

  it("hợp đồng DRAFT không thể chạy", async () => {
    const p = await validateWorkProductExecution({ ...base, supabase: supa(), contract: contract({ status: "DRAFT" }) });
    expect(p.ready).toBe(false);
    expect(codes(p)).toContain("WORK_PRODUCT_NOT_ACTIVE");
  });

  it("hợp đồng RETIRED / PAUSED không thể chạy", async () => {
    for (const status of ["RETIRED", "PAUSED"] as const) {
      const p = await validateWorkProductExecution({ ...base, supabase: supa(), contract: contract({ status }) });
      expect(p.ready, status).toBe(false);
      expect(codes(p)).toContain("WORK_PRODUCT_NOT_ACTIVE");
    }
  });

  it("phiên bản bị sửa thành 0 / âm / thập phân đều bị chặn", async () => {
    for (const version of [0, -1, 1.5]) {
      const p = await validateWorkProductExecution({ ...base, supabase: supa(), contract: contract({ version }) });
      expect(p.ready, String(version)).toBe(false);
      expect(codes(p)).toContain("INVALID_WORK_PRODUCT_VERSION");
    }
  });

  it("hạ ngưỡng chất lượng ra ngoài 0..100 bị chặn", async () => {
    for (const minimumQualityScore of [-5, 140]) {
      const p = await validateWorkProductExecution({
        ...base,
        supabase: supa(),
        contract: contract({ quality: { minimumQualityScore, requiredDimensions: [] } }),
      });
      expect(p.ready).toBe(false);
      expect(codes(p)).toContain("QUALITY_POLICY_INVALID");
    }
  });

  it("xoá outcome hoặc nới ngữ cảnh rỗng bị chặn", async () => {
    const p1 = await validateWorkProductExecution({ ...base, supabase: supa(), contract: contract({ outcomeType: "" }) });
    expect(codes(p1)).toContain("OUTCOME_POLICY_INVALID");
    const p2 = await validateWorkProductExecution({
      ...base,
      supabase: supa(),
      contract: contract({ context: { allowedEntityTypes: [], optionalEntityTypes: [], maxSources: null } }),
    });
    expect(codes(p2)).toContain("CONTEXT_POLICY_INVALID");
  });
});

/* ------------------------------ B. Tamper input ------------------------------ */

describe("NEGATIVE — tamper dữ liệu đầu vào", () => {
  const c = contract();

  it("input thuộc tổ chức khác bị từ chối (UNAUTHORIZED_INPUT)", async () => {
    const p = await validateWorkProductExecution({
      supabase: fakeSupa({ entityRow: { id: UUID_A, tenant_id: TENANT_B, workspace_id: WS_A } }),
      contract: c,
      rawInputs: { meeting_id: UUID_A },
      worker: worker(),
      tenantId: TENANT_A,
      workspaceId: WS_A,
    });
    expect(p.ready).toBe(false);
    expect(codes(p)).toContain("UNAUTHORIZED_INPUT");
  });

  it("input ngoài không gian làm việc bị từ chối", async () => {
    const p = await validateWorkProductExecution({
      supabase: fakeSupa({ entityRow: { id: UUID_A, tenant_id: TENANT_A, workspace_id: WS_B } }),
      contract: c,
      rawInputs: { meeting_id: UUID_A },
      worker: worker(),
      tenantId: TENANT_A,
      workspaceId: WS_A,
    });
    expect(codes(p)).toContain("UNAUTHORIZED_INPUT");
  });

  it("RLS không thấy hàng → coi như không có quyền, không phải 'bỏ qua'", async () => {
    const p = await validateWorkProductExecution({
      supabase: fakeSupa({ entityRow: null }),
      contract: c,
      rawInputs: { meeting_id: UUID_A },
      worker: worker(),
      tenantId: TENANT_A,
      workspaceId: WS_A,
    });
    expect(p.ready).toBe(false);
    expect(codes(p)).toContain("UNAUTHORIZED_INPUT");
  });

  it("khoá lạ do client tiêm bị loại khỏi input đã chuẩn hoá", async () => {
    const p = await validateWorkProductExecution({
      supabase: fakeSupa({ entityRow: { id: UUID_A, tenant_id: TENANT_A, workspace_id: WS_A } }),
      contract: c,
      rawInputs: {
        meeting_id: UUID_A,
        minimumQualityScore: 0,
        allowedActions: ["DELETE_DOCUMENT"],
        __proto__tamper: "x",
      },
      worker: worker(),
      tenantId: TENANT_A,
      workspaceId: WS_A,
    });
    expect(Object.keys(p.inputs)).toEqual(["meeting_id"]);
    expect(p.ready).toBe(true);
  });

  it("uuid dị dạng bị chặn INVALID_INPUT chứ không tự chuẩn hoá", async () => {
    const p = await validateWorkProductExecution({
      supabase: fakeSupa({ entityRow: { id: UUID_A, tenant_id: TENANT_A, workspace_id: WS_A } }),
      contract: c,
      rawInputs: { meeting_id: "' OR 1=1 --" },
      worker: worker(),
      tenantId: TENANT_A,
      workspaceId: WS_A,
    });
    expect(p.ready).toBe(false);
    expect(codes(p)).toEqual(expect.arrayContaining(["INVALID_INPUT", "MISSING_REQUIRED_INPUT"]));
  });

  it("thiếu input bắt buộc thì KHÔNG chạy bước uỷ quyền thực thể (không rò rỉ tồn tại)", async () => {
    const p = await validateWorkProductExecution({
      supabase: fakeSupa({ entityRow: { id: UUID_A, tenant_id: TENANT_B, workspace_id: WS_B } }),
      contract: c,
      rawInputs: {},
      worker: worker(),
      tenantId: TENANT_A,
      workspaceId: WS_A,
    });
    expect(codes(p)).toContain("MISSING_REQUIRED_INPUT");
    expect(codes(p)).not.toContain("UNAUTHORIZED_INPUT");
  });
});

/* ---------------------------- C. Tamper nhân sự AI ---------------------------- */

describe("NEGATIVE — tamper nhân sự thực thi", () => {
  const supa = () => fakeSupa({ entityRow: { id: UUID_A, tenant_id: TENANT_A, workspace_id: WS_A } });
  const base = { rawInputs: { meeting_id: UUID_A }, tenantId: TENANT_A, workspaceId: WS_A };

  it("đổi sang nhân sự khác khi hợp đồng ghim cứng → chặn", async () => {
    const p = await validateWorkProductExecution({
      ...base,
      supabase: supa(),
      contract: contract({ executor: { requiredRole: null, requiredSkills: [], pinnedWorkerId: UUID_A } }),
      worker: worker({ id: UUID_B }),
    });
    expect(p.ready).toBe(false);
    expect(codes(p)).toContain("NO_ELIGIBLE_EXECUTOR");
  });

  it("nhân sự tổ chức khác / ngừng hoạt động / thiếu kỹ năng đều chặn", async () => {
    const cases: Partial<ExecutorCandidate>[] = [
      { tenant_id: TENANT_B },
      { status: "SUSPENDED" },
      { skills: [] },
      { code: "WRITER", role: "WRITER" },
    ];
    for (const over of cases) {
      const p = await validateWorkProductExecution({ ...base, supabase: supa(), contract: contract(), worker: worker(over) });
      expect(p.ready, JSON.stringify(over)).toBe(false);
      expect(codes(p)).toContain("NO_ELIGIBLE_EXECUTOR");
    }
  });

  it("không có nhân sự nào → chặn thay vì chạy ẩn danh", async () => {
    const p = await validateWorkProductExecution({ ...base, supabase: supa(), contract: contract(), worker: null });
    expect(p.ready).toBe(false);
    expect(p.executorWorkerId).toBeNull();
  });
});

/* ------------------------- D. Tamper bản chụp hợp đồng ------------------------- */

describe("NEGATIVE — bindWorkProductExecution fail-closed ở runtime", () => {
  const c = contract();

  it("RPC lỗi → ném WORK_PRODUCT_BIND_FAILED", async () => {
    const supa = fakeSupa({ rpc: async () => ({ data: null, error: { message: "boom" } }) });
    await expect(bindWorkProductExecution(supa, UUID_A, c, {})).rejects.toThrow("WORK_PRODUCT_BIND_FAILED");
  });

  it("RPC trả null / dị dạng → ném WORK_PRODUCT_BIND_FAILED", async () => {
    for (const data of [null, undefined]) {
      const supa = fakeSupa({ rpc: async () => ({ data, error: null }) });
      await expect(bindWorkProductExecution(supa, UUID_A, c, {})).rejects.toThrow("WORK_PRODUCT_BIND_FAILED");
    }
  });

  it("bound=false không kèm ALREADY_BOUND → ném lỗi, không chạy tiếp", async () => {
    const supa = fakeSupa({ rpc: async () => ({ data: { bound: false, reason: "EXECUTION_NOT_FOUND" }, error: null }) });
    await expect(bindWorkProductExecution(supa, UUID_A, c, {})).rejects.toThrow("WORK_PRODUCT_BIND_FAILED");
  });

  it("bound=false, reason=null (dữ liệu bị cắt xén) vẫn ném lỗi", async () => {
    const supa = fakeSupa({ rpc: async () => ({ data: { bound: false }, error: null }) });
    await expect(bindWorkProductExecution(supa, UUID_A, c, {})).rejects.toThrow("WORK_PRODUCT_BIND_FAILED");
  });

  it("ALREADY_BOUND nhưng LỆCH PHIÊN BẢN → WORK_PRODUCT_CONTRACT_MISMATCH", async () => {
    const supa = fakeSupa({
      rpc: async () => ({
        data: { bound: false, reason: "ALREADY_BOUND", workUnitCode: c.code, workUnitVersion: c.version - 1 },
        error: null,
      }),
    });
    await expect(bindWorkProductExecution(supa, UUID_A, c, {})).rejects.toThrow("WORK_PRODUCT_CONTRACT_MISMATCH");
  });

  it("ALREADY_BOUND nhưng LỆCH MÃ SẢN PHẨM → WORK_PRODUCT_CONTRACT_MISMATCH", async () => {
    const supa = fakeSupa({
      rpc: async () => ({
        data: { bound: false, reason: "ALREADY_BOUND", workUnitCode: "OTHER_PRODUCT", workUnitVersion: c.version },
        error: null,
      }),
    });
    await expect(bindWorkProductExecution(supa, UUID_A, c, {})).rejects.toThrow("WORK_PRODUCT_CONTRACT_MISMATCH");
  });

  it("phiên bản trả về dạng chuỗi cũng phải so khớp số học, không so lỏng lẻo", async () => {
    const ok = fakeSupa({
      rpc: async () => ({
        data: { bound: false, reason: "ALREADY_BOUND", workUnitCode: c.code, workUnitVersion: String(c.version) },
        error: null,
      }),
    });
    await expect(bindWorkProductExecution(ok, UUID_A, c, {})).resolves.toMatchObject({ bound: false });

    const bad = fakeSupa({
      rpc: async () => ({
        data: { bound: false, reason: "ALREADY_BOUND", workUnitCode: c.code, workUnitVersion: "3x" },
        error: null,
      }),
    });
    await expect(bindWorkProductExecution(bad, UUID_A, c, {})).rejects.toThrow("WORK_PRODUCT_CONTRACT_MISMATCH");
  });

  it("ALREADY_BOUND đúng mã + phiên bản là idempotent hợp lệ", async () => {
    const supa = fakeSupa({
      rpc: async () => ({
        data: { bound: false, reason: "ALREADY_BOUND", workUnitCode: c.code, workUnitVersion: c.version, contractHash: "hash-v3" },
        error: null,
      }),
    });
    await expect(bindWorkProductExecution(supa, UUID_A, c, {})).resolves.toEqual({
      bound: false,
      reason: "ALREADY_BOUND",
      contractHash: "hash-v3",
    });
  });

  it("chỉ gửi code/version do server phân giải — client không chèn được hash hay tiêu chí", async () => {
    const seen: { name: string; args: Record<string, unknown> }[] = [];
    const supa = fakeSupa({
      onRpc: (name, args) => seen.push({ name, args: args as Record<string, unknown> }),
      rpc: async () => ({ data: { bound: true, reason: null, contractHash: "hash-v3" }, error: null }),
    });
    await bindWorkProductExecution(supa, UUID_A, c, { meeting_id: UUID_A });
    expect(seen).toHaveLength(1);
    expect(seen[0].name).toBe("bind_work_product_execution");
    expect(Object.keys(seen[0].args).sort()).toEqual(["_code", "_execution_id", "_inputs", "_version"]);
    expect(seen[0].args["_version"]).toBe(c.version);
    expect(seen[0].args["_code"]).toBe(c.code);
  });
});

/* ------------------------ E. Nguồn hợp đồng là database ------------------------ */

describe("NEGATIVE — hợp đồng luôn phân giải từ database", () => {
  it("không có hàng trong work_units → null, caller phải dừng chứ không tự dựng hợp đồng", async () => {
    const supa = fakeSupa({ contractRow: null });
    await expect(loadWorkProduct(supa, "MEETING_SUMMARY", 3)).resolves.toBeNull();
    await expect(loadWorkProductByTemplate(supa, "SUMMARY_REPORT")).resolves.toBeNull();
  });

  it("hàng DB thiếu trường chính sách → hợp đồng suy biến bị preflight chặn, không mặc định 'cho phép'", async () => {
    const supa = fakeSupa({ contractRow: { code: "X", version: 1, status: "ACTIVE" } });
    const c = await loadWorkProduct(supa, "X", 1);
    expect(c).not.toBeNull();
    const p = await validateWorkProductExecution({
      supabase: fakeSupa({ entityRow: null }),
      contract: c!,
      rawInputs: {},
      worker: worker(),
      tenantId: TENANT_A,
      workspaceId: WS_A,
    });
    expect(p.ready).toBe(false);
    expect(codes(p)).toEqual(expect.arrayContaining(["CONTEXT_POLICY_INVALID", "OUTCOME_POLICY_INVALID"]));
  });
});
