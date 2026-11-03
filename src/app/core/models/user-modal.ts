export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: number;
  statusLabel: string;
  createdBy: string | null;
  lastUpdatedBy: string | null;
  roles: string[];
}

export interface UserDetail {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  status: number;
  statusLabel: string;
  createdByName: string | null;
  updatedByName: string | null;
  roles: string[];
  claims: string[]; // empty in the sample response; adjust once you share a populated one
  businessIds: string[];
  locationIds: string[];
}

export interface UserFilterQuery {
  pageNumber: number;
  pageSize: number;
  search: string;
}

export enum UserStatus {
  Active = 1,
  Invited = 2,
  Suspended = 3,
}

export const USER_STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: UserStatus.Active, label: 'Active' },
  { value: UserStatus.Invited, label: 'Invited' },
  { value: UserStatus.Suspended, label: 'Suspended' },
];


export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  roles: string[];
}
export interface UpdateProfileRequest {
  fullName: string;
  phone: string | null;
}

export interface InviteUserRequest {
  fullName: string;
  email: string;
  phone: string;
  roleIds: string[];
  userClaims: string[];
  businessIds: string[];
  locationIds: string[];
  frontendRegisterUrl: string;
}