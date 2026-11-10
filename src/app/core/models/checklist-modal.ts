export type CheckListStatus = 'Active' | 'Completed';

export interface CheckListAssignee {
  id: string;
  fullName: string;
}

export interface CheckList {
  id: string;
  title: string;
  status: CheckListStatus | string;
  auditDate: string;
  dateCreated: string;
  createdByName: string;
  assignees: CheckListAssignee[];
  canEdit: boolean;
  canExecute: boolean;
}

export interface CheckListDetail extends CheckList {
  businessId: string;
  businessName: string;
  locationId: string;
  locationName: string;
  groupId: string | null;
  groupName: string | null;
  completedAt: string | null;
  completedByName: string | null;
  rowVersion: string;
  hasResults: boolean;
  counts: { total: number; pending: number; checked: number; missing: number };
}

export interface CheckListPage {
  data: CheckList[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface CheckListFilterQuery {
  pageNumber: number;
  pageSize: number;
  search: string;
  status?: CheckListStatus | null;
}

export interface CheckListRequest {
  title: string;
  auditDate: string; // yyyy-MM-dd
  businessId: string;
  locationId: string;
  groupId: string | null; // null = all groups
  assigneeIds: string[];
  rowVersion?: string; // update only
}