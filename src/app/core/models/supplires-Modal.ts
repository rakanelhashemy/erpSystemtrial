
export interface Supplier {
  id: string;
  code: string;
  name: string;
  address: string;
  notes: string;
  categoryName: string;
}
 
export interface ContactPerson {
  id: number; // 0 = new contact
  name: string;
  position: string;
  phone: string;
  email: string;
}
 
export interface SupplierDetail extends Supplier {
  categoryId: number;
  createdByName: string;
  updatedByName: string;
  contactPeople: ContactPerson[];
}
 
export interface SupplierRequest {
  name: string;
  address: string;
  notes: string;
  categoryId: number;
  contactPeople: ContactPerson[];
}
 
export interface SupplierFilterQuery {
  pageNumber: number;
  pageSize: number;
  search: string;
  address?: string;
  categoryId?: number | null;
}
 