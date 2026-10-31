import { FilterQuery } from "./general-model";

export interface LocationType {
  id: string;
  name: string;
}

export interface LocationTypeDetails extends LocationType {
  businessName?: string;
  createdByName?: string | null;
  updatedByName?: string | null;

}

export interface LocationTypeRequest {
  name: string;
  businessId: string;
}

export interface LocationTypeFilterQuery extends FilterQuery {
  businessId: string;
}