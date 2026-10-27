// department.models.ts
export interface Department {
  id: string;
  title: string;
  code: string;
}

export interface DepartmentDetails extends Department {
  createdByName: string | null;
  updatedByName: string | null;
}

export interface DepartmentRequest {
  title: string;
  parentId?: string | null;
}

export interface DepartmentFilterQuery {
  pageNumber: number;
  pageSize: number;
  search: string;
  parentId?: string | null;
}