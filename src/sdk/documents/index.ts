import type {
  DocumentDto,
  DocumentId,
  CreateDocumentCommand,
  UpdateDocumentCommand,
  DeleteDocumentCommand,
  WorkspaceId,
} from "@/contracts";
import { ApiError } from "@/contracts/errors";
import { assertJavaConfigured, resolveBackendProvider } from "../core/provider";

export interface DocumentApi {
  list(workspaceId: WorkspaceId): Promise<DocumentDto[]>;
  getById(id: DocumentId): Promise<DocumentDto>;
  create(command: CreateDocumentCommand): Promise<DocumentDto>;
  update(id: DocumentId, command: UpdateDocumentCommand): Promise<DocumentDto>;
  remove(id: DocumentId, command: DeleteDocumentCommand): Promise<void>;
}

// Phase 0: existing UI still uses direct Supabase reads for documents;
// see DIRECT_DATABASE_ACCESS_MANIFEST.md. Refactor scheduled for Phase 2.
const lovableDocumentApi: DocumentApi = {
  async list() {
    throw new ApiError({
      code: "NOT_IMPLEMENTED",
      message: "DocumentApi is deferred to Phase 2 refactor.",
    });
  },
  async getById() {
    throw new ApiError({ code: "NOT_IMPLEMENTED", message: "Deferred to Phase 2." });
  },
  async create() {
    throw new ApiError({ code: "NOT_IMPLEMENTED", message: "Deferred to Phase 2." });
  },
  async update() {
    throw new ApiError({ code: "NOT_IMPLEMENTED", message: "Deferred to Phase 2." });
  },
  async remove() {
    throw new ApiError({ code: "NOT_IMPLEMENTED", message: "Deferred to Phase 2." });
  },
};

export function resolveDocumentApi(): DocumentApi {
  const provider = resolveBackendProvider();
  if (provider === "lovable") return lovableDocumentApi;
  return assertJavaConfigured();
}
