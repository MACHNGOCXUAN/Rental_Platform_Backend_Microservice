export enum UserRole {
  TENANT = 'TENANT',
  OWNER = 'OWNER',
  ADMIN = 'ADMIN'
} 

export interface IAuthUserPayload {
    id: string;
    role: UserRole;
}