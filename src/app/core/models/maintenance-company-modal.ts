export interface MaintenanceCompany {
  id: string;
  code: string;
  name: string;
  address: string | null;
  notes: string | null;
  specialtyId: number;
  specialtyName: string | null;
}
 
export interface ContactPerson {
  id: number;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
}
 
export interface MaintenanceCompanyDetail extends MaintenanceCompany {
  createdByName: string | null;
  updatedByName: string | null;
  contactPeople: ContactPerson[];
}
 
/** id = 0 for a new contact when updating; ignored on create */
export interface ContactPersonRequest {
  id: number;
  name: string;
  position: string;
  phone: string;
  email: string;
}
 
export interface MaintenanceCompanyRequest {
  name: string;
  address: string;
  notes: string;
  specialtyId: number | null;
  newSpecialtyName?: string | null;
  contactPeople: ContactPersonRequest[];
}
 
export interface MaintenanceCompanyFilterQuery {
  pageNumber: number;
  pageSize: number;
  search: string;
  address: string;
  specialtyId: number | null;
}
