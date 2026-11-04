import { Paged } from "./general-model";


export interface DepreciationSummary {
  totalOriginalValue: number;
  totalAccumulatedDepreciation: number;
  totalBookValue: number;
  totalItems: number;
}

export interface DepreciationItemRow {
  id: string;
  itemName: string;
  code: string;
  serialNumber: string | null;
  groupId: string | null;
  groupName: string | null;
  locationId: string | null;
  locationName: string | null;
  originalValue: number;
  workingDate: string;
  depreciationRate: number;
  depreciationYears: number;
  depreciationEndDate: string;
  accumulatedDepreciation: number;
  bookValue: number;
}

export interface DepreciationGroupRow {
  groupId: string | null;
  groupName: string;
  itemsCount: number;
  originalValue: number;
  accumulatedDepreciation: number;
  bookValue: number;
}

interface DepreciationReportBase {
  asOfDate: string;
  defaultCurrency: string;
  summary: DepreciationSummary;
}

/** GET /DepreciationReport/Items → ApiResponse<DepreciationItemsReport> */
export interface DepreciationItemsReport extends DepreciationReportBase {
  items: Paged<DepreciationItemRow>;
}

/** GET /DepreciationReport/Groups → ApiResponse<DepreciationGroupsReport> */
export interface DepreciationGroupsReport extends DepreciationReportBase {
  groups: Paged<DepreciationGroupRow>;
}

/** Query params shared by both endpoints */
export interface DepreciationReportQuery {
  businessId: string;
  pageNumber: number;
  pageSize: number;
  asOfDate?: string;
  search?: string;
  fromPrice?: number | null;
  toPrice?: number | null;
  currencyId?: number | null;
  brandId?: number | null;
  modelId?: number | null;
  materialId?: number | null;
  countryId?: number | null;
  departmentId?: string | null;
  groupId?: string | null;
  locationId?: string | null;
  capacity?: string;
  fromWorkingDate?: string;
  toWorkingDate?: string;
  depreciationRate?: number | null;
  depreciationYears?: number | null;
  fromDepreciationDate?: string;
  toDepreciationDate?: string;
  scraping?: boolean | null;
  includeChildGroups?: boolean | null;
}