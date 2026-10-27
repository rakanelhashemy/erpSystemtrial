import { FilterQuery } from "./general-model";

export interface Group {
  id: string;
  name: string;
  code: string;
  parentId?: string | null;
  createdByName?: string;
  updatedByName?: string;
}
 
export interface GroupRequest {
  name: string;
  parentId?: string | null;
}
 
export interface GroupFilterQuery extends FilterQuery {
  
  parentId?: string | null;
}
