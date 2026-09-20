export {
  WORK_PRODUCT_BUSINESS_TYPES,
  isWorkProductBusinessType,
  type WorkProductBusinessType,
  type WorkProductDescriptor,
  type WorkProductVersionDescriptor,
  type DocumentArtifactDescriptor,
} from "./types";
export {
  workProductFromRow,
  workProductVersionFromRow,
  documentFromRow,
  mergeMonotonicVersion,
  type WorkProductRow,
  type WorkProductVersionRow,
  type DocumentRow,
} from "./document-adapter";
