import type {
  TaskDto,
  CreateTaskCommand,
  AssignTaskCommand,
  CompleteTaskCommand,
} from "@/contracts";
import type { TaskId } from "@/contracts";
import { ApiError } from "@/contracts/errors";
import { assertJavaConfigured, resolveBackendProvider } from "../core/provider";

export interface TaskApi {
  create(command: CreateTaskCommand): Promise<TaskDto>;
  assign(taskId: TaskId, command: AssignTaskCommand): Promise<TaskDto>;
  complete(taskId: TaskId, command: CompleteTaskCommand): Promise<TaskDto>;
}

// Task domain has no backend implementation yet (Phase 2). Fail-closed.
const lovableTaskApi: TaskApi = {
  async create() {
    throw new ApiError({
      code: "NOT_IMPLEMENTED",
      message: "Task backend is not implemented yet.",
    });
  },
  async assign() {
    throw new ApiError({
      code: "NOT_IMPLEMENTED",
      message: "Task backend is not implemented yet.",
    });
  },
  async complete() {
    throw new ApiError({
      code: "NOT_IMPLEMENTED",
      message: "Task backend is not implemented yet.",
    });
  },
};

export function resolveTaskApi(): TaskApi {
  const provider = resolveBackendProvider();
  if (provider === "lovable") return lovableTaskApi;
  return assertJavaConfigured();
}