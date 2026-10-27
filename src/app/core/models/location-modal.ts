export interface LocationItem {
  id: string;
  name: string;
  code?: string;
  businessId?: string;
  parentId?: string | null;
  locationTypeId?: string | null;
  locationTypeName?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

export interface LocationFilterQuery {
  businessId: string;
  parentId: string | null;
  pageNumber: number;
  pageSize: number;
  search: string;
}

export interface LocationRequest {
  name: string;
  businessId: string;
  locationTypeId: string | null;
  parentId: string | null;
}