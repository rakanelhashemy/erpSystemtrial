import { FilterQuery } from "./general-model";

export interface LocationType {
  id: string;
  name: string;
}

export interface LocationTypeRequest {
  name: string;
  businessId: string;
}

export interface LocationTypeFilterQuery extends FilterQuery {
  businessId: string;
}