
export interface Employee {
  id: string;
  code: string;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  email: string | null;
  gender: number;
  active: boolean;
  departmentId: string;
  departmentName: string | null;
}
 
export interface EmployeeDetail extends Employee {
  createdByName: string | null;
  updatedByName: string | null;
}
 
export interface EmployeeRequest {
  name: string;
  jobTitle: string;
  phone: string;
  email: string;
  gender: number;
  active: boolean;
  departmentId: string;
}
 
export interface EmployeeFilterQuery {
  pageNumber: number;
  pageSize: number;
  search: string;
  departmentId: string | null;
  jobTitle: string;
  phone: string;
  email: string;
  active: boolean | null;
  gender: number | null;
}
 